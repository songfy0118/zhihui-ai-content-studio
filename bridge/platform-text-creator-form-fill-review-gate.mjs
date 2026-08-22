import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});
const REQUIRED_CHECKS = Object.freeze([
  "visible_account_matches_confirmed_account",
  "visible_title_body_cover_and_hashtags_match_reviewed_fields",
  "visible_assets_match_reviewed_asset_fingerprints",
  "draft_remains_unsaved",
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
    value?.status !== "platform_text_creator_form_fill_human_review_pending"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceContractFingerprint ?? "")
    || !HASH.test(value?.formFillReviewPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `REVIEW PREFILLED CREATOR FORMS ${value.formFillReviewPreviewFingerprint}`
    || !Array.isArray(value?.reviewTargets)
    || value.reviewTargets.length < 1
    || value.reviewTargets.length > 2
    || value?.targetCount !== value.reviewTargets.length
    || value?.eligibleForHumanVisibleReview !== true
    || value?.visibleHumanReviewCompleted !== false
    || value?.eligibleForDraftSaveAuthorization !== false
    || value?.draftSaveAuthorizationGranted !== false
    || value?.browserInteractionPerformedByPreview !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggeredByPreview !== false
    || value?.formFieldsFilledByPreview !== false
    || value?.draftSaved !== false
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
    if (
      !CREATOR_ORIGINS[target?.platform]
      || seen.has(target.platform)
      || platformRank <= previousPlatformRank
      || !sameOrigin(target?.pageUrl, CREATOR_ORIGINS[target.platform])
      || !identityLabel
      || identityLabel !== target.confirmedAccount.identityLabel
      || (target.confirmedAccount.accountHandle != null && (!accountHandle || accountHandle !== target.confirmedAccount.accountHandle))
      || !HASH.test(target?.expectedFieldFingerprint ?? "")
      || !safeText(target?.expectedTitle, 60)
      || !safeText(target?.expectedCoverText, 60)
      || !Array.isArray(target?.expectedHashtags)
      || target.expectedHashtags.length < 2
      || target.expectedHashtags.length > 8
      || target.expectedHashtags.some((hashtag) => !safeText(hashtag, 40))
      || !Array.isArray(target?.expectedAssetFingerprints)
      || target.expectedAssetFingerprints.length < 1
      || target.expectedAssetFingerprints.length > 9
      || target.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || target?.expectedAssetCount !== target.expectedAssetFingerprints.length
      || JSON.stringify(target?.requiredChecks) !== JSON.stringify(REQUIRED_CHECKS)
      || target?.reviewStatus !== "human_visible_review_pending"
    ) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
  }

  const fingerprintPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    reviewTargets: value.reviewTargets,
  };
  return hash(fingerprintPayload) === value.formFillReviewPreviewFingerprint ? value.reviewTargets : null;
}

function safeDecisions(value, reviewTargets) {
  if (!Array.isArray(value) || value.length !== reviewTargets.length) return null;
  const confirmedReviews = [];
  for (const [index, target] of reviewTargets.entries()) {
    const decision = value[index];
    const checks = decision?.checks;
    if (
      decision?.platform !== target.platform
      || decision?.decision !== "confirmed_prefilled_form_matches_reviewed_inputs"
      || decision?.confirmationSource !== "human_visible_creator_form_review"
      || checks?.visibleAccountMatchesConfirmedAccount !== true
      || checks?.visibleTitleBodyCoverAndHashtagsMatchReviewedFields !== true
      || checks?.visibleAssetsMatchReviewedAssetFingerprints !== true
      || checks?.draftRemainsUnsaved !== true
      || checks?.publicationRemainsUntriggered !== true
    ) return null;
    confirmedReviews.push({
      platform: target.platform,
      pageUrl: target.pageUrl,
      confirmedAccount: { ...target.confirmedAccount },
      expectedFieldFingerprint: target.expectedFieldFingerprint,
      expectedAssetFingerprints: [...target.expectedAssetFingerprints],
      decision: decision.decision,
      confirmationSource: decision.confirmationSource,
      checks: { ...checks },
      confirmationStatus: "human_confirmed",
    });
  }
  return confirmedReviews;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_form_fill_review_confirmation_blocked",
    blockers: [],
    sourceContractFingerprint: null,
    confirmedReviewPreviewFingerprint: null,
    reviewConfirmationFingerprint: null,
    confirmedReviews: [],
    confirmedReviewCount: 0,
    visibleHumanReviewCompleted: false,
    draftSaveAuthorizationPreviewEligible: false,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggeredByGate: false,
    formFieldsFilledByGate: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function assessPlatformTextCreatorFormFillReviewConfirmation({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedReviewPreviewFingerprint = null,
  decisions = null,
} = {}) {
  const blockers = [];
  const reviewTargets = safePreview(preview);
  if (!reviewTargets) blockers.push("creator_form_fill_review_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("creator_form_fill_review_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("creator_form_fill_review_confirmation_invalid");
  if (confirmedReviewPreviewFingerprint !== preview?.formFillReviewPreviewFingerprint) {
    blockers.push("creator_form_fill_review_preview_fingerprint_mismatch");
  }
  const confirmedReviews = reviewTargets ? safeDecisions(decisions, reviewTargets) : null;
  if (!confirmedReviews) blockers.push("creator_form_fill_review_decisions_invalid_or_incomplete");
  if (blockers.length || !confirmedReviews) return safeResult({ blockers: [...new Set(blockers)] });

  const confirmationPayload = {
    sourceContractFingerprint: preview.sourceContractFingerprint,
    reviewPreviewFingerprint: preview.formFillReviewPreviewFingerprint,
    confirmedReviews,
  };
  return safeResult({
    status: "platform_text_creator_form_fill_review_confirmation_accepted",
    sourceContractFingerprint: preview.sourceContractFingerprint,
    confirmedReviewPreviewFingerprint: preview.formFillReviewPreviewFingerprint,
    reviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedReviews,
    confirmedReviewCount: confirmedReviews.length,
    visibleHumanReviewCompleted: true,
    draftSaveAuthorizationPreviewEligible: true,
  });
}
