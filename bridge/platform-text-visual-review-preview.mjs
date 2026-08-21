import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const PLATFORM_CANVAS = Object.freeze({
  xiaohongshu: Object.freeze({ width: 1080, height: 1440 }),
  douyin: Object.freeze({ width: 1080, height: 1920 }),
});

export const PLATFORM_TEXT_VISUAL_REVIEW_CONFIRMATION = "CONFIRM_CURRENT_PLATFORM_TEXT_VISUALS";
export const PLATFORM_TEXT_VISUAL_REVIEW_CHECKS = Object.freeze([
  "all_cards_opened",
  "text_legibility_approved",
  "no_clipping_or_overflow_approved",
  "exact_copy_matches_reviewed_draft",
  "canvas_sequence_and_hierarchy_approved",
  "source_and_uncertainty_notes_legible",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 8 && normalized.length <= maxLength ? normalized : null;
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
      || !["cover", "body"].includes(asset?.role)
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
      || platformOrder !== previousPlatform && (asset.cardIndex !== 1 || asset.role !== "cover")
      || platformOrder === previousPlatform && (asset.cardIndex !== previousCardIndex + 1 || asset.role !== "body")
    ) return null;
    if (platformOrder !== previousPlatform) platforms.push(asset.platform);
    filenames.add(asset.filename);
    previousPlatform = platformOrder;
    previousCardIndex = asset.cardIndex;
    assets.push({
      platform: asset.platform,
      cardIndex: asset.cardIndex,
      role: asset.role,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      svgBytes: asset.svgBytes,
      copyFingerprint: asset.copyFingerprint,
      svgFingerprint: asset.svgFingerprint,
    });
  }
  if (platforms.length !== PLATFORM_ORDER.size) return null;
  return { platforms, assets };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_review_preview_blocked",
    blockers: [],
    receiptPreview: null,
    visualReviewFingerprint: null,
    idempotencyKey: null,
    reviewedPlatformCountInPreview: 0,
    reviewedAssetCountInPreview: 0,
    eligibleForAuthorizedVisualReviewSave: false,
    persistenceAuthorizationRequired: true,
    persistenceAuthorizationGranted: false,
    visualReviewPersisted: false,
    humanVisualReviewCompleted: false,
    visualAssetsReady: false,
    assetUploadReady: false,
    readyForDraftHandoff: false,
    draftSaved: false,
    browserOpenPerformed: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextVisualReviewPreview(bundleInspection, reviews = [], {
  confirmedRenderFingerprint = null,
  confirmedBundleManifestFingerprint = null,
  confirmation = null,
} = {}) {
  const blockers = [];
  const current = safeInspection(bundleInspection);
  if (!current) blockers.push("platform_text_svg_bundle_inspection_invalid_or_tampered");
  if (confirmedRenderFingerprint !== bundleInspection?.renderFingerprint) blockers.push("render_fingerprint_confirmation_mismatch");
  if (confirmedBundleManifestFingerprint !== bundleInspection?.bundleManifestFingerprint) blockers.push("bundle_manifest_fingerprint_confirmation_mismatch");
  if (confirmation !== PLATFORM_TEXT_VISUAL_REVIEW_CONFIRMATION) blockers.push("platform_text_visual_review_confirmation_invalid");
  if (!Array.isArray(reviews) || reviews.length !== (current?.platforms.length ?? 0)) blockers.push("platform_text_visual_reviews_incomplete");

  const reviewedPlatforms = [];
  const seenPlatforms = new Set();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const platform = typeof review?.platform === "string" ? review.platform.trim().toLowerCase() : "";
    const reviewBlockers = [];
    if (!current?.platforms.includes(platform) || seenPlatforms.has(platform)) reviewBlockers.push("platform_not_current_or_duplicate");
    seenPlatforms.add(platform);
    if (review?.approve !== true) reviewBlockers.push("explicit_platform_visual_approval_required");
    const reviewNote = cleanText(review?.reviewNote, 500);
    if (!reviewNote) reviewBlockers.push("review_note_required");
    const checks = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks) ? review.checks : {};
    if (Object.keys(checks).some((check) => !PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.includes(check))) reviewBlockers.push("unexpected_visual_review_checks");
    if (PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.some((check) => checks[check] !== true)) reviewBlockers.push("human_visual_review_checks_incomplete");
    if (reviewBlockers.length) {
      blockers.push(...reviewBlockers.map((blocker) => `${platform || "missing"}:${blocker}`));
      continue;
    }
    const assets = current.assets
      .filter((asset) => asset.platform === platform)
      .map(({ cardIndex, role, filename, copyFingerprint, svgFingerprint }) => ({
        cardIndex,
        role,
        filename,
        copyFingerprint,
        svgFingerprint,
      }));
    reviewedPlatforms.push({
      platform,
      assetCount: assets.length,
      assets,
      reviewNote,
      checks: Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true])),
      status: "human_visual_reviewed_in_preview_not_persisted",
    });
  }
  reviewedPlatforms.sort((left, right) => PLATFORM_ORDER.get(left.platform) - PLATFORM_ORDER.get(right.platform));
  if (blockers.length || !current) return safeResult({ blockers: [...new Set(blockers)] });

  const visualReviewFingerprint = hash({
    renderFingerprint: bundleInspection.renderFingerprint,
    bundleManifestFingerprint: bundleInspection.bundleManifestFingerprint,
    reviewedPlatforms,
  });
  return safeResult({
    status: "platform_text_visual_review_preview_ready",
    receiptPreview: {
      receiptId: `ptvrp_${visualReviewFingerprint}`,
      renderFingerprint: bundleInspection.renderFingerprint,
      bundleManifestFingerprint: bundleInspection.bundleManifestFingerprint,
      reviewedPlatforms,
      status: "preview_not_persisted",
    },
    visualReviewFingerprint,
    idempotencyKey: `platform-text-visual-review:${visualReviewFingerprint}`,
    reviewedPlatformCountInPreview: reviewedPlatforms.length,
    reviewedAssetCountInPreview: reviewedPlatforms.reduce((sum, item) => sum + item.assetCount, 0),
    eligibleForAuthorizedVisualReviewSave: true,
  });
}
