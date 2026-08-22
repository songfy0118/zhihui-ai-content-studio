import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ENTRIES = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com/publish",
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
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

function sameOrigin(left, right) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function safeText(value, maximumLength) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function safeFields(value) {
  return (
    safeText(value?.contentMode, 128)
    && safeText(value?.title, 60)
    && safeText(value?.body, 20_000)
    && safeText(value?.coverText, 60)
    && safeText(value?.sourceNote, 10_000)
    && Array.isArray(value?.hashtags)
    && value.hashtags.length >= 2
    && value.hashtags.length <= 8
    && value.hashtags.every((hashtag) => safeText(hashtag, 40))
  );
}

function safeTarget(value, sourceAccountConfirmationFingerprint) {
  const creatorEntryUrl = CREATOR_ENTRIES[value?.platform];
  const identityLabel = safeText(value?.confirmedAccount?.identityLabel, 120);
  const accountHandle = value?.confirmedAccount?.accountHandle == null
    ? null
    : safeText(value.confirmedAccount.accountHandle, 120);
  if (
    !creatorEntryUrl
    || value?.creatorEntryUrl !== creatorEntryUrl
    || !sameOrigin(value?.visiblePageUrl, creatorEntryUrl)
    || !identityLabel
    || identityLabel !== value.confirmedAccount.identityLabel
    || (value.confirmedAccount.accountHandle != null && (!accountHandle || accountHandle !== value.confirmedAccount.accountHandle))
    || value?.confirmedAccount?.identityConfirmationFingerprint !== sourceAccountConfirmationFingerprint
    || value?.operation !== "prefill_visible_creator_form_and_upload_reviewed_assets_only"
    || !safeFields(value?.exactReviewedFields)
    || !Array.isArray(value?.reviewedAssets)
    || value.reviewedAssets.length < 1
    || value.reviewedAssets.length > 9
    || value?.reviewedAssetCount !== value.reviewedAssets.length
    || !HASH.test(value?.draftFingerprint ?? "")
    || !HASH.test(value?.draftReviewFingerprint ?? "")
    || !HASH.test(value?.visualReviewFingerprint ?? "")
  ) return null;

  for (const [index, asset] of value.reviewedAssets.entries()) {
    const role = index === 0 ? "cover" : "body";
    const filename = `${value.platform}-${String(index + 1).padStart(2, "0")}-${role}.svg`;
    const pathParts = typeof asset?.relativePath === "string" ? asset.relativePath.split("/") : [];
    if (
      asset?.cardIndex !== index + 1
      || asset?.role !== role
      || asset?.filename !== filename
      || pathParts.length !== 4
      || pathParts[0] !== "work"
      || pathParts[1] !== "platform-text-visual-previews"
      || !HASH.test(pathParts[2] ?? "")
      || pathParts[3] !== filename
      || asset?.width !== 1080
      || asset?.height !== (value.platform === "xiaohongshu" ? 1440 : 1920)
      || !Number.isInteger(asset?.svgBytes)
      || asset.svgBytes < 1
      || !HASH.test(asset?.copyFingerprint ?? "")
      || !HASH.test(asset?.svgFingerprint ?? "")
      || asset?.verificationStatus !== "durable_human_visual_review_confirmed_current"
    ) return null;
  }
  return value;
}

function safeAuthorization(value) {
  const contract = value?.executionContract;
  if (
    value?.status !== "platform_text_creator_form_fill_authorization_accepted"
    || value?.eligible !== true
    || value?.authorizationAccepted !== true
    || !HASH.test(value?.authorizedPreviewFingerprint ?? "")
    || value?.formFillAuthorizationGranted !== true
    || value?.browserInteractionAllowedByContract !== true
    || value?.reviewedAssetUploadAllowedByContract !== true
    || value?.reviewedFieldFillAllowedByContract !== true
    || value?.draftSaveAllowedByContract !== false
    || value?.publishAllowedByContract !== false
    || value?.browserInteractionPerformed !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggered !== false
    || value?.formFieldsFilled !== false
    || value?.draftSaved !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
    || !contract
    || contract?.authorizationPreviewFingerprint !== value.authorizedPreviewFingerprint
    || !HASH.test(contract?.sourceDraftPackagePlanFingerprint ?? "")
    || !HASH.test(contract?.sourceCreatorOpenContractFingerprint ?? "")
    || !HASH.test(contract?.sourceAccountConfirmationFingerprint ?? "")
    || contract?.status !== "authorized_not_executed"
    || JSON.stringify(contract?.constraints) !== JSON.stringify(CONTRACT_CONSTRAINTS)
    || !Array.isArray(contract?.contractTargets)
    || contract.contractTargets.length < 1
    || contract.contractTargets.length > 2
    || !HASH.test(contract?.contractFingerprint ?? "")
  ) return null;

  const targets = [];
  const seen = new Set();
  let previousPlatformRank = -1;
  for (const candidate of contract.contractTargets) {
    const target = safeTarget(candidate, contract.sourceAccountConfirmationFingerprint);
    const platformRank = PLATFORM_ORDER.get(candidate?.platform);
    if (!target || seen.has(target.platform) || platformRank <= previousPlatformRank) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
    targets.push(target);
  }
  const contractPayload = {
    authorizationPreviewFingerprint: contract.authorizationPreviewFingerprint,
    sourceDraftPackagePlanFingerprint: contract.sourceDraftPackagePlanFingerprint,
    sourceCreatorOpenContractFingerprint: contract.sourceCreatorOpenContractFingerprint,
    sourceAccountConfirmationFingerprint: contract.sourceAccountConfirmationFingerprint,
    contractTargets: contract.contractTargets,
    constraints: contract.constraints,
  };
  return hash(contractPayload) === contract.contractFingerprint ? targets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_form_fill_execution_blocked",
    blockers: [],
    contractFingerprint: null,
    prefillAttempts: 0,
    prefilledCount: 0,
    prefilledTargets: [],
    failedTarget: null,
    allTargetsPrefilled: false,
    browserInteractionPerformed: false,
    accountIdentityRemainedVisible: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    formFieldsFilled: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

function failureReason(response, target, fieldFingerprint, assetFingerprints) {
  if (response?.draftSaved === true || response?.publishTriggered === true) {
    return "forbidden_save_or_publish_observed";
  }
  if (
    response?.completed !== true
    || response?.visible !== true
    || typeof response?.finalUrl !== "string"
    || !sameOrigin(response.finalUrl, target.creatorEntryUrl)
  ) return "prefill_result_off_origin_or_invisible";
  if (
    response?.accountIdentityVisible !== true
    || response?.identityLabel !== target.confirmedAccount.identityLabel
    || (response?.accountHandle ?? null) !== (target.confirmedAccount.accountHandle ?? null)
  ) return "confirmed_account_not_visible_or_mismatched";
  if (
    response?.filledFieldFingerprint !== fieldFingerprint
    || !Array.isArray(response?.uploadedAssetFingerprints)
    || JSON.stringify(response.uploadedAssetFingerprints) !== JSON.stringify(assetFingerprints)
  ) return "reviewed_fields_or_assets_not_confirmed";
  return null;
}

export function createPlatformTextCreatorFormFillExecutor(prefillVisibleForm) {
  if (typeof prefillVisibleForm !== "function") throw new Error("visible_form_prefill_adapter_required");

  return {
    async execute(authorization) {
      const targets = safeAuthorization(authorization);
      if (!targets) {
        return safeResult({ blockers: ["platform_text_creator_form_fill_authorization_invalid_or_tampered"] });
      }

      const prefilledTargets = [];
      let prefillAttempts = 0;
      let failedTarget = null;
      for (const target of targets) {
        const filledFieldFingerprint = hash(target.exactReviewedFields);
        const uploadedAssetFingerprints = target.reviewedAssets.map((asset) => asset.svgFingerprint);
        prefillAttempts += 1;
        let response;
        try {
          response = await prefillVisibleForm({
            platform: target.platform,
            url: target.visiblePageUrl,
            creatorEntryUrl: target.creatorEntryUrl,
            visible: true,
            confirmedAccount: { ...target.confirmedAccount },
            operation: target.operation,
            exactReviewedFields: {
              ...target.exactReviewedFields,
              hashtags: [...target.exactReviewedFields.hashtags],
            },
            reviewedAssets: target.reviewedAssets.map((asset) => ({ ...asset })),
            contractFingerprint: authorization.executionContract.contractFingerprint,
          });
        } catch {
          failedTarget = { platform: target.platform, reason: "visible_form_prefill_adapter_exception" };
          break;
        }

        const reason = failureReason(response, target, filledFieldFingerprint, uploadedAssetFingerprints);
        if (reason) {
          failedTarget = { platform: target.platform, reason };
          break;
        }
        prefilledTargets.push({
          platform: target.platform,
          finalUrl: response.finalUrl,
          status: "prefilled_visible_review_pending_not_saved",
          filledFieldFingerprint,
          uploadedAssetFingerprints,
          reviewedAssetCount: target.reviewedAssetCount,
          saveDraftRequiredSeparateAuthorization: true,
        });
      }

      const allTargetsPrefilled = prefilledTargets.length === targets.length && !failedTarget;
      return safeResult({
        status: allTargetsPrefilled
          ? "platform_text_creator_forms_prefilled_review_pending_not_saved"
          : prefilledTargets.length
            ? "platform_text_creator_form_fill_execution_partial_failed"
            : "platform_text_creator_form_fill_execution_failed",
        blockers: failedTarget ? [failedTarget.reason] : [],
        contractFingerprint: authorization.executionContract.contractFingerprint,
        prefillAttempts,
        prefilledCount: prefilledTargets.length,
        prefilledTargets,
        failedTarget,
        allTargetsPrefilled,
        browserInteractionPerformed: prefillAttempts > 0,
        accountIdentityRemainedVisible: allTargetsPrefilled,
        uploadTriggered: prefilledTargets.length > 0,
        formFieldsFilled: prefilledTargets.length > 0,
        externalCalls: prefillAttempts > 0,
      });
    },
  };
}
