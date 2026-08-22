import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ENTRIES = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com/publish",
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
});
const PACKAGE_HUMAN_STEPS = Object.freeze([
  "authorize_visible_creator_page_open",
  "verify_visible_account_identity",
  "reconfirm_copy_and_asset_fingerprints",
  "upload_reviewed_assets_and_copy_text_manually",
  "request_separate_authorization_before_saving_draft",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validText(value, maximum) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function safePackageItem(value, renderFingerprint, visualReviewFingerprint) {
  if (
    !CREATOR_ENTRIES[value?.platform]
    || value.creatorEntryUrl !== CREATOR_ENTRIES[value.platform]
    || value.interactionMode !== "visible_browser_manual_after_separate_authorization"
    || !validText(value.contentMode, 128)
    || !validText(value.title, 60)
    || !validText(value.body, 20_000)
    || !validText(value.coverText, 60)
    || !validText(value.sourceNote, 10_000)
    || !Array.isArray(value.hashtags)
    || value.hashtags.length < 2
    || value.hashtags.length > 8
    || value.hashtags.some((hashtag) => !validText(hashtag, 40))
    || !HASH.test(value.draftFingerprint ?? "")
    || !HASH.test(value.draftReviewFingerprint ?? "")
    || value.visualReviewFingerprint !== visualReviewFingerprint
    || !Array.isArray(value.assets)
    || value.assets.length < 1
    || value.assets.length > 9
    || value.assetCount !== value.assets.length
    || value.packageStatus !== "reviewed_inputs_ready_pending_creator_open_authorization"
    || !sameArray(value.requiredHumanSteps, PACKAGE_HUMAN_STEPS)
    || value.creatorPageOpenAuthorized !== false
    || value.draftSaveAuthorized !== false
  ) return null;

  for (const [index, asset] of value.assets.entries()) {
    const expectedRole = index === 0 ? "cover" : "body";
    const expectedFilename = `${value.platform}-${String(index + 1).padStart(2, "0")}-${expectedRole}.svg`;
    if (
      asset?.cardIndex !== index + 1
      || asset?.role !== expectedRole
      || asset?.filename !== expectedFilename
      || asset?.relativePath !== `work/platform-text-visual-previews/${renderFingerprint}/${expectedFilename}`
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

function safeDraftPackage(value) {
  if (
    value?.status !== "platform_text_unified_draft_package_plan_ready"
    || !HASH.test(value?.draftPackagePlanFingerprint ?? "")
    || !HASH.test(value?.sourceHandoffFingerprint ?? "")
    || !HASH.test(value?.assetPlanFingerprint ?? "")
    || !HASH.test(value?.renderFingerprint ?? "")
    || !HASH.test(value?.bundleManifestFingerprint ?? "")
    || !HASH.test(value?.visualReviewFingerprint ?? "")
    || !HASH.test(value?.assetHandoffPlanFingerprint ?? "")
    || !Array.isArray(value?.packageItems)
    || value.packageItems.length < 1
    || value.packageItems.length > 2
    || value.platformCount !== value.packageItems.length
    || value?.copyHandoffReady !== true
    || value?.reviewedAssetReferencesReady !== true
    || value?.draftPackageInputsReady !== true
    || value?.eligibleForCreatorPageOpenAuthorization !== true
    || value?.readyForDraftHandoff !== false
    || value?.visualAssetsReady !== false
    || value?.assetUploadReady !== false
    || value?.assetsUnlocked !== false
    || value?.browserOpenPerformed !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggered !== false
    || value?.draftSaved !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.modelCalls !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const items = [];
  const seen = new Set();
  for (const candidate of value.packageItems) {
    const item = safePackageItem(candidate, value.renderFingerprint, value.visualReviewFingerprint);
    if (!item || seen.has(item.platform)) return null;
    seen.add(item.platform);
    items.push(item);
  }
  items.sort((left, right) => PLATFORM_ORDER.get(left.platform) - PLATFORM_ORDER.get(right.platform));
  if (items.some((item, index) => item !== value.packageItems[index])) return null;
  if (items.reduce((total, item) => total + item.assetCount, 0) !== value.assetCount) return null;
  const fingerprintPayload = {
    sourceHandoffFingerprint: value.sourceHandoffFingerprint,
    assetPlanFingerprint: value.assetPlanFingerprint,
    renderFingerprint: value.renderFingerprint,
    bundleManifestFingerprint: value.bundleManifestFingerprint,
    visualReviewFingerprint: value.visualReviewFingerprint,
    assetHandoffPlanFingerprint: value.assetHandoffPlanFingerprint,
    packageItems: value.packageItems,
  };
  return hash(fingerprintPayload) === value.draftPackagePlanFingerprint ? items : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_open_authorization_preview_blocked",
    blockers: [],
    sourceDraftPackagePlanFingerprint: null,
    authorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    openTargets: [],
    targetCount: 0,
    accountIdentityVerificationRequired: true,
    eligibleForExplicitCreatorOpenAuthorization: false,
    creatorOpenAuthorizationGranted: false,
    browserOpenPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    accountIdentityVerified: false,
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

export function buildPlatformTextCreatorOpenAuthorizationPreview(draftPackagePlan, requestedPlatforms = []) {
  const blockers = [];
  const packageItems = safeDraftPackage(draftPackagePlan);
  if (!packageItems) blockers.push("platform_text_unified_draft_package_plan_invalid_or_tampered");
  if (!Array.isArray(requestedPlatforms) || requestedPlatforms.length < 1 || requestedPlatforms.length > 2) {
    blockers.push("creator_open_target_selection_required");
  }

  const normalized = Array.isArray(requestedPlatforms)
    ? requestedPlatforms.map((platform) => typeof platform === "string" ? platform.trim().toLowerCase() : "")
    : [];
  if (new Set(normalized).size !== normalized.length) blockers.push("creator_open_target_duplicate");
  if (packageItems && normalized.some((platform) => !packageItems.some((item) => item.platform === platform))) {
    blockers.push("creator_open_target_not_in_current_package");
  }
  if (blockers.length || !packageItems) return safeResult({ blockers: [...new Set(blockers)] });

  normalized.sort((left, right) => PLATFORM_ORDER.get(left) - PLATFORM_ORDER.get(right));
  const openTargets = normalized.map((platform) => {
    const item = packageItems.find((candidate) => candidate.platform === platform);
    return {
      platform,
      creatorEntryUrl: item.creatorEntryUrl,
      interactionMode: "visible_browser_user_observable",
      draftPackagePlanFingerprint: draftPackagePlan.draftPackagePlanFingerprint,
      draftFingerprint: item.draftFingerprint,
      visualReviewFingerprint: item.visualReviewFingerprint,
      reviewedAssetCount: item.assetCount,
      accountIdentityCheck: {
        required: true,
        method: "visible_creator_header_manual_confirmation",
        expectedAccountIdentity: null,
        status: "pending_user_verification",
      },
      openStatus: "preview_only_not_authorized",
    };
  });
  const authorizationPreviewFingerprint = hash({
    sourceDraftPackagePlanFingerprint: draftPackagePlan.draftPackagePlanFingerprint,
    openTargets,
  });
  return safeResult({
    status: "platform_text_creator_open_authorization_preview_ready",
    sourceDraftPackagePlanFingerprint: draftPackagePlan.draftPackagePlanFingerprint,
    authorizationPreviewFingerprint,
    requiredConfirmation: `OPEN REVIEWED CREATOR PAGES ${authorizationPreviewFingerprint}`,
    openTargets,
    targetCount: openTargets.length,
    eligibleForExplicitCreatorOpenAuthorization: true,
  });
}
