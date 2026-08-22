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

function safePreview(value) {
  if (
    value?.status !== "platform_text_creator_draft_save_authorization_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceContractFingerprint ?? "")
    || !HASH.test(value?.sourceReviewConfirmationFingerprint ?? "")
    || !HASH.test(value?.draftSaveAuthorizationPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `SAVE REVIEWED CREATOR DRAFTS ${value.draftSaveAuthorizationPreviewFingerprint}`
    || !Array.isArray(value?.saveTargets)
    || value.saveTargets.length < 1
    || value.saveTargets.length > 2
    || value?.targetCount !== value.saveTargets.length
    || value?.eligibleForExplicitDraftSaveAuthorization !== true
    || value?.draftSaveAuthorizationGranted !== false
    || value?.browserInteractionPerformed !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.draftSaveTriggered !== false
    || value?.draftSaved !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const target of value.saveTargets) {
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
      || !Array.isArray(target?.expectedAssetFingerprints)
      || target.expectedAssetFingerprints.length < 1
      || target.expectedAssetFingerprints.length > 9
      || target.expectedAssetFingerprints.some((fingerprint) => !HASH.test(fingerprint ?? ""))
      || target?.operation !== "save_current_visible_creator_form_as_draft_after_separate_authorization"
      || target?.targetStatus !== "preview_only_not_authorized"
      || target?.requiresSameVisiblePageAndAccount !== true
      || target?.draftSaveAllowed !== false
      || target?.publishAllowed !== false
    ) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
  }

  const fingerprintPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    sourceReviewConfirmationFingerprint: value.sourceReviewConfirmationFingerprint,
    saveTargets: value.saveTargets,
  };
  return hash(fingerprintPayload) === value.draftSaveAuthorizationPreviewFingerprint ? value.saveTargets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_draft_save_authorization_blocked",
    blockers: [],
    eligible: false,
    authorizationAccepted: false,
    authorizedPreviewFingerprint: null,
    executionContract: null,
    draftSaveAuthorizationGranted: false,
    browserInteractionAllowedByContract: false,
    sameVisiblePageAndAccountRequiredByContract: true,
    fieldEditsAllowedByContract: false,
    assetEditsAllowedByContract: false,
    draftSaveAllowedByContract: false,
    publishAllowedByContract: false,
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

export function assessPlatformTextCreatorDraftSaveAuthorization({
  preview,
  saveRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
} = {}) {
  const blockers = [];
  const targets = safePreview(preview);
  if (!targets) blockers.push("creator_draft_save_authorization_preview_invalid_or_tampered");
  if (saveRequested !== true) blockers.push("creator_draft_save_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("creator_draft_save_confirmation_invalid");
  if (authorizedPreviewFingerprint !== preview?.draftSaveAuthorizationPreviewFingerprint) {
    blockers.push("creator_draft_save_preview_fingerprint_mismatch");
  }
  if (blockers.length || !targets) return safeResult({ blockers: [...new Set(blockers)] });

  const contractTargets = targets.map((target) => ({
    platform: target.platform,
    pageUrl: target.pageUrl,
    confirmedAccount: { ...target.confirmedAccount },
    expectedFieldFingerprint: target.expectedFieldFingerprint,
    expectedAssetFingerprints: [...target.expectedAssetFingerprints],
    operation: "save_current_visible_creator_form_as_draft_only",
  }));
  const contractPayload = {
    authorizationPreviewFingerprint: preview.draftSaveAuthorizationPreviewFingerprint,
    sourceContractFingerprint: preview.sourceContractFingerprint,
    sourceReviewConfirmationFingerprint: preview.sourceReviewConfirmationFingerprint,
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      sameVisiblePageAndAccountRequired: true,
      loginAllowed: false,
      fieldEditsAllowed: false,
      assetEditsAllowed: false,
      draftSaveAllowed: true,
      publishAllowed: false,
    },
  };
  return safeResult({
    status: "platform_text_creator_draft_save_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: preview.draftSaveAuthorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint: hash(contractPayload),
      status: "authorized_not_executed",
    },
    draftSaveAuthorizationGranted: true,
    browserInteractionAllowedByContract: true,
    draftSaveAllowedByContract: true,
  });
}
