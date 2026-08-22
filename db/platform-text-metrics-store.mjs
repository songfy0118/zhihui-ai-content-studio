import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const REQUIRED_CHECKS = Object.freeze([
  "publishedPostUrlMatchesExternalPostId",
  "contentFingerprintMatchesConfirmedDraft",
  "sourceReferenceAndEvidenceFingerprintReviewed",
  "captureWindowAndCountersReviewed",
  "learningRemainsDisabledPendingSeparateReview",
]);

export const PLATFORM_TEXT_METRICS_SAVE_CONFIRMATION = "SAVE_VERIFIED_PLATFORM_METRICS";

export const INSPECT_PLATFORM_TEXT_METRIC_SQL = `SELECT
  id, idea_id, platform, views, likes, comments, shares, saves, followers,
  completion_rate, source_kind, external_post_id, captured_at, imported_at,
  content_fingerprint, published_post_url, published_at, source_reference,
  source_evidence_fingerprint
FROM metrics
WHERE platform = ? AND external_post_id = ? AND captured_at = ?`;

const INSERT_METRIC_SQL = `INSERT INTO metrics (
  id, idea_id, platform, views, likes, comments, shares, saves, followers,
  completion_rate, source_kind, external_post_id, captured_at, imported_at,
  content_fingerprint, published_post_url, published_at, source_reference,
  source_evidence_fingerprint, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_metrics_save_blocked",
    blockers: [],
    eligible: false,
    persisted: false,
    alreadyPersisted: false,
    metricSnapshotsCreated: 0,
    metricIds: [],
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
    learningUpdateEligible: false,
    learningWeightsUpdated: false,
    platformApiCalled: false,
    exportFileRead: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validateConfirmationReceipt(receipt, blockers) {
  if (
    receipt?.status !== "platform_text_metrics_import_review_confirmation_accepted"
    || !Array.isArray(receipt?.blockers)
    || receipt.blockers.length !== 0
    || !HASH.test(receipt?.sourceDraftSaveReviewConfirmationFingerprint ?? "")
    || !HASH.test(receipt?.confirmedMetricsImportPreviewFingerprint ?? "")
    || !HASH.test(receipt?.metricsImportReviewConfirmationFingerprint ?? "")
    || !Array.isArray(receipt?.confirmedMetricSnapshots)
    || receipt.confirmedMetricSnapshots.length < 1
    || receipt.confirmedMetricSnapshots.length > 2
    || receipt?.confirmedSnapshotCount !== receipt.confirmedMetricSnapshots.length
    || receipt?.humanMetricsReviewCompleted !== true
    || receipt?.verifiedMetricsConfirmedByHuman !== true
    || receipt?.eligibleForAuthorizedStorage !== true
    || receipt?.storageAuthorizationGranted !== false
    || receipt?.storageWritePerformed !== false
    || receipt?.learningUpdateEligible !== false
    || receipt?.learningUpdateAuthorizationGranted !== false
    || receipt?.learningWeightsUpdated !== false
    || receipt?.platformApiCalled !== false
    || receipt?.exportFileRead !== false
    || receipt?.databaseWrites !== false
    || receipt?.filesystemMutations !== false
    || receipt?.externalCalls !== false
    || receipt?.publishTriggered !== false
    || receipt?.businessResult !== false
  ) {
    blockers.push("platform_text_metrics_review_confirmation_not_ready");
    return;
  }

  let previousPlatformRank = -1;
  const dedupe = new Set();
  for (const snapshot of receipt.confirmedMetricSnapshots) {
    const platformRank = PLATFORM_ORDER.get(snapshot?.platform);
    const key = `${snapshot?.platform}:${snapshot?.externalPostId}:${snapshot?.capturedAt}`;
    if (
      platformRank <= previousPlatformRank
      || dedupe.has(key)
      || !HASH.test(snapshot?.contentFingerprint ?? "")
      || !HASH.test(snapshot?.sourceEvidenceFingerprint ?? "")
      || snapshot?.reviewDecision !== "confirmed_metric_snapshot_matches_published_post_and_source_evidence"
      || snapshot?.reviewConfirmationSource !== "human_visible_metrics_source_review"
      || snapshot?.reviewStatus !== "human_confirmed_real_metric_snapshot_not_persisted"
      || REQUIRED_CHECKS.some((check) => snapshot?.reviewChecks?.[check] !== true)
      || !Number.isSafeInteger(snapshot?.views)
      || snapshot.views < 0
      || !Number.isSafeInteger(snapshot?.likes)
      || snapshot.likes < 0
      || !Number.isSafeInteger(snapshot?.comments)
      || snapshot.comments < 0
      || !Number.isSafeInteger(snapshot?.shares)
      || snapshot.shares < 0
      || !Number.isSafeInteger(snapshot?.saves)
      || snapshot.saves < 0
      || !Number.isSafeInteger(snapshot?.followers)
      || snapshot.followers < 0
      || !Number.isFinite(snapshot?.completionRate)
      || snapshot?.importStatus !== "human_review_pending_not_persisted"
    ) blockers.push(`platform_text_metric_snapshot_invalid:${snapshot?.platform ?? "missing"}`);
    previousPlatformRank = platformRank;
    dedupe.add(key);
  }

  const confirmationPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: receipt.sourceDraftSaveReviewConfirmationFingerprint,
    metricsImportPreviewFingerprint: receipt.confirmedMetricsImportPreviewFingerprint,
    confirmedMetricSnapshots: receipt.confirmedMetricSnapshots,
  };
  if (hash(confirmationPayload) !== receipt.metricsImportReviewConfirmationFingerprint) {
    blockers.push("platform_text_metrics_review_confirmation_tampered");
  }
}

export function assessPlatformTextMetricsSaveRequest({
  confirmationReceipt,
  executeRequested = false,
  confirmation = null,
  authorizedReviewConfirmationFingerprint = null,
} = {}) {
  const blockers = [];
  validateConfirmationReceipt(confirmationReceipt, blockers);
  if (executeRequested !== true) blockers.push("platform_text_metrics_save_not_requested");
  if (confirmation !== PLATFORM_TEXT_METRICS_SAVE_CONFIRMATION) blockers.push("platform_text_metrics_save_confirmation_invalid");
  if (authorizedReviewConfirmationFingerprint !== confirmationReceipt?.metricsImportReviewConfirmationFingerprint) {
    blockers.push("platform_text_metrics_save_fingerprint_mismatch");
  }
  return safeResult({
    status: blockers.length ? "platform_text_metrics_save_blocked" : "platform_text_metrics_save_authorized",
    blockers: [...new Set(blockers)],
    eligible: blockers.length === 0,
    authorizedReviewConfirmationFingerprint: blockers.length ? null : authorizedReviewConfirmationFingerprint,
  });
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("platform_text_metrics_timestamp_invalid");
  return date.toISOString();
}

function metricId(snapshot) {
  return `metric_${hash({
    platform: snapshot.platform,
    externalPostId: snapshot.externalPostId,
    capturedAt: snapshot.capturedAt,
    sourceEvidenceFingerprint: snapshot.sourceEvidenceFingerprint,
  })}`;
}

function existingMatches(existing, snapshot, id) {
  return existing?.id === id
    && existing.idea_id === snapshot.ideaId
    && existing.platform === snapshot.platform
    && Number(existing.views) === snapshot.views
    && Number(existing.likes) === snapshot.likes
    && Number(existing.comments) === snapshot.comments
    && Number(existing.shares) === snapshot.shares
    && Number(existing.saves) === snapshot.saves
    && Number(existing.followers) === snapshot.followers
    && Number(existing.completion_rate) === snapshot.completionRate
    && existing.source_kind === snapshot.sourceKind
    && existing.external_post_id === snapshot.externalPostId
    && existing.captured_at === snapshot.capturedAt
    && existing.imported_at === snapshot.importedAt
    && existing.content_fingerprint === snapshot.contentFingerprint
    && existing.published_post_url === snapshot.publishedPostUrl
    && existing.published_at === snapshot.publishedAt
    && existing.source_reference === snapshot.sourceReference
    && existing.source_evidence_fingerprint === snapshot.sourceEvidenceFingerprint;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export function createPlatformTextMetricsStore(d1, { now = () => new Date() } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessPlatformTextMetricsSaveRequest(input);
      if (!gate.eligible) return gate;
      const snapshots = input.confirmationReceipt.confirmedMetricSnapshots;
      const metricIds = snapshots.map(metricId);
      const existingRows = await Promise.all(snapshots.map((snapshot) => d1
        .prepare(INSPECT_PLATFORM_TEXT_METRIC_SQL)
        .bind(snapshot.platform, snapshot.externalPostId, snapshot.capturedAt)
        .first()));
      const existingCount = existingRows.filter(Boolean).length;
      if (existingCount > 0) {
        const complete = existingCount === snapshots.length
          && existingRows.every((row, index) => existingMatches(row, snapshots[index], metricIds[index]));
        if (!complete) return safeResult({
          status: "platform_text_metrics_existing_snapshot_conflict",
          blockers: ["platform_text_metrics_existing_snapshot_conflict"],
        });
        return safeResult({
          status: "platform_text_metrics_already_persisted",
          eligible: true,
          alreadyPersisted: true,
          metricIds,
        });
      }

      let createdAt;
      try {
        createdAt = timestampFrom(now);
      } catch {
        return safeResult({ blockers: ["platform_text_metrics_timestamp_invalid"] });
      }
      const statements = snapshots.map((snapshot, index) => d1.prepare(INSERT_METRIC_SQL).bind(
        metricIds[index],
        snapshot.ideaId,
        snapshot.platform,
        snapshot.views,
        snapshot.likes,
        snapshot.comments,
        snapshot.shares,
        snapshot.saves,
        snapshot.followers,
        snapshot.completionRate,
        snapshot.sourceKind,
        snapshot.externalPostId,
        snapshot.capturedAt,
        snapshot.importedAt,
        snapshot.contentFingerprint,
        snapshot.publishedPostUrl,
        snapshot.publishedAt,
        snapshot.sourceReference,
        snapshot.sourceEvidenceFingerprint,
        createdAt,
      ));

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({
          status: "platform_text_metrics_atomic_batch_failed",
          blockers: ["platform_text_metrics_atomic_batch_failed"],
          databaseWriteAttempted: true,
        });
      } catch {
        return safeResult({
          status: "platform_text_metrics_atomic_batch_failed",
          blockers: ["platform_text_metrics_atomic_batch_failed"],
          databaseWriteAttempted: true,
        });
      }

      return safeResult({
        status: "platform_text_metrics_persisted",
        eligible: true,
        persisted: true,
        metricSnapshotsCreated: snapshots.length,
        metricIds,
        databaseWriteAttempted: true,
        databaseWrites: true,
      });
    },
  };
}
