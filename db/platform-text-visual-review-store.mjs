import { createHash } from "node:crypto";

import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);

export const PLATFORM_TEXT_VISUAL_REVIEW_SAVE_CONFIRMATION = "SAVE_PLATFORM_TEXT_VISUAL_REVIEW";

export const INSPECT_PLATFORM_TEXT_VISUAL_REVIEW_SQL = `SELECT
  r.id,
  r.render_fingerprint,
  r.bundle_manifest_fingerprint,
  r.visual_review_fingerprint,
  r.idempotency_key,
  r.status,
  (SELECT COUNT(*) FROM platform_text_visual_review_platforms p WHERE p.receipt_id = r.id) AS platform_count,
  (SELECT COUNT(*) FROM platform_text_visual_review_assets a WHERE a.receipt_id = r.id) AS asset_count
FROM platform_text_visual_review_receipts r
WHERE r.visual_review_fingerprint = ?`;

const INSERT_RECEIPT_SQL = `INSERT INTO platform_text_visual_review_receipts (
  id, render_fingerprint, bundle_manifest_fingerprint, visual_review_fingerprint,
  idempotency_key, status, created_at
) VALUES (?, ?, ?, ?, ?, 'active', ?)`;

const INSERT_PLATFORM_SQL = `INSERT INTO platform_text_visual_review_platforms (
  receipt_id, platform, asset_count, review_note, review_checks_json, created_at
) VALUES (?, ?, ?, ?, ?, ?)`;

const INSERT_ASSET_SQL = `INSERT INTO platform_text_visual_review_assets (
  receipt_id, platform, card_index, role, filename, copy_fingerprint, svg_fingerprint, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_review_save_blocked",
    blockers: [],
    eligible: false,
    persisted: false,
    alreadyPersisted: false,
    visualReviewReceiptsCreated: 0,
    platformReviewsCreated: 0,
    assetLinksCreated: 0,
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
    humanVisualReviewCompleted: false,
    visualAssetsReady: false,
    assetUploadReady: false,
    readyForDraftHandoff: false,
    draftSaved: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validatePreview(preview, blockers) {
  if (
    preview?.status !== "platform_text_visual_review_preview_ready"
    || preview?.eligibleForAuthorizedVisualReviewSave !== true
  ) blockers.push("platform_text_visual_review_preview_not_ready");
  if (!HASH.test(preview?.visualReviewFingerprint ?? "")) blockers.push("platform_text_visual_review_fingerprint_invalid");

  const receipt = preview?.receiptPreview;
  const reviewedPlatforms = receipt?.reviewedPlatforms;
  if (
    receipt?.receiptId !== `ptvrp_${preview?.visualReviewFingerprint}`
    || receipt?.status !== "preview_not_persisted"
    || !HASH.test(receipt?.renderFingerprint ?? "")
    || !HASH.test(receipt?.bundleManifestFingerprint ?? "")
    || !Array.isArray(reviewedPlatforms)
    || reviewedPlatforms.length !== PLATFORM_ORDER.size
    || reviewedPlatforms.length !== preview?.reviewedPlatformCountInPreview
  ) {
    blockers.push("platform_text_visual_review_receipt_invalid");
    return;
  }

  const seenPlatforms = new Set();
  let totalAssets = 0;
  for (const review of reviewedPlatforms) {
    const checkNames = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks)
      ? Object.keys(review.checks)
      : [];
    if (
      !PLATFORM_ORDER.has(review?.platform)
      || seenPlatforms.has(review?.platform)
      || !Number.isInteger(review?.assetCount)
      || review.assetCount < 1
      || review.assetCount > 9
      || !Array.isArray(review?.assets)
      || review.assets.length !== review.assetCount
      || typeof review?.reviewNote !== "string"
      || review.reviewNote.trim().length < 8
      || review.reviewNote.length > 500
      || review.status !== "human_visual_reviewed_in_preview_not_persisted"
      || checkNames.length !== PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.length
      || checkNames.some((check) => !PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.includes(check))
      || PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.some((check) => review?.checks?.[check] !== true)
    ) blockers.push(`platform_text_visual_review_platform_invalid:${review?.platform ?? "missing"}`);
    seenPlatforms.add(review?.platform);

    const filenames = new Set();
    let previousCardIndex = 0;
    for (const asset of Array.isArray(review?.assets) ? review.assets : []) {
      if (
        !Number.isInteger(asset?.cardIndex)
        || asset.cardIndex !== previousCardIndex + 1
        || !["cover", "body"].includes(asset?.role)
        || asset.role !== (asset.cardIndex === 1 ? "cover" : "body")
        || asset.filename !== `${review.platform}-${String(asset.cardIndex).padStart(2, "0")}-${asset.role}.svg`
        || filenames.has(asset.filename)
        || !HASH.test(asset?.copyFingerprint ?? "")
        || !HASH.test(asset?.svgFingerprint ?? "")
      ) blockers.push(`platform_text_visual_review_asset_invalid:${review?.platform ?? "missing"}:${asset?.cardIndex ?? "missing"}`);
      filenames.add(asset?.filename);
      previousCardIndex = asset?.cardIndex;
      totalAssets += 1;
    }
  }

  const orderedPlatforms = [...reviewedPlatforms].sort(
    (left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99),
  );
  if (JSON.stringify(orderedPlatforms) !== JSON.stringify(reviewedPlatforms)) blockers.push("platform_text_visual_review_platform_order_invalid");
  if (totalAssets !== preview?.reviewedAssetCountInPreview) blockers.push("platform_text_visual_review_asset_count_invalid");

  const recomputed = hash({
    renderFingerprint: receipt.renderFingerprint,
    bundleManifestFingerprint: receipt.bundleManifestFingerprint,
    reviewedPlatforms,
  });
  if (recomputed !== preview.visualReviewFingerprint) blockers.push("platform_text_visual_review_preview_tampered");
  if (preview.idempotencyKey !== `platform-text-visual-review:${preview.visualReviewFingerprint}`) blockers.push("platform_text_visual_review_idempotency_key_invalid");
}

export function assessPlatformTextVisualReviewSaveRequest({
  preview,
  executeRequested = false,
  confirmation = null,
  authorizedVisualReviewFingerprint = null,
} = {}) {
  const blockers = [];
  validatePreview(preview, blockers);
  if (executeRequested !== true) blockers.push("platform_text_visual_review_save_not_requested");
  if (confirmation !== PLATFORM_TEXT_VISUAL_REVIEW_SAVE_CONFIRMATION) blockers.push("platform_text_visual_review_save_confirmation_invalid");
  if (authorizedVisualReviewFingerprint !== preview?.visualReviewFingerprint) blockers.push("platform_text_visual_review_save_fingerprint_mismatch");
  return safeResult({
    status: blockers.length ? "platform_text_visual_review_save_blocked" : "platform_text_visual_review_save_authorized",
    blockers: [...new Set(blockers)],
    eligible: blockers.length === 0,
    authorizedVisualReviewFingerprint: blockers.length ? null : authorizedVisualReviewFingerprint,
  });
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("platform_text_visual_review_timestamp_invalid");
  return date.toISOString();
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export function createPlatformTextVisualReviewStore(d1, { now = () => new Date() } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessPlatformTextVisualReviewSaveRequest(input);
      if (!gate.eligible) return gate;
      const { preview } = input;
      const receipt = preview.receiptPreview;
      const existing = await d1.prepare(INSPECT_PLATFORM_TEXT_VISUAL_REVIEW_SQL).bind(preview.visualReviewFingerprint).first();
      if (existing) {
        const complete = existing.id === receipt.receiptId
          && existing.render_fingerprint === receipt.renderFingerprint
          && existing.bundle_manifest_fingerprint === receipt.bundleManifestFingerprint
          && existing.idempotency_key === preview.idempotencyKey
          && existing.status === "active"
          && Number(existing.platform_count) === receipt.reviewedPlatforms.length
          && Number(existing.asset_count) === preview.reviewedAssetCountInPreview;
        if (!complete) return safeResult({ status: "platform_text_visual_review_existing_record_incomplete", blockers: ["platform_text_visual_review_existing_record_incomplete"] });
        return safeResult({
          status: "platform_text_visual_review_already_persisted",
          eligible: true,
          alreadyPersisted: true,
          receiptId: existing.id,
        });
      }

      let timestamp;
      try {
        timestamp = timestampFrom(now);
      } catch {
        return safeResult({ blockers: ["platform_text_visual_review_timestamp_invalid"] });
      }
      const statements = [d1.prepare(INSERT_RECEIPT_SQL).bind(
        receipt.receiptId,
        receipt.renderFingerprint,
        receipt.bundleManifestFingerprint,
        preview.visualReviewFingerprint,
        preview.idempotencyKey,
        timestamp,
      )];
      for (const review of receipt.reviewedPlatforms) {
        statements.push(d1.prepare(INSERT_PLATFORM_SQL).bind(
          receipt.receiptId,
          review.platform,
          review.assetCount,
          review.reviewNote,
          JSON.stringify(review.checks),
          timestamp,
        ));
        for (const asset of review.assets) {
          statements.push(d1.prepare(INSERT_ASSET_SQL).bind(
            receipt.receiptId,
            review.platform,
            asset.cardIndex,
            asset.role,
            asset.filename,
            asset.copyFingerprint,
            asset.svgFingerprint,
            timestamp,
          ));
        }
      }

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({ status: "platform_text_visual_review_atomic_batch_failed", blockers: ["platform_text_visual_review_atomic_batch_failed"], databaseWriteAttempted: true });
      } catch {
        return safeResult({ status: "platform_text_visual_review_atomic_batch_failed", blockers: ["platform_text_visual_review_atomic_batch_failed"], databaseWriteAttempted: true });
      }

      return safeResult({
        status: "platform_text_visual_review_persisted",
        eligible: true,
        persisted: true,
        receiptId: receipt.receiptId,
        visualReviewReceiptsCreated: 1,
        platformReviewsCreated: receipt.reviewedPlatforms.length,
        assetLinksCreated: preview.reviewedAssetCountInPreview,
        databaseWriteAttempted: true,
        databaseWrites: true,
      });
    },
  };
}
