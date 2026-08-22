import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_SOURCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const PUBLIC_ORIGINS = Object.freeze({
  xiaohongshu: "https://www.xiaohongshu.com",
  douyin: "https://www.douyin.com",
});
const ALLOWED_SOURCES = Object.freeze(["platform_api", "platform_export"]);
const REQUIRED_STORAGE_EXTENSION = Object.freeze([
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
]);
const REQUIRED_COUNTERS = Object.freeze(["views", "likes", "comments", "shares", "saves"]);
const SNAPSHOT_KEYS = Object.freeze([
  "capturedAt",
  "comments",
  "completionRate",
  "contentFingerprint",
  "externalPostId",
  "followers",
  "ideaId",
  "importStatus",
  "importedAt",
  "likes",
  "platform",
  "publishedAt",
  "publishedPostUrl",
  "saves",
  "shares",
  "sourceEvidenceFingerprint",
  "sourceKind",
  "sourceReference",
  "views",
].sort());

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function validPublicationUrl(platform, url, externalPostId) {
  try {
    const parsed = new URL(url);
    const expectedPath = platform === "xiaohongshu" ? `/explore/${externalPostId}` : `/video/${externalPostId}`;
    return parsed.origin === PUBLIC_ORIGINS[platform] && parsed.pathname === expectedPath && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

function validSnapshot(snapshot) {
  const publishedAt = strictIso(snapshot?.publishedAt);
  const capturedAt = strictIso(snapshot?.capturedAt);
  const importedAt = strictIso(snapshot?.importedAt);
  return (
    JSON.stringify(Object.keys(snapshot ?? {}).sort()) === JSON.stringify(SNAPSHOT_KEYS)
    && PLATFORM_ORDER.has(snapshot.platform)
    && SAFE_ID.test(snapshot.ideaId ?? "")
    && HASH.test(snapshot.contentFingerprint ?? "")
    && SAFE_ID.test(snapshot.externalPostId ?? "")
    && validPublicationUrl(snapshot.platform, snapshot.publishedPostUrl, snapshot.externalPostId)
    && publishedAt
    && capturedAt
    && importedAt
    && Date.parse(publishedAt) <= Date.parse(capturedAt)
    && Date.parse(capturedAt) <= Date.parse(importedAt)
    && ALLOWED_SOURCES.includes(snapshot.sourceKind)
    && SAFE_SOURCE_REFERENCE.test(snapshot.sourceReference ?? "")
    && HASH.test(snapshot.sourceEvidenceFingerprint ?? "")
    && REQUIRED_COUNTERS.every((counter) => Number.isSafeInteger(snapshot[counter]) && snapshot[counter] >= 0)
    && Number.isSafeInteger(snapshot.followers)
    && snapshot.followers >= 0
    && Number.isFinite(snapshot.completionRate)
    && snapshot.importStatus === "human_review_pending_not_persisted"
  );
}

function safePreview(value) {
  if (
    value?.status !== "platform_text_metrics_import_human_review_pending"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceDraftSaveReviewConfirmationFingerprint ?? "")
    || !HASH.test(value?.metricsImportPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `REVIEW VERIFIED METRICS IMPORT ${value.metricsImportPreviewFingerprint}`
    || !Array.isArray(value?.metricSnapshots)
    || value.metricSnapshots.length < 1
    || value.metricSnapshots.length > 2
    || value?.snapshotCount !== value.metricSnapshots.length
    || value?.realDataOnly !== true
    || JSON.stringify(value?.acceptedSources) !== JSON.stringify(ALLOWED_SOURCES)
    || JSON.stringify(value?.requiredStorageExtension) !== JSON.stringify(REQUIRED_STORAGE_EXTENSION)
    || value?.eligibleForHumanImportReview !== true
    || value?.humanImportReviewCompleted !== false
    || value?.storageAuthorizationGranted !== false
    || value?.learningUpdateEligible !== false
    || value?.platformApiCalled !== false
    || value?.exportFileRead !== false
    || value?.databaseWrites !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  let previousPlatformRank = -1;
  const seen = new Set();
  for (const snapshot of value.metricSnapshots) {
    const platformRank = PLATFORM_ORDER.get(snapshot?.platform);
    const dedupeKey = `${snapshot?.platform}:${snapshot?.externalPostId}:${snapshot?.capturedAt}`;
    if (!validSnapshot(snapshot) || platformRank <= previousPlatformRank || seen.has(dedupeKey)) return null;
    previousPlatformRank = platformRank;
    seen.add(dedupeKey);
  }
  const fingerprintPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: value.sourceDraftSaveReviewConfirmationFingerprint,
    metricSnapshots: value.metricSnapshots,
    requiredStorageExtension: REQUIRED_STORAGE_EXTENSION,
  };
  return hash(fingerprintPayload) === value.metricsImportPreviewFingerprint ? value.metricSnapshots : null;
}

function safeDecisions(value, metricSnapshots) {
  if (!Array.isArray(value) || value.length !== metricSnapshots.length) return null;
  const confirmedMetricSnapshots = [];
  for (const [index, snapshot] of metricSnapshots.entries()) {
    const decision = value[index];
    const checks = decision?.checks;
    if (
      decision?.platform !== snapshot.platform
      || decision?.externalPostId !== snapshot.externalPostId
      || decision?.capturedAt !== snapshot.capturedAt
      || decision?.sourceEvidenceFingerprint !== snapshot.sourceEvidenceFingerprint
      || decision?.decision !== "confirmed_metric_snapshot_matches_published_post_and_source_evidence"
      || decision?.confirmationSource !== "human_visible_metrics_source_review"
      || checks?.publishedPostUrlMatchesExternalPostId !== true
      || checks?.contentFingerprintMatchesConfirmedDraft !== true
      || checks?.sourceReferenceAndEvidenceFingerprintReviewed !== true
      || checks?.captureWindowAndCountersReviewed !== true
      || checks?.learningRemainsDisabledPendingSeparateReview !== true
    ) return null;
    confirmedMetricSnapshots.push({
      ...snapshot,
      reviewDecision: decision.decision,
      reviewConfirmationSource: decision.confirmationSource,
      reviewChecks: { ...checks },
      reviewStatus: "human_confirmed_real_metric_snapshot_not_persisted",
    });
  }
  return confirmedMetricSnapshots;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_metrics_import_review_confirmation_blocked",
    blockers: [],
    sourceDraftSaveReviewConfirmationFingerprint: null,
    confirmedMetricsImportPreviewFingerprint: null,
    metricsImportReviewConfirmationFingerprint: null,
    confirmedMetricSnapshots: [],
    confirmedSnapshotCount: 0,
    humanMetricsReviewCompleted: false,
    verifiedMetricsConfirmedByHuman: false,
    eligibleForAuthorizedStorage: false,
    storageAuthorizationGranted: false,
    storageWritePerformed: false,
    learningUpdateEligible: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    platformApiCalled: false,
    exportFileRead: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function assessPlatformTextMetricsImportReviewConfirmation({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedMetricsImportPreviewFingerprint = null,
  decisions = null,
} = {}) {
  const blockers = [];
  const metricSnapshots = safePreview(preview);
  if (!metricSnapshots) blockers.push("metrics_import_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("metrics_import_review_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("metrics_import_review_confirmation_invalid");
  if (confirmedMetricsImportPreviewFingerprint !== preview?.metricsImportPreviewFingerprint) {
    blockers.push("metrics_import_preview_fingerprint_mismatch");
  }
  const confirmedMetricSnapshots = metricSnapshots ? safeDecisions(decisions, metricSnapshots) : null;
  if (!confirmedMetricSnapshots) blockers.push("metrics_import_review_decisions_invalid_or_incomplete");
  if (blockers.length || !confirmedMetricSnapshots) return safeResult({ blockers: [...new Set(blockers)] });

  const confirmationPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: preview.sourceDraftSaveReviewConfirmationFingerprint,
    metricsImportPreviewFingerprint: preview.metricsImportPreviewFingerprint,
    confirmedMetricSnapshots,
  };
  return safeResult({
    status: "platform_text_metrics_import_review_confirmation_accepted",
    sourceDraftSaveReviewConfirmationFingerprint: preview.sourceDraftSaveReviewConfirmationFingerprint,
    confirmedMetricsImportPreviewFingerprint: preview.metricsImportPreviewFingerprint,
    metricsImportReviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedMetricSnapshots,
    confirmedSnapshotCount: confirmedMetricSnapshots.length,
    humanMetricsReviewCompleted: true,
    verifiedMetricsConfirmedByHuman: true,
    eligibleForAuthorizedStorage: true,
  });
}
