import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});

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

function safeReviewConfirmation(value) {
  if (
    value?.status !== "platform_text_creator_form_fill_review_confirmation_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceContractFingerprint ?? "")
    || !HASH.test(value?.confirmedReviewPreviewFingerprint ?? "")
    || !HASH.test(value?.reviewConfirmationFingerprint ?? "")
    || !Array.isArray(value?.confirmedReviews)
    || value.confirmedReviews.length < 1
    || value.confirmedReviews.length > 2
    || value?.confirmedReviewCount !== value.confirmedReviews.length
    || value?.visibleHumanReviewCompleted !== true
    || value?.draftSaveAuthorizationPreviewEligible !== true
    || value?.draftSaveAuthorizationGranted !== false
    || value?.browserInteractionPerformedByGate !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggeredByGate !== false
    || value?.formFieldsFilledByGate !== false
    || value?.draftSaved !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const review of value.confirmedReviews) {
    const platformRank = PLATFORM_ORDER.get(review?.platform);
    const identityLabel = safeText(review?.confirmedAccount?.identityLabel, 120);
    const accountHandle = review?.confirmedAccount?.accountHandle == null
      ? null
      : safeText(review.confirmedAccount.accountHandle, 120);
    if (
      !CREATOR_ORIGINS[review?.platform]
      || seen.has(review.platform)
      || platformRank <= previousPlatformRank
      || !sameOrigin(review?.pageUrl, CREATOR_ORIGINS[review.platform])
      || !identityLabel
      || identityLabel !== review.confirmedAccount.identityLabel
      || (review.confirmedAccount.accountHandle != null && (!accountHandle || accountHandle !== review.confirmedAccount.accountHandle))
      || !HASH.test(review?.expectedFieldFingerprint ?? "")
      || !Array.isArray(review?.expectedAssetFingerprints)
      || review.expectedAssetFingerprints.length < 1
      || review.expectedAssetFingerprints.length > 9
      || review.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || review?.decision !== "confirmed_prefilled_form_matches_reviewed_inputs"
      || review?.confirmationSource !== "human_visible_creator_form_review"
      || review?.confirmationStatus !== "human_confirmed"
      || review?.checks?.visibleAccountMatchesConfirmedAccount !== true
      || review?.checks?.visibleTitleBodyCoverAndHashtagsMatchReviewedFields !== true
      || review?.checks?.visibleAssetsMatchReviewedAssetFingerprints !== true
      || review?.checks?.draftRemainsUnsaved !== true
      || review?.checks?.publicationRemainsUntriggered !== true
    ) return null;
    seen.add(review.platform);
    previousPlatformRank = platformRank;
  }

  const confirmationPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    reviewPreviewFingerprint: value.confirmedReviewPreviewFingerprint,
    confirmedReviews: value.confirmedReviews,
  };
  return hash(confirmationPayload) === value.reviewConfirmationFingerprint ? value.confirmedReviews : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_draft_save_authorization_preview_blocked",
    blockers: [],
    sourceContractFingerprint: null,
    sourceReviewConfirmationFingerprint: null,
    draftSaveAuthorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    saveTargets: [],
    targetCount: 0,
    eligibleForExplicitDraftSaveAuthorization: false,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextCreatorDraftSaveAuthorizationPreview(reviewConfirmation) {
  const confirmedReviews = safeReviewConfirmation(reviewConfirmation);
  if (!confirmedReviews) {
    return safeResult({ blockers: ["creator_form_fill_review_confirmation_invalid_or_tampered"] });
  }

  const saveTargets = confirmedReviews.map((review) => ({
    platform: review.platform,
    pageUrl: review.pageUrl,
    confirmedAccount: { ...review.confirmedAccount },
    expectedFieldFingerprint: review.expectedFieldFingerprint,
    expectedAssetFingerprints: [...review.expectedAssetFingerprints],
    operation: "save_current_visible_creator_form_as_draft_after_separate_authorization",
    targetStatus: "preview_only_not_authorized",
    requiresSameVisiblePageAndAccount: true,
    draftSaveAllowed: false,
    publishAllowed: false,
  }));
  const fingerprintPayload = {
    sourceContractFingerprint: reviewConfirmation.sourceContractFingerprint,
    sourceReviewConfirmationFingerprint: reviewConfirmation.reviewConfirmationFingerprint,
    saveTargets,
  };
  const draftSaveAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "platform_text_creator_draft_save_authorization_preview_ready",
    ...fingerprintPayload,
    draftSaveAuthorizationPreviewFingerprint,
    requiredConfirmation: `SAVE REVIEWED CREATOR DRAFTS ${draftSaveAuthorizationPreviewFingerprint}`,
    targetCount: saveTargets.length,
    eligibleForExplicitDraftSaveAuthorization: true,
  });
}
