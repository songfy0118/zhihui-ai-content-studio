import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});
const CONTRACT_CONSTRAINTS = Object.freeze({
  visibleBrowserOnly: true,
  sameVisiblePageAndAccountRequired: true,
  loginAllowed: false,
  fieldEditsAllowed: false,
  assetEditsAllowed: false,
  draftSaveAllowed: true,
  publishAllowed: false,
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

function safeInputs(authorization, execution) {
  const contract = authorization?.executionContract;
  const contractPayload = contract ? {
    authorizationPreviewFingerprint: contract.authorizationPreviewFingerprint,
    sourceContractFingerprint: contract.sourceContractFingerprint,
    sourceReviewConfirmationFingerprint: contract.sourceReviewConfirmationFingerprint,
    contractTargets: contract.contractTargets,
    constraints: contract.constraints,
  } : null;
  if (
    authorization?.status !== "platform_text_creator_draft_save_authorization_accepted"
    || authorization?.eligible !== true
    || authorization?.authorizationAccepted !== true
    || authorization?.authorizedPreviewFingerprint !== contract?.authorizationPreviewFingerprint
    || authorization?.draftSaveAuthorizationGranted !== true
    || authorization?.browserInteractionAllowedByContract !== true
    || authorization?.sameVisiblePageAndAccountRequiredByContract !== true
    || authorization?.fieldEditsAllowedByContract !== false
    || authorization?.assetEditsAllowedByContract !== false
    || authorization?.draftSaveAllowedByContract !== true
    || authorization?.publishAllowedByContract !== false
    || authorization?.browserInteractionPerformed !== false
    || authorization?.loginStateRead !== false
    || authorization?.loginTriggered !== false
    || authorization?.draftSaveTriggered !== false
    || authorization?.draftSaved !== false
    || authorization?.publishTriggered !== false
    || authorization?.databaseWrites !== false
    || authorization?.filesystemMutations !== false
    || authorization?.externalCalls !== false
    || authorization?.businessResult !== false
    || !contractPayload
    || contract?.status !== "authorized_not_executed"
    || !HASH.test(contract?.authorizationPreviewFingerprint ?? "")
    || !HASH.test(contract?.sourceContractFingerprint ?? "")
    || !HASH.test(contract?.sourceReviewConfirmationFingerprint ?? "")
    || JSON.stringify(contract?.constraints) !== JSON.stringify(CONTRACT_CONSTRAINTS)
    || !HASH.test(contract?.contractFingerprint ?? "")
    || hash(contractPayload) !== contract.contractFingerprint
    || !Array.isArray(contract?.contractTargets)
    || contract.contractTargets.length < 1
    || contract.contractTargets.length > 2
    || execution?.status !== "platform_text_creator_drafts_save_reported_not_published"
    || !Array.isArray(execution?.blockers)
    || execution.blockers.length !== 0
    || execution?.contractFingerprint !== contract.contractFingerprint
    || !Array.isArray(execution?.savedTargets)
    || execution.savedTargets.length !== contract.contractTargets.length
    || execution?.saveAttempts !== execution.savedTargets.length
    || execution?.savedCount !== execution.savedTargets.length
    || execution?.failedTarget !== null
    || execution?.allTargetsSaved !== true
    || execution?.browserInteractionPerformed !== true
    || execution?.sameVisiblePageAndAccountConfirmed !== true
    || execution?.loginStateRead !== false
    || execution?.loginTriggered !== false
    || execution?.fieldEditsTriggered !== false
    || execution?.assetEditsTriggered !== false
    || execution?.draftSaveTriggered !== true
    || execution?.draftSaved !== true
    || execution?.publishTriggered !== false
    || execution?.databaseWrites !== false
    || execution?.filesystemMutations !== false
    || execution?.externalCalls !== true
    || execution?.businessResult !== false
  ) return null;

  const targets = [];
  let previousPlatformRank = -1;
  for (const [index, contractTarget] of contract.contractTargets.entries()) {
    const savedTarget = execution.savedTargets[index];
    const platformRank = PLATFORM_ORDER.get(contractTarget?.platform);
    const identityLabel = safeText(contractTarget?.confirmedAccount?.identityLabel, 120);
    const accountHandle = contractTarget?.confirmedAccount?.accountHandle == null
      ? null
      : safeText(contractTarget.confirmedAccount.accountHandle, 120);
    const draftReference = safeText(savedTarget?.draftReference, 200);
    if (
      !CREATOR_ORIGINS[contractTarget?.platform]
      || platformRank <= previousPlatformRank
      || !sameOrigin(contractTarget?.pageUrl, CREATOR_ORIGINS[contractTarget.platform])
      || contractTarget?.operation !== "save_current_visible_creator_form_as_draft_only"
      || !identityLabel
      || identityLabel !== contractTarget.confirmedAccount.identityLabel
      || (contractTarget.confirmedAccount.accountHandle != null
        && (!accountHandle || accountHandle !== contractTarget.confirmedAccount.accountHandle))
      || !HASH.test(contractTarget?.expectedFieldFingerprint ?? "")
      || !Array.isArray(contractTarget?.expectedAssetFingerprints)
      || contractTarget.expectedAssetFingerprints.length < 1
      || contractTarget.expectedAssetFingerprints.length > 9
      || contractTarget.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || savedTarget?.platform !== contractTarget.platform
      || savedTarget?.status !== "draft_save_reported_visible_not_published"
      || !sameOrigin(savedTarget?.finalUrl, CREATOR_ORIGINS[contractTarget.platform])
      || !draftReference
      || draftReference !== savedTarget.draftReference
      || savedTarget?.fieldFingerprint !== contractTarget.expectedFieldFingerprint
      || JSON.stringify(savedTarget?.assetFingerprints) !== JSON.stringify(contractTarget.expectedAssetFingerprints)
      || savedTarget?.publishAllowed !== false
    ) return null;
    previousPlatformRank = platformRank;
    targets.push({ contractTarget, savedTarget });
  }
  return targets;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_draft_save_review_preview_blocked",
    blockers: [],
    sourceContractFingerprint: null,
    draftSaveReviewPreviewFingerprint: null,
    requiredConfirmation: null,
    reviewTargets: [],
    targetCount: 0,
    eligibleForHumanVisibleDraftReview: false,
    visibleHumanDraftReviewCompleted: false,
    draftReviewAccepted: false,
    browserInteractionPerformedByPreview: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggeredByPreview: false,
    draftSavedByPreview: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextCreatorDraftSaveReviewPreview({ authorization, execution } = {}) {
  const inputs = safeInputs(authorization, execution);
  if (!inputs) {
    return safeResult({ blockers: ["creator_draft_save_execution_invalid_incomplete_or_tampered"] });
  }

  const reviewTargets = inputs.map(({ contractTarget, savedTarget }) => ({
    platform: contractTarget.platform,
    pageUrl: savedTarget.finalUrl,
    confirmedAccount: {
      identityLabel: contractTarget.confirmedAccount.identityLabel,
      accountHandle: contractTarget.confirmedAccount.accountHandle ?? null,
    },
    draftReference: savedTarget.draftReference,
    expectedFieldFingerprint: contractTarget.expectedFieldFingerprint,
    expectedAssetFingerprints: [...contractTarget.expectedAssetFingerprints],
    requiredChecks: [...REQUIRED_CHECKS],
    reviewStatus: "human_visible_draft_review_pending",
  }));
  const fingerprintPayload = {
    sourceContractFingerprint: authorization.executionContract.contractFingerprint,
    reviewTargets,
  };
  const draftSaveReviewPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "platform_text_creator_saved_drafts_human_review_pending",
    sourceContractFingerprint: authorization.executionContract.contractFingerprint,
    draftSaveReviewPreviewFingerprint,
    requiredConfirmation: `REVIEW SAVED CREATOR DRAFTS ${draftSaveReviewPreviewFingerprint}`,
    reviewTargets,
    targetCount: reviewTargets.length,
    eligibleForHumanVisibleDraftReview: true,
  });
}
