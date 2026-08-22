import { createHash } from "node:crypto";

import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "./platform-text-visual-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const PLATFORM_CANVAS = Object.freeze({
  xiaohongshu: Object.freeze({ width: 1080, height: 1440 }),
  douyin: Object.freeze({ width: 1080, height: 1920 }),
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function text(value, maximum = 500) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
}

function exactChecks(value) {
  const names = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
  return names.length === PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.length
    && names.every((check) => PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.includes(check))
    && PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.every((check) => value[check] === true);
}

function safeInspection(value) {
  if (
    value?.status !== "platform_text_svg_bundle_inspection_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.bundleFound !== true
    || value?.integrityStatus !== "verified_pending_human_visual_review"
    || !HASH.test(value?.renderFingerprint ?? "")
    || !HASH.test(value?.bundleManifestFingerprint ?? "")
    || value?.bundleDirectory !== `work/platform-text-visual-previews/${value.renderFingerprint}`
    || !Array.isArray(value?.assets)
    || value.assets.length < 2
    || value.assets.length > 18
    || value?.filesystemMutations !== false
    || value?.readyForHumanVisualReview !== true
    || value?.humanVisualReviewRequired !== true
    || value?.visualAssetsReady !== false
    || value?.assetUploadReady !== false
    || value?.readyForDraftHandoff !== false
    || value?.browserOpenPerformed !== false
    || value?.databaseWrites !== false
    || value?.modelCalls !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const assets = [];
  const platforms = [];
  const filenames = new Set();
  let previousPlatform = -1;
  let previousCardIndex = 0;
  for (const asset of value.assets) {
    const canvas = PLATFORM_CANVAS[asset?.platform];
    const platformOrder = PLATFORM_ORDER.get(asset?.platform);
    if (
      !canvas
      || platformOrder === undefined
      || !Number.isInteger(asset?.cardIndex)
      || asset.cardIndex < 1
      || asset.cardIndex > 9
      || asset.role !== (asset.cardIndex === 1 ? "cover" : "body")
      || asset.filename !== `${asset.platform}-${String(asset.cardIndex).padStart(2, "0")}-${asset.role}.svg`
      || filenames.has(asset.filename)
      || asset.width !== canvas.width
      || asset.height !== canvas.height
      || !Number.isInteger(asset.svgBytes)
      || asset.svgBytes < 1
      || !HASH.test(asset.copyFingerprint ?? "")
      || !HASH.test(asset.svgFingerprint ?? "")
      || asset.exactCopyMetadataVerified !== true
      || asset.integrityVerified !== true
      || platformOrder < previousPlatform
      || platformOrder !== previousPlatform && asset.cardIndex !== 1
      || platformOrder === previousPlatform && asset.cardIndex !== previousCardIndex + 1
    ) return null;
    if (platformOrder !== previousPlatform) platforms.push(asset.platform);
    filenames.add(asset.filename);
    previousPlatform = platformOrder;
    previousCardIndex = asset.cardIndex;
    assets.push(asset);
  }
  return platforms.length === PLATFORM_ORDER.size ? { assets, platforms } : null;
}

function safeVisualReviewRead(value, inspection, current) {
  const receipt = value?.receipt;
  if (
    value?.status !== "platform_text_visual_review_read_ready"
    || value?.found !== true
    || value?.durableHumanReview !== true
    || value?.durableVisualReviewInputReady !== true
    || value?.reviewedPlatforms !== current.platforms.length
    || value?.reviewedAssets !== current.assets.length
    || !HASH.test(value?.readFingerprint ?? "")
    || !receipt
    || receipt.status !== "active"
    || receipt.renderFingerprint !== inspection.renderFingerprint
    || receipt.bundleManifestFingerprint !== inspection.bundleManifestFingerprint
    || !HASH.test(receipt.visualReviewFingerprint ?? "")
    || receipt.receiptId !== `ptvrp_${receipt.visualReviewFingerprint}`
    || receipt.idempotencyKey !== `platform-text-visual-review:${receipt.visualReviewFingerprint}`
    || !text(receipt.createdAt, 128)
    || !Array.isArray(receipt.reviewedPlatforms)
    || receipt.reviewedPlatforms.length !== current.platforms.length
    || hash(receipt) !== value.readFingerprint
  ) return null;

  const fingerprintPlatforms = [];
  const seenPlatforms = new Set();
  for (const review of receipt.reviewedPlatforms) {
    const platformAssets = current.assets.filter((asset) => asset.platform === review?.platform);
    if (
      !current.platforms.includes(review?.platform)
      || seenPlatforms.has(review?.platform)
      || !Number.isInteger(review?.assetCount)
      || review.assetCount !== platformAssets.length
      || !Array.isArray(review?.assets)
      || review.assets.length !== platformAssets.length
      || !text(review?.reviewNote)
      || review.reviewNote.trim().length < 8
      || !exactChecks(review?.checks)
      || review?.status !== "human_visual_reviewed_persisted"
      || !text(review?.createdAt, 128)
    ) return null;
    seenPlatforms.add(review.platform);

    const fingerprintAssets = [];
    for (const [index, reviewedAsset] of review.assets.entries()) {
      const inspectedAsset = platformAssets[index];
      if (
        reviewedAsset?.cardIndex !== inspectedAsset.cardIndex
        || reviewedAsset?.role !== inspectedAsset.role
        || reviewedAsset?.filename !== inspectedAsset.filename
        || reviewedAsset?.copyFingerprint !== inspectedAsset.copyFingerprint
        || reviewedAsset?.svgFingerprint !== inspectedAsset.svgFingerprint
        || !text(reviewedAsset?.createdAt, 128)
      ) return null;
      fingerprintAssets.push({
        cardIndex: reviewedAsset.cardIndex,
        role: reviewedAsset.role,
        filename: reviewedAsset.filename,
        copyFingerprint: reviewedAsset.copyFingerprint,
        svgFingerprint: reviewedAsset.svgFingerprint,
      });
    }
    fingerprintPlatforms.push({
      platform: review.platform,
      assetCount: review.assetCount,
      assets: fingerprintAssets,
      reviewNote: review.reviewNote.trim(),
      checks: Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true])),
      status: "human_visual_reviewed_in_preview_not_persisted",
    });
  }
  fingerprintPlatforms.sort((left, right) => PLATFORM_ORDER.get(left.platform) - PLATFORM_ORDER.get(right.platform));
  const recomputed = hash({
    renderFingerprint: receipt.renderFingerprint,
    bundleManifestFingerprint: receipt.bundleManifestFingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  return recomputed === receipt.visualReviewFingerprint ? receipt : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_asset_handoff_plan_blocked",
    blockers: [],
    sourceRenderFingerprint: null,
    bundleManifestFingerprint: null,
    visualReviewFingerprint: null,
    assetHandoffPlanFingerprint: null,
    bundleDirectory: null,
    platformPlans: [],
    plannedAssetCount: 0,
    reviewedAssetReferencesPrepared: false,
    eligibleForAssetHandoffAuthorization: false,
    readyForAssetHandoff: false,
    assetsUnlocked: false,
    visualAssetsReady: false,
    assetUploadReady: false,
    filesystemReads: 0,
    filesystemMutations: false,
    browserOpenPerformed: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead) {
  const blockers = [];
  const current = safeInspection(bundleInspection);
  if (!current) blockers.push("platform_text_svg_bundle_inspection_invalid_or_tampered");
  const receipt = current ? safeVisualReviewRead(visualReviewRead, bundleInspection, current) : null;
  if (!receipt) blockers.push("durable_platform_text_visual_review_invalid_or_stale");
  if (blockers.length || !current || !receipt) return safeResult({ blockers });

  const platformPlans = current.platforms.map((platform) => {
    const assets = current.assets.filter((asset) => asset.platform === platform).map((asset) => ({
      cardIndex: asset.cardIndex,
      role: asset.role,
      filename: asset.filename,
      relativePath: `${bundleInspection.bundleDirectory}/${asset.filename}`,
      width: asset.width,
      height: asset.height,
      svgBytes: asset.svgBytes,
      copyFingerprint: asset.copyFingerprint,
      svgFingerprint: asset.svgFingerprint,
      verificationStatus: "durable_human_visual_review_confirmed_current",
    }));
    return {
      platform,
      assetCount: assets.length,
      assets,
      handoffStatus: "planned_not_authorized",
    };
  });
  const fingerprintPayload = {
    sourceRenderFingerprint: bundleInspection.renderFingerprint,
    bundleManifestFingerprint: bundleInspection.bundleManifestFingerprint,
    visualReviewFingerprint: receipt.visualReviewFingerprint,
    bundleDirectory: bundleInspection.bundleDirectory,
    platformPlans,
  };
  return safeResult({
    status: "platform_text_visual_asset_handoff_plan_ready",
    ...fingerprintPayload,
    assetHandoffPlanFingerprint: hash(fingerprintPayload),
    plannedAssetCount: current.assets.length,
    reviewedAssetReferencesPrepared: true,
    eligibleForAssetHandoffAuthorization: true,
  });
}
