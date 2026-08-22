import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ENTRIES = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com/publish",
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safePreview(value) {
  if (
    value?.status !== "platform_text_creator_open_authorization_preview_ready"
    || !HASH.test(value?.sourceDraftPackagePlanFingerprint ?? "")
    || !HASH.test(value?.authorizationPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `OPEN REVIEWED CREATOR PAGES ${value.authorizationPreviewFingerprint}`
    || !Array.isArray(value?.openTargets)
    || value.openTargets.length < 1
    || value.openTargets.length > 2
    || value.targetCount !== value.openTargets.length
    || value?.accountIdentityVerificationRequired !== true
    || value?.eligibleForExplicitCreatorOpenAuthorization !== true
    || value?.creatorOpenAuthorizationGranted !== false
    || value?.browserOpenPerformed !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.accountIdentityVerified !== false
    || value?.uploadTriggered !== false
    || value?.draftSaved !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const targets = [];
  const seen = new Set();
  for (const target of value.openTargets) {
    if (
      !CREATOR_ENTRIES[target?.platform]
      || seen.has(target.platform)
      || target.creatorEntryUrl !== CREATOR_ENTRIES[target.platform]
      || target.interactionMode !== "visible_browser_user_observable"
      || target.draftPackagePlanFingerprint !== value.sourceDraftPackagePlanFingerprint
      || !HASH.test(target?.draftFingerprint ?? "")
      || !HASH.test(target?.visualReviewFingerprint ?? "")
      || !Number.isInteger(target?.reviewedAssetCount)
      || target.reviewedAssetCount < 1
      || target.reviewedAssetCount > 9
      || JSON.stringify(target?.accountIdentityCheck) !== JSON.stringify({
        required: true,
        method: "visible_creator_header_manual_confirmation",
        expectedAccountIdentity: null,
        status: "pending_user_verification",
      })
      || target.openStatus !== "preview_only_not_authorized"
    ) return null;
    seen.add(target.platform);
    targets.push(target);
  }
  targets.sort((left, right) => PLATFORM_ORDER.get(left.platform) - PLATFORM_ORDER.get(right.platform));
  if (targets.some((target, index) => target !== value.openTargets[index])) return null;
  const recomputed = hash({
    sourceDraftPackagePlanFingerprint: value.sourceDraftPackagePlanFingerprint,
    openTargets: value.openTargets,
  });
  return recomputed === value.authorizationPreviewFingerprint ? targets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_open_authorization_blocked",
    blockers: [],
    eligible: false,
    authorizationAccepted: false,
    authorizedPreviewFingerprint: null,
    executionContract: null,
    browserOpenAllowedByContract: false,
    creatorOpenAuthorizationGranted: false,
    browserOpenPerformed: false,
    loginAllowedByContract: false,
    loginStateRead: false,
    loginTriggered: false,
    accountIdentityVerified: false,
    uploadAllowedByContract: false,
    uploadTriggered: false,
    draftSaveAllowedByContract: false,
    draftSaved: false,
    publishAllowedByContract: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function assessPlatformTextCreatorOpenAuthorization({
  preview,
  executeRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
} = {}) {
  const blockers = [];
  const targets = safePreview(preview);
  if (!targets) blockers.push("platform_text_creator_open_authorization_preview_invalid_or_tampered");
  if (executeRequested !== true) blockers.push("creator_open_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("creator_open_confirmation_invalid");
  if (authorizedPreviewFingerprint !== preview?.authorizationPreviewFingerprint) blockers.push("creator_open_fingerprint_mismatch");
  if (blockers.length || !targets) return safeResult({ blockers: [...new Set(blockers)] });

  const contractTargets = targets.map((target) => ({
    platform: target.platform,
    creatorEntryUrl: target.creatorEntryUrl,
    operation: "open_visible_official_creator_page_only",
    accountIdentityVerificationRequiredAfterOpen: true,
    draftPackagePlanFingerprint: target.draftPackagePlanFingerprint,
    draftFingerprint: target.draftFingerprint,
    visualReviewFingerprint: target.visualReviewFingerprint,
    reviewedAssetCount: target.reviewedAssetCount,
  }));
  const contractPayload = {
    authorizationPreviewFingerprint: preview.authorizationPreviewFingerprint,
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      loginAllowed: false,
      uploadAllowed: false,
      draftSaveAllowed: false,
      publishAllowed: false,
    },
  };
  return safeResult({
    status: "platform_text_creator_open_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint: hash(contractPayload),
      status: "authorized_not_executed",
    },
    browserOpenAllowedByContract: true,
    creatorOpenAuthorizationGranted: true,
  });
}
