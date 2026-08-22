import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});
const REQUIRED_CHECKS = Object.freeze([
  "visible_account_matches_confirmed_account",
  "draft_reference_matches_execution_result",
  "draft_is_visible_in_creator_draft_manager",
  "draft_content_and_assets_match_reviewed_fingerprints",
  "publication_remains_untriggered",
]);

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

function safeText(value, maximumLength) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function safePreview(value) {
  if (
    value?.status !== "platform_text_creator_saved_drafts_human_review_pending"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceContractFingerprint ?? "")
    || !HASH.test(value?.draftSaveReviewPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `REVIEW SAVED CREATOR DRAFTS ${value.draftSaveReviewPreviewFingerprint}`
    || !Array.isArray(value?.reviewTargets)
    || value.reviewTargets.length < 1
    || value.reviewTargets.length > 2
    || value?.targetCount !== value.reviewTargets.length
    || value?.eligibleForHumanVisibleDraftReview !== true
    || value?.visibleHumanDraftReviewCompleted !== false
    || value?.draftReviewAccepted !== false
    || value?.browserInteractionPerformedByPreview !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.draftSaveTriggeredByPreview !== false
    || value?.draftSavedByPreview !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const target of value.reviewTargets) {
    const platformRank = PLATFORM_ORDER.get(target?.platform);
    const identityLabel = safeText(target?.confirmedAccount?.identityLabel, 120);
    const accountHandle = target?.confirmedAccount?.accountHandle == null
      ? null
      : safeText(target.confirmedAccount.accountHandle, 120);
    const draftReference = safeText(target?.draftReference, 200);
    if (
      !CREATOR_ORIGINS[target?.platform]
      || seen.has(target.platform)
      || platformRank <= previousPlatformRank
      || !sameOrigin(target?.pageUrl, CREATOR_ORIGINS[target.platform])
      || !identityLabel
      || identityLabel !== target.confirmedAccount.identityLabel
      || (target.confirmedAccount.accountHandle != null
        && (!accountHandle || accountHandle !== target.confirmedAccount.accountHandle))
      || !draftReference
      || draftReference !== target.draftReference
      || !HASH.test(target?.expectedFieldFingerprint ?? "")
      || !Array.isArray(target?.expectedAssetFingerprints)
      || target.expectedAssetFingerprints.length < 1
      || target.expectedAssetFingerprints.length > 9
      || target.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || JSON.stringify(target?.requiredChecks) !== JSON.stringify(REQUIRED_CHECKS)
      || target?.reviewStatus !== "human_visible_draft_review_pending"
    ) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
  }

  const fingerprintPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    reviewTargets: value.reviewTargets,
  };
  return hash(fingerprintPayload) === value.draftSaveReviewPreviewFingerprint ? value.reviewTargets : null;
}

function safeDecisions(value, reviewTargets) {
  if (!Array.isArray(value) || value.length !== reviewTargets.length) return null;
  const confirmedDrafts = [];
  for (const [index, target] of reviewTargets.entries()) {
    const decision = value[index];
    const checks = decision?.checks;
    if (
      decision?.platform !== target.platform
      || decision?.decision !== "confirmed_saved_draft_matches_reviewed_inputs"
      || decision?.confirmationSource !== "human_visible_creator_draft_manager_review"
      || checks?.visibleAccountMatchesConfirmedAccount !== true
      || checks?.draftReferenceMatchesExecutionResult !== true
      || checks?.draftIsVisibleInCreatorDraftManager !== true
      || checks?.draftContentAndAssetsMatchReviewedFingerprints !== true
      || checks?.publicationRemainsUntriggered !== true
    ) return null;
    confirmedDrafts.push({
      platform: target.platform,
      pageUrl: target.pageUrl,
      confirmedAccount: { ...target.confirmedAccount },
      draftReference: target.draftReference,
      expectedFieldFingerprint: target.expectedFieldFingerprint,
      expectedAssetFingerprints: [...target.expectedAssetFingerprints],
      decision: decision.decision,
      confirmationSource: decision.confirmationSource,
      checks: { ...checks },
      confirmationStatus: "human_confirmed_saved_draft_visible_not_published",
    });
  }
  return confirmedDrafts;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_draft_save_review_confirmation_blocked",
    blockers: [],
    sourceContractFingerprint: null,
    confirmedReviewPreviewFingerprint: null,
    draftSaveReviewConfirmationFingerprint: null,
    confirmedDrafts: [],
    confirmedDraftCount: 0,
    visibleHumanDraftReviewCompleted: false,
    draftSaveVerifiedByHuman: false,
    manualPublishDecisionRequired: false,
    publicationAuthorizationGranted: false,
    browserInteractionPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggeredByGate: false,
    draftSavedByGate: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function assessPlatformTextCreatorDraftSaveReviewConfirmation({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedReviewPreviewFingerprint = null,
  decisions = null,
} = {}) {
  const blockers = [];
  const reviewTargets = safePreview(preview);
  if (!reviewTargets) blockers.push("creator_draft_save_review_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("creator_draft_save_review_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("creator_draft_save_review_confirmation_invalid");
  if (confirmedReviewPreviewFingerprint !== preview?.draftSaveReviewPreviewFingerprint) {
    blockers.push("creator_draft_save_review_preview_fingerprint_mismatch");
  }
  const confirmedDrafts = reviewTargets ? safeDecisions(decisions, reviewTargets) : null;
  if (!confirmedDrafts) blockers.push("creator_draft_save_review_decisions_invalid_or_incomplete");
  if (blockers.length || !confirmedDrafts) return safeResult({ blockers: [...new Set(blockers)] });

  const confirmationPayload = {
    sourceContractFingerprint: preview.sourceContractFingerprint,
    reviewPreviewFingerprint: preview.draftSaveReviewPreviewFingerprint,
    confirmedDrafts,
  };
  return safeResult({
    status: "platform_text_creator_draft_save_review_confirmation_accepted",
    sourceContractFingerprint: preview.sourceContractFingerprint,
    confirmedReviewPreviewFingerprint: preview.draftSaveReviewPreviewFingerprint,
    draftSaveReviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedDrafts,
    confirmedDraftCount: confirmedDrafts.length,
    visibleHumanDraftReviewCompleted: true,
    draftSaveVerifiedByHuman: true,
    manualPublishDecisionRequired: true,
  });
}
