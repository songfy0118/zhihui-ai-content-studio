import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});
const CONTRACT_CONSTRAINTS = Object.freeze({
  visibleBrowserOnly: true,
  confirmedAccountMustRemainVisible: true,
  loginAllowed: false,
  reviewedAssetUploadAllowed: true,
  reviewedFieldFillAllowed: true,
  draftSaveAllowed: false,
  publishAllowed: false,
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

function safeInputs(authorization, execution) {
  const contract = authorization?.executionContract;
  const contractPayload = contract ? {
    authorizationPreviewFingerprint: contract.authorizationPreviewFingerprint,
    sourceDraftPackagePlanFingerprint: contract.sourceDraftPackagePlanFingerprint,
    sourceCreatorOpenContractFingerprint: contract.sourceCreatorOpenContractFingerprint,
    sourceAccountConfirmationFingerprint: contract.sourceAccountConfirmationFingerprint,
    contractTargets: contract.contractTargets,
    constraints: contract.constraints,
  } : null;
  if (
    authorization?.status !== "platform_text_creator_form_fill_authorization_accepted"
    || authorization?.eligible !== true
    || authorization?.authorizationAccepted !== true
    || authorization?.formFillAuthorizationGranted !== true
    || authorization?.browserInteractionAllowedByContract !== true
    || authorization?.reviewedAssetUploadAllowedByContract !== true
    || authorization?.reviewedFieldFillAllowedByContract !== true
    || authorization?.draftSaveAllowedByContract !== false
    || authorization?.publishAllowedByContract !== false
    || authorization?.browserInteractionPerformed !== false
    || authorization?.loginStateRead !== false
    || authorization?.loginTriggered !== false
    || authorization?.uploadTriggered !== false
    || authorization?.formFieldsFilled !== false
    || authorization?.draftSaved !== false
    || authorization?.publishTriggered !== false
    || authorization?.databaseWrites !== false
    || authorization?.filesystemMutations !== false
    || authorization?.externalCalls !== false
    || authorization?.businessResult !== false
    || !contractPayload
    || contract?.status !== "authorized_not_executed"
    || !HASH.test(contract?.authorizationPreviewFingerprint ?? "")
    || !HASH.test(contract?.sourceDraftPackagePlanFingerprint ?? "")
    || !HASH.test(contract?.sourceCreatorOpenContractFingerprint ?? "")
    || !HASH.test(contract?.sourceAccountConfirmationFingerprint ?? "")
    || JSON.stringify(contract?.constraints) !== JSON.stringify(CONTRACT_CONSTRAINTS)
    || !HASH.test(contract?.contractFingerprint ?? "")
    || hash(contractPayload) !== contract.contractFingerprint
    || !Array.isArray(contract?.contractTargets)
    || contract.contractTargets.length < 1
    || contract.contractTargets.length > 2
    || execution?.status !== "platform_text_creator_forms_prefilled_review_pending_not_saved"
    || !Array.isArray(execution?.blockers)
    || execution.blockers.length !== 0
    || execution?.contractFingerprint !== contract.contractFingerprint
    || !Array.isArray(execution?.prefilledTargets)
    || execution.prefilledTargets.length !== contract.contractTargets.length
    || execution?.prefilledCount !== execution.prefilledTargets.length
    || execution?.prefillAttempts !== execution.prefilledTargets.length
    || execution?.failedTarget !== null
    || execution?.allTargetsPrefilled !== true
    || execution?.browserInteractionPerformed !== true
    || execution?.accountIdentityRemainedVisible !== true
    || execution?.loginStateRead !== false
    || execution?.loginTriggered !== false
    || execution?.uploadTriggered !== true
    || execution?.formFieldsFilled !== true
    || execution?.draftSaved !== false
    || execution?.publishTriggered !== false
    || execution?.databaseWrites !== false
    || execution?.filesystemMutations !== false
    || execution?.externalCalls !== true
    || execution?.businessResult !== false
  ) return null;

  const targets = [];
  let previousPlatformRank = -1;
  for (const [index, contractTarget] of contract.contractTargets.entries()) {
    const resultTarget = execution.prefilledTargets[index];
    const platformRank = PLATFORM_ORDER.get(contractTarget?.platform);
    const assetFingerprints = contractTarget?.reviewedAssets?.map((asset) => asset?.svgFingerprint);
    if (
      !CREATOR_ORIGINS[contractTarget?.platform]
      || platformRank <= previousPlatformRank
      || !sameOrigin(contractTarget?.creatorEntryUrl, CREATOR_ORIGINS[contractTarget.platform])
      || !sameOrigin(contractTarget?.visiblePageUrl, CREATOR_ORIGINS[contractTarget.platform])
      || contractTarget?.operation !== "prefill_visible_creator_form_and_upload_reviewed_assets_only"
      || !contractTarget?.confirmedAccount?.identityLabel
      || contractTarget?.confirmedAccount?.identityConfirmationFingerprint !== contract.sourceAccountConfirmationFingerprint
      || !contractTarget?.exactReviewedFields
      || typeof contractTarget.exactReviewedFields.title !== "string"
      || typeof contractTarget.exactReviewedFields.coverText !== "string"
      || !Array.isArray(contractTarget.exactReviewedFields.hashtags)
      || !Array.isArray(contractTarget?.reviewedAssets)
      || contractTarget.reviewedAssets.length < 1
      || contractTarget?.reviewedAssetCount !== contractTarget.reviewedAssets.length
      || assetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || !HASH.test(contractTarget?.draftFingerprint ?? "")
      || !HASH.test(contractTarget?.draftReviewFingerprint ?? "")
      || !HASH.test(contractTarget?.visualReviewFingerprint ?? "")
      || resultTarget?.platform !== contractTarget.platform
      || resultTarget?.status !== "prefilled_visible_review_pending_not_saved"
      || !sameOrigin(resultTarget?.finalUrl, CREATOR_ORIGINS[contractTarget.platform])
      || resultTarget?.filledFieldFingerprint !== hash(contractTarget.exactReviewedFields)
      || JSON.stringify(resultTarget?.uploadedAssetFingerprints) !== JSON.stringify(assetFingerprints)
      || resultTarget?.reviewedAssetCount !== contractTarget.reviewedAssetCount
      || resultTarget?.saveDraftRequiredSeparateAuthorization !== true
    ) return null;
    previousPlatformRank = platformRank;
    targets.push({ contractTarget, resultTarget, assetFingerprints });
  }
  return targets;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_form_fill_review_preview_blocked",
    blockers: [],
    sourceContractFingerprint: null,
    formFillReviewPreviewFingerprint: null,
    requiredConfirmation: null,
    reviewTargets: [],
    targetCount: 0,
    eligibleForHumanVisibleReview: false,
    visibleHumanReviewCompleted: false,
    eligibleForDraftSaveAuthorization: false,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformedByPreview: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggeredByPreview: false,
    formFieldsFilledByPreview: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextCreatorFormFillReviewPreview({ authorization, execution } = {}) {
  const inputs = safeInputs(authorization, execution);
  if (!inputs) {
    return safeResult({ blockers: ["creator_form_fill_execution_invalid_incomplete_or_tampered"] });
  }

  const reviewTargets = inputs.map(({ contractTarget, resultTarget, assetFingerprints }) => ({
    platform: contractTarget.platform,
    pageUrl: resultTarget.finalUrl,
    confirmedAccount: {
      identityLabel: contractTarget.confirmedAccount.identityLabel,
      accountHandle: contractTarget.confirmedAccount.accountHandle ?? null,
    },
    expectedFieldFingerprint: resultTarget.filledFieldFingerprint,
    expectedTitle: contractTarget.exactReviewedFields.title,
    expectedCoverText: contractTarget.exactReviewedFields.coverText,
    expectedHashtags: [...contractTarget.exactReviewedFields.hashtags],
    expectedAssetFingerprints: [...assetFingerprints],
    expectedAssetCount: contractTarget.reviewedAssetCount,
    requiredChecks: [
      "visible_account_matches_confirmed_account",
      "visible_title_body_cover_and_hashtags_match_reviewed_fields",
      "visible_assets_match_reviewed_asset_fingerprints",
      "draft_remains_unsaved",
      "publication_remains_untriggered",
    ],
    reviewStatus: "human_visible_review_pending",
  }));
  const fingerprintPayload = {
    sourceContractFingerprint: authorization.executionContract.contractFingerprint,
    reviewTargets,
  };
  const formFillReviewPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "platform_text_creator_form_fill_human_review_pending",
    sourceContractFingerprint: authorization.executionContract.contractFingerprint,
    formFillReviewPreviewFingerprint,
    requiredConfirmation: `REVIEW PREFILLED CREATOR FORMS ${formFillReviewPreviewFingerprint}`,
    reviewTargets,
    targetCount: reviewTargets.length,
    eligibleForHumanVisibleReview: true,
  });
}
