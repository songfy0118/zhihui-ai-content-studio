import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ENTRIES = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com/publish",
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
});
const CONTRACT_CONSTRAINTS = Object.freeze({
  visibleBrowserOnly: true,
  loginAllowed: false,
  uploadAllowed: false,
  draftSaveAllowed: false,
  publishAllowed: false,
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeAuthorization(value) {
  const contract = value?.executionContract;
  if (
    value?.status !== "platform_text_creator_open_authorization_accepted"
    || value?.eligible !== true
    || value?.authorizationAccepted !== true
    || !HASH.test(value?.authorizedPreviewFingerprint ?? "")
    || value?.browserOpenAllowedByContract !== true
    || value?.creatorOpenAuthorizationGranted !== true
    || value?.browserOpenPerformed !== false
    || value?.loginAllowedByContract !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.accountIdentityVerified !== false
    || value?.uploadAllowedByContract !== false
    || value?.uploadTriggered !== false
    || value?.draftSaveAllowedByContract !== false
    || value?.draftSaved !== false
    || value?.publishAllowedByContract !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
    || !contract
    || contract?.authorizationPreviewFingerprint !== value.authorizedPreviewFingerprint
    || contract?.status !== "authorized_not_executed"
    || JSON.stringify(contract?.constraints) !== JSON.stringify(CONTRACT_CONSTRAINTS)
    || !Array.isArray(contract?.contractTargets)
    || contract.contractTargets.length < 1
    || contract.contractTargets.length > 2
    || !HASH.test(contract?.contractFingerprint ?? "")
  ) return null;

  const targets = [];
  const seen = new Set();
  for (const target of contract.contractTargets) {
    if (
      !CREATOR_ENTRIES[target?.platform]
      || seen.has(target.platform)
      || target.creatorEntryUrl !== CREATOR_ENTRIES[target.platform]
      || target.operation !== "open_visible_official_creator_page_only"
      || target.accountIdentityVerificationRequiredAfterOpen !== true
      || !HASH.test(target?.draftPackagePlanFingerprint ?? "")
      || !HASH.test(target?.draftFingerprint ?? "")
      || !HASH.test(target?.visualReviewFingerprint ?? "")
      || !Number.isInteger(target?.reviewedAssetCount)
      || target.reviewedAssetCount < 1
      || target.reviewedAssetCount > 9
    ) return null;
    seen.add(target.platform);
    targets.push(target);
  }
  targets.sort((left, right) => PLATFORM_ORDER.get(left.platform) - PLATFORM_ORDER.get(right.platform));
  if (targets.some((target, index) => target !== contract.contractTargets[index])) return null;
  const contractPayload = {
    authorizationPreviewFingerprint: contract.authorizationPreviewFingerprint,
    contractTargets: contract.contractTargets,
    constraints: contract.constraints,
  };
  return hash(contractPayload) === contract.contractFingerprint ? targets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_open_execution_blocked",
    blockers: [],
    contractFingerprint: null,
    openAttempts: 0,
    openedCount: 0,
    openedTargets: [],
    failedTarget: null,
    allTargetsOpened: false,
    browserOpenPerformed: false,
    accountIdentityVerificationRequired: true,
    accountIdentityVerified: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function sameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function createPlatformTextCreatorOpenExecutor(openVisiblePage) {
  if (typeof openVisiblePage !== "function") throw new Error("visible_page_opener_required");

  return {
    async execute(authorization) {
      const targets = safeAuthorization(authorization);
      if (!targets) {
        return safeResult({ blockers: ["platform_text_creator_open_authorization_invalid_or_tampered"] });
      }

      const openedTargets = [];
      let openAttempts = 0;
      let failedTarget = null;
      for (const target of targets) {
        openAttempts += 1;
        let response;
        try {
          response = await openVisiblePage({
            platform: target.platform,
            url: target.creatorEntryUrl,
            visible: true,
            operation: target.operation,
            contractFingerprint: authorization.executionContract.contractFingerprint,
          });
        } catch {
          failedTarget = { platform: target.platform, reason: "visible_page_opener_exception" };
          break;
        }
        if (
          response?.opened !== true
          || response?.visible !== true
          || typeof response?.finalUrl !== "string"
          || !sameOrigin(response.finalUrl, target.creatorEntryUrl)
        ) {
          failedTarget = {
            platform: target.platform,
            reason: response?.opened === true ? "creator_page_off_origin_or_invisible" : "visible_page_not_opened",
          };
          break;
        }
        openedTargets.push({
          platform: target.platform,
          requestedUrl: target.creatorEntryUrl,
          finalUrl: response.finalUrl,
          status: "opened_visible_account_identity_pending",
          accountIdentityVerificationRequired: true,
        });
      }

      const allTargetsOpened = openedTargets.length === targets.length && !failedTarget;
      return safeResult({
        status: allTargetsOpened
          ? "platform_text_creator_pages_opened_identity_pending"
          : openedTargets.length
            ? "platform_text_creator_open_execution_partial_failed"
            : "platform_text_creator_open_execution_failed",
        blockers: failedTarget ? [failedTarget.reason] : [],
        contractFingerprint: authorization.executionContract.contractFingerprint,
        openAttempts,
        openedCount: openedTargets.length,
        openedTargets,
        failedTarget,
        allTargetsOpened,
        browserOpenPerformed: openedTargets.length > 0,
        externalCalls: openAttempts > 0,
      });
    },
  };
}
