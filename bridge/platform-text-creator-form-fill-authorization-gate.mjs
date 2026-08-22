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

function sameOrigin(url, expectedUrl) {
  try {
    return new URL(url).origin === new URL(expectedUrl).origin;
  } catch {
    return false;
  }
}

function safeText(value, maximumLength) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function safeFields(value) {
  if (
    !safeText(value?.contentMode, 128)
    || !safeText(value?.title, 60)
    || !safeText(value?.body, 20_000)
    || !safeText(value?.coverText, 60)
    || !safeText(value?.sourceNote, 10_000)
    || !Array.isArray(value?.hashtags)
    || value.hashtags.length < 2
    || value.hashtags.length > 8
    || value.hashtags.some((hashtag) => !safeText(hashtag, 40))
  ) return null;
  return value;
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
    || value.confirmedAccount.identityConfirmationFingerprint !== sourceAccountConfirmationFingerprint
    || value?.operation !== "prefill_reviewed_creator_form_after_separate_authorization"
    || !safeFields(value?.exactReviewedFields)
    || !Array.isArray(value?.reviewedAssets)
    || value.reviewedAssets.length < 1
    || value.reviewedAssets.length > 9
    || value?.reviewedAssetCount !== value.reviewedAssets.length
    || !HASH.test(value?.draftFingerprint ?? "")
    || !HASH.test(value?.draftReviewFingerprint ?? "")
    || !HASH.test(value?.visualReviewFingerprint ?? "")
    || value?.targetStatus !== "preview_only_not_authorized"
    || value?.saveDraftAllowed !== false
    || value?.publishAllowed !== false
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

function safePreview(value) {
  if (
    value?.status !== "platform_text_creator_form_fill_authorization_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceDraftPackagePlanFingerprint ?? "")
    || !HASH.test(value?.sourceCreatorOpenContractFingerprint ?? "")
    || !HASH.test(value?.sourceAccountConfirmationFingerprint ?? "")
    || !HASH.test(value?.formFillAuthorizationPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `PREFILL REVIEWED CREATOR FORMS ${value.formFillAuthorizationPreviewFingerprint}`
    || !Array.isArray(value?.fillTargets)
    || value.fillTargets.length < 1
    || value.fillTargets.length > 2
    || value?.targetCount !== value.fillTargets.length
    || value?.eligibleForExplicitFormFillAuthorization !== true
    || value?.formFillAuthorizationGranted !== false
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
  ) return null;

  const targets = [];
  const seen = new Set();
  let previousPlatformRank = -1;
  for (const candidate of value.fillTargets) {
    const target = safeTarget(candidate, value.sourceAccountConfirmationFingerprint);
    const platformRank = PLATFORM_ORDER.get(candidate?.platform);
    if (!target || seen.has(target.platform) || platformRank <= previousPlatformRank) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
    targets.push(target);
  }
  if (targets.reduce((total, target) => total + target.reviewedAssetCount, 0) !== value.reviewedAssetCount) return null;
  const fingerprintPayload = {
    sourceDraftPackagePlanFingerprint: value.sourceDraftPackagePlanFingerprint,
    sourceCreatorOpenContractFingerprint: value.sourceCreatorOpenContractFingerprint,
    sourceAccountConfirmationFingerprint: value.sourceAccountConfirmationFingerprint,
    fillTargets: value.fillTargets,
  };
  return hash(fingerprintPayload) === value.formFillAuthorizationPreviewFingerprint ? targets : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_form_fill_authorization_blocked",
    blockers: [],
    eligible: false,
    authorizationAccepted: false,
    authorizedPreviewFingerprint: null,
    executionContract: null,
    formFillAuthorizationGranted: false,
    browserInteractionAllowedByContract: false,
    reviewedAssetUploadAllowedByContract: false,
    reviewedFieldFillAllowedByContract: false,
    draftSaveAllowedByContract: false,
    publishAllowedByContract: false,
    browserInteractionPerformed: false,
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

export function assessPlatformTextCreatorFormFillAuthorization({
  preview,
  prefillRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
} = {}) {
  const blockers = [];
  const targets = safePreview(preview);
  if (!targets) blockers.push("platform_text_creator_form_fill_authorization_preview_invalid_or_tampered");
  if (prefillRequested !== true) blockers.push("creator_form_fill_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("creator_form_fill_confirmation_invalid");
  if (authorizedPreviewFingerprint !== preview?.formFillAuthorizationPreviewFingerprint) {
    blockers.push("creator_form_fill_preview_fingerprint_mismatch");
  }
  if (blockers.length || !targets) return safeResult({ blockers: [...new Set(blockers)] });

  const contractTargets = targets.map((target) => ({
    platform: target.platform,
    creatorEntryUrl: target.creatorEntryUrl,
    visiblePageUrl: target.visiblePageUrl,
    confirmedAccount: { ...target.confirmedAccount },
    operation: "prefill_visible_creator_form_and_upload_reviewed_assets_only",
    exactReviewedFields: {
      ...target.exactReviewedFields,
      hashtags: [...target.exactReviewedFields.hashtags],
    },
    reviewedAssets: target.reviewedAssets.map((asset) => ({ ...asset })),
    reviewedAssetCount: target.reviewedAssetCount,
    draftFingerprint: target.draftFingerprint,
    draftReviewFingerprint: target.draftReviewFingerprint,
    visualReviewFingerprint: target.visualReviewFingerprint,
  }));
  const contractPayload = {
    authorizationPreviewFingerprint: preview.formFillAuthorizationPreviewFingerprint,
    sourceDraftPackagePlanFingerprint: preview.sourceDraftPackagePlanFingerprint,
    sourceCreatorOpenContractFingerprint: preview.sourceCreatorOpenContractFingerprint,
    sourceAccountConfirmationFingerprint: preview.sourceAccountConfirmationFingerprint,
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      confirmedAccountMustRemainVisible: true,
      loginAllowed: false,
      reviewedAssetUploadAllowed: true,
      reviewedFieldFillAllowed: true,
      draftSaveAllowed: false,
      publishAllowed: false,
    },
  };
  return safeResult({
    status: "platform_text_creator_form_fill_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: preview.formFillAuthorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint: hash(contractPayload),
      status: "authorized_not_executed",
    },
    formFillAuthorizationGranted: true,
    browserInteractionAllowedByContract: true,
    reviewedAssetUploadAllowedByContract: true,
    reviewedFieldFillAllowedByContract: true,
  });
}
