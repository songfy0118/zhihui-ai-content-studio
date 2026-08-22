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

function safeAuthorization(value) {
  const contract = value?.executionContract;
  if (
    value?.status !== "platform_text_creator_draft_save_authorization_accepted"
    || value?.eligible !== true
    || value?.authorizationAccepted !== true
    || !HASH.test(value?.authorizedPreviewFingerprint ?? "")
    || value?.draftSaveAuthorizationGranted !== true
    || value?.browserInteractionAllowedByContract !== true
    || value?.sameVisiblePageAndAccountRequiredByContract !== true
    || value?.fieldEditsAllowedByContract !== false
    || value?.assetEditsAllowedByContract !== false
    || value?.draftSaveAllowedByContract !== true
    || value?.publishAllowedByContract !== false
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
    || !contract
    || contract?.authorizationPreviewFingerprint !== value.authorizedPreviewFingerprint
    || !HASH.test(contract?.sourceContractFingerprint ?? "")
    || !HASH.test(contract?.sourceReviewConfirmationFingerprint ?? "")
    || contract?.status !== "authorized_not_executed"
    || JSON.stringify(contract?.constraints) !== JSON.stringify(CONTRACT_CONSTRAINTS)
    || !Array.isArray(contract?.contractTargets)
    || contract.contractTargets.length < 1
    || contract.contractTargets.length > 2
    || !HASH.test(contract?.contractFingerprint ?? "")
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const target of contract.contractTargets) {
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
      || target?.operation !== "save_current_visible_creator_form_as_draft_only"
    ) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
  }

  const contractPayload = {
    authorizationPreviewFingerprint: contract.authorizationPreviewFingerprint,
    sourceContractFingerprint: contract.sourceContractFingerprint,
    sourceReviewConfirmationFingerprint: contract.sourceReviewConfirmationFingerprint,
    contractTargets: contract.contractTargets,
    constraints: contract.constraints,
  };
  return hash(contractPayload) === contract.contractFingerprint ? contract.contractTargets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_draft_save_execution_blocked",
    blockers: [],
    contractFingerprint: null,
    saveAttempts: 0,
    savedCount: 0,
    savedTargets: [],
    failedTarget: null,
    allTargetsSaved: false,
    browserInteractionPerformed: false,
    sameVisiblePageAndAccountConfirmed: false,
    loginStateRead: false,
    loginTriggered: false,
    fieldEditsTriggered: false,
    assetEditsTriggered: false,
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

function failureReason(response, target) {
  if (response?.publishTriggered === true) return "forbidden_publication_observed";
  if (
    response?.saved !== true
    || response?.visible !== true
    || response?.saveConfirmationVisible !== true
    || typeof response?.finalUrl !== "string"
    || !sameOrigin(response.finalUrl, CREATOR_ORIGINS[target.platform])
  ) return "draft_save_not_confirmed_on_visible_same_origin_page";
  if (
    response?.accountIdentityVisible !== true
    || response?.identityLabel !== target.confirmedAccount.identityLabel
    || (response?.accountHandle ?? null) !== (target.confirmedAccount.accountHandle ?? null)
  ) return "confirmed_account_not_visible_or_mismatched";
  if (
    response?.fieldFingerprint !== target.expectedFieldFingerprint
    || JSON.stringify(response?.assetFingerprints) !== JSON.stringify(target.expectedAssetFingerprints)
  ) return "reviewed_fields_or_assets_changed_before_save";
  if (!safeText(response?.draftReference, 200)) return "draft_reference_missing_or_invalid";
  return null;
}

export function createPlatformTextCreatorDraftSaveExecutor(saveVisibleDraft) {
  if (typeof saveVisibleDraft !== "function") throw new Error("visible_draft_save_adapter_required");

  return {
    async execute(authorization) {
      const targets = safeAuthorization(authorization);
      if (!targets) {
        return safeResult({ blockers: ["creator_draft_save_authorization_invalid_or_tampered"] });
      }

      const savedTargets = [];
      let saveAttempts = 0;
      let failedTarget = null;
      let draftSaveObserved = false;
      let publishObserved = false;
      for (const target of targets) {
        saveAttempts += 1;
        let response;
        try {
          response = await saveVisibleDraft({
            platform: target.platform,
            url: target.pageUrl,
            visible: true,
            confirmedAccount: { ...target.confirmedAccount },
            expectedFieldFingerprint: target.expectedFieldFingerprint,
            expectedAssetFingerprints: [...target.expectedAssetFingerprints],
            operation: target.operation,
            contractFingerprint: authorization.executionContract.contractFingerprint,
          });
        } catch {
          failedTarget = { platform: target.platform, reason: "visible_draft_save_adapter_exception" };
          break;
        }
        draftSaveObserved ||= response?.saved === true;
        publishObserved ||= response?.publishTriggered === true;
        const reason = failureReason(response, target);
        if (reason) {
          failedTarget = { platform: target.platform, reason };
          break;
        }
        savedTargets.push({
          platform: target.platform,
          finalUrl: response.finalUrl,
          draftReference: response.draftReference.trim(),
          fieldFingerprint: response.fieldFingerprint,
          assetFingerprints: [...response.assetFingerprints],
          status: "draft_save_reported_visible_not_published",
          publishAllowed: false,
        });
      }

      const allTargetsSaved = savedTargets.length === targets.length && !failedTarget;
      return safeResult({
        status: allTargetsSaved
          ? "platform_text_creator_drafts_save_reported_not_published"
          : savedTargets.length
            ? "platform_text_creator_draft_save_execution_partial_failed"
            : "platform_text_creator_draft_save_execution_failed",
        blockers: failedTarget ? [failedTarget.reason] : [],
        contractFingerprint: authorization.executionContract.contractFingerprint,
        saveAttempts,
        savedCount: savedTargets.length,
        savedTargets,
        failedTarget,
        allTargetsSaved,
        browserInteractionPerformed: saveAttempts > 0,
        sameVisiblePageAndAccountConfirmed: allTargetsSaved,
        draftSaveTriggered: saveAttempts > 0,
        draftSaved: draftSaveObserved || savedTargets.length > 0,
        publishTriggered: publishObserved,
        externalCalls: saveAttempts > 0,
      });
    },
  };
}
