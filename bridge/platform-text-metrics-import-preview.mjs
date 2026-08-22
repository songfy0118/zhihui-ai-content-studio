import { createHash } from "node:crypto";

import { validateMetricProvenance } from "./metrics-provenance.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_SOURCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});
const PUBLIC_ORIGINS = Object.freeze({
  xiaohongshu: "https://www.xiaohongshu.com",
  douyin: "https://www.douyin.com",
});
const ALLOWED_SOURCES = Object.freeze(["platform_api", "platform_export"]);
const REQUIRED_COUNTERS = Object.freeze(["views", "likes", "comments", "shares", "saves"]);
const REQUIRED_STORAGE_EXTENSION = Object.freeze([
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
]);
const RECORD_KEYS = Object.freeze([
  "capturedAt",
  "comments",
  "completionRate",
  "contentFingerprint",
  "externalPostId",
  "followers",
  "ideaId",
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

function sameOrigin(url, expectedOrigin) {
  try {
    return new URL(url).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function safeText(value, maximumLength) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function safeDraftReviewConfirmation(value) {
  if (
    value?.status !== "platform_text_creator_draft_save_review_confirmation_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceContractFingerprint ?? "")
    || !HASH.test(value?.confirmedReviewPreviewFingerprint ?? "")
    || !HASH.test(value?.draftSaveReviewConfirmationFingerprint ?? "")
    || !Array.isArray(value?.confirmedDrafts)
    || value.confirmedDrafts.length < 1
    || value.confirmedDrafts.length > 2
    || value?.confirmedDraftCount !== value.confirmedDrafts.length
    || value?.visibleHumanDraftReviewCompleted !== true
    || value?.draftSaveVerifiedByHuman !== true
    || value?.manualPublishDecisionRequired !== true
    || value?.publicationAuthorizationGranted !== false
    || value?.browserInteractionPerformedByGate !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.draftSaveTriggeredByGate !== false
    || value?.draftSavedByGate !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
  ) return null;

  let previousPlatformRank = -1;
  for (const draft of value.confirmedDrafts) {
    const platformRank = PLATFORM_ORDER.get(draft?.platform);
    const identityLabel = safeText(draft?.confirmedAccount?.identityLabel, 120);
    const accountHandle = draft?.confirmedAccount?.accountHandle == null
      ? null
      : safeText(draft.confirmedAccount.accountHandle, 120);
    const draftReference = safeText(draft?.draftReference, 200);
    const checks = draft?.checks;
    if (
      !CREATOR_ORIGINS[draft?.platform]
      || platformRank <= previousPlatformRank
      || !sameOrigin(draft?.pageUrl, CREATOR_ORIGINS[draft.platform])
      || !identityLabel
      || identityLabel !== draft.confirmedAccount.identityLabel
      || (draft.confirmedAccount.accountHandle != null
        && (!accountHandle || accountHandle !== draft.confirmedAccount.accountHandle))
      || !draftReference
      || draftReference !== draft.draftReference
      || !HASH.test(draft?.expectedFieldFingerprint ?? "")
      || !Array.isArray(draft?.expectedAssetFingerprints)
      || draft.expectedAssetFingerprints.length < 1
      || draft.expectedAssetFingerprints.length > 9
      || draft.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || draft?.decision !== "confirmed_saved_draft_matches_reviewed_inputs"
      || draft?.confirmationSource !== "human_visible_creator_draft_manager_review"
      || checks?.visibleAccountMatchesConfirmedAccount !== true
      || checks?.draftReferenceMatchesExecutionResult !== true
      || checks?.draftIsVisibleInCreatorDraftManager !== true
      || checks?.draftContentAndAssetsMatchReviewedFingerprints !== true
      || checks?.publicationRemainsUntriggered !== true
      || draft?.confirmationStatus !== "human_confirmed_saved_draft_visible_not_published"
    ) return null;
    previousPlatformRank = platformRank;
  }

  const confirmationPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    reviewPreviewFingerprint: value.confirmedReviewPreviewFingerprint,
    confirmedDrafts: value.confirmedDrafts,
  };
  return hash(confirmationPayload) === value.draftSaveReviewConfirmationFingerprint
    ? value.confirmedDrafts
    : null;
}

function validPublicationUrl(platform, url, externalPostId) {
  try {
    const parsed = new URL(url);
    const expectedPath = platform === "xiaohongshu"
      ? `/explore/${externalPostId}`
      : `/video/${externalPostId}`;
    return parsed.origin === PUBLIC_ORIGINS[platform]
      && parsed.pathname === expectedPath
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function normalizeRecord(record, confirmedDraft, nowIso) {
  if (!record || JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(RECORD_KEYS)) return null;
  const publishedAt = strictIso(record.publishedAt);
  const capturedAt = strictIso(record.capturedAt);
  if (
    record.platform !== confirmedDraft.platform
    || !SAFE_ID.test(record.ideaId ?? "")
    || record.contentFingerprint !== confirmedDraft.expectedFieldFingerprint
    || !SAFE_ID.test(record.externalPostId ?? "")
    || !validPublicationUrl(record.platform, record.publishedPostUrl, record.externalPostId)
    || !publishedAt
    || !capturedAt
    || Date.parse(publishedAt) > Date.parse(capturedAt)
    || Date.parse(capturedAt) > Date.parse(nowIso)
    || !ALLOWED_SOURCES.includes(record.sourceKind)
    || !SAFE_SOURCE_REFERENCE.test(record.sourceReference ?? "")
    || !HASH.test(record.sourceEvidenceFingerprint ?? "")
    || REQUIRED_COUNTERS.some((counter) => !Number.isSafeInteger(record[counter]) || record[counter] < 0)
    || !Number.isSafeInteger(record.followers)
    || record.followers < 0
    || !Number.isFinite(record.completionRate)
    || !validateMetricProvenance(record).verified
  ) return null;
  return {
    ideaId: record.ideaId,
    platform: record.platform,
    contentFingerprint: record.contentFingerprint,
    externalPostId: record.externalPostId,
    publishedPostUrl: record.publishedPostUrl,
    publishedAt,
    capturedAt,
    sourceKind: record.sourceKind,
    sourceReference: record.sourceReference,
    sourceEvidenceFingerprint: record.sourceEvidenceFingerprint,
    views: record.views,
    likes: record.likes,
    comments: record.comments,
    shares: record.shares,
    saves: record.saves,
    followers: record.followers,
    completionRate: record.completionRate,
    importedAt: nowIso,
    importStatus: "human_review_pending_not_persisted",
  };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_metrics_import_preview_blocked",
    blockers: [],
    sourceDraftSaveReviewConfirmationFingerprint: null,
    metricsImportPreviewFingerprint: null,
    requiredConfirmation: null,
    metricSnapshots: [],
    snapshotCount: 0,
    realDataOnly: true,
    acceptedSources: [...ALLOWED_SOURCES],
    requiredStorageExtension: [...REQUIRED_STORAGE_EXTENSION],
    eligibleForHumanImportReview: false,
    humanImportReviewCompleted: false,
    storageAuthorizationGranted: false,
    learningUpdateEligible: false,
    platformApiCalled: false,
    exportFileRead: false,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextMetricsImportPreview({
  draftReviewConfirmation,
  records = [],
  now = null,
} = {}) {
  const blockers = [];
  const confirmedDrafts = safeDraftReviewConfirmation(draftReviewConfirmation);
  const nowIso = strictIso(now);
  if (!confirmedDrafts) blockers.push("draft_save_review_confirmation_invalid_or_tampered");
  if (!nowIso) blockers.push("metrics_import_preview_time_invalid");
  if (!Array.isArray(records) || records.length < 1 || records.length > (confirmedDrafts?.length ?? 0)) {
    blockers.push("metrics_import_records_invalid_or_incomplete");
  }

  const metricSnapshots = [];
  const seen = new Set();
  let previousPlatformRank = -1;
  if (confirmedDrafts && nowIso && Array.isArray(records)) {
    for (const record of records) {
      const platformRank = PLATFORM_ORDER.get(record?.platform);
      const confirmedDraft = confirmedDrafts.find((draft) => draft.platform === record?.platform);
      const normalized = confirmedDraft ? normalizeRecord(record, confirmedDraft, nowIso) : null;
      const dedupeKey = `${record?.platform}:${record?.externalPostId}:${record?.capturedAt}`;
      if (!normalized || platformRank <= previousPlatformRank || seen.has(dedupeKey)) {
        blockers.push("metrics_import_record_invalid_unverified_or_duplicate");
        break;
      }
      seen.add(dedupeKey);
      previousPlatformRank = platformRank;
      metricSnapshots.push(normalized);
    }
  }
  if (blockers.length || metricSnapshots.length !== records.length) {
    return safeResult({ blockers: [...new Set(blockers)] });
  }

  const fingerprintPayload = {
    sourceDraftSaveReviewConfirmationFingerprint: draftReviewConfirmation.draftSaveReviewConfirmationFingerprint,
    metricSnapshots,
    requiredStorageExtension: REQUIRED_STORAGE_EXTENSION,
  };
  const metricsImportPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "platform_text_metrics_import_human_review_pending",
    sourceDraftSaveReviewConfirmationFingerprint: draftReviewConfirmation.draftSaveReviewConfirmationFingerprint,
    metricsImportPreviewFingerprint,
    requiredConfirmation: `REVIEW VERIFIED METRICS IMPORT ${metricsImportPreviewFingerprint}`,
    metricSnapshots,
    snapshotCount: metricSnapshots.length,
    eligibleForHumanImportReview: true,
  });
}
