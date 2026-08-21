import { createHash } from "node:crypto";

import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "../bridge/platform-text-draft-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SUPPORTED_PLATFORMS = new Set(["xiaohongshu", "douyin"]);
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);

export const PLATFORM_TEXT_DRAFT_REVIEW_SAVE_CONFIRMATION = "SAVE_PLATFORM_TEXT_DRAFT_REVIEW";

export const INSPECT_PLATFORM_TEXT_DRAFT_REVIEW_SQL = `SELECT
  r.id,
  r.draft_preview_fingerprint,
  r.blueprint_fingerprint,
  r.review_fingerprint,
  r.idempotency_key,
  r.status,
  (SELECT COUNT(*) FROM platform_text_draft_review_platforms p WHERE p.receipt_id = r.id) AS platform_count
FROM platform_text_draft_review_receipts r
WHERE r.review_fingerprint = ?`;

const INSERT_RECEIPT_SQL = `INSERT INTO platform_text_draft_review_receipts (
  id, draft_preview_fingerprint, blueprint_fingerprint, review_fingerprint,
  idempotency_key, status, created_at
) VALUES (?, ?, ?, ?, ?, 'active', ?)`;

const INSERT_PLATFORM_SQL = `INSERT INTO platform_text_draft_review_platforms (
  receipt_id, platform, draft_fingerprint, review_note, review_checks_json, created_at
) VALUES (?, ?, ?, ?, ?, ?)`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_draft_review_save_blocked",
    blockers: [],
    eligible: false,
    persisted: false,
    alreadyPersisted: false,
    reviewReceiptsCreated: 0,
    platformReviewsCreated: 0,
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
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
    preview?.status !== "platform_text_draft_review_preview_ready"
    || preview?.eligibleForAuthorizedReviewSave !== true
  ) blockers.push("platform_text_draft_review_preview_not_ready");
  if (!HASH.test(preview?.reviewFingerprint ?? "")) blockers.push("platform_text_draft_review_fingerprint_invalid");

  const receipt = preview?.receiptPreview;
  const reviewedPlatforms = receipt?.reviewedPlatforms;
  if (
    receipt?.receiptId !== `ptdrp_${preview?.reviewFingerprint}`
    || receipt?.status !== "preview_not_persisted"
    || !HASH.test(receipt?.draftPreviewFingerprint ?? "")
    || !HASH.test(receipt?.blueprintFingerprint ?? "")
    || !Array.isArray(reviewedPlatforms)
    || reviewedPlatforms.length < 1
    || reviewedPlatforms.length > 2
    || reviewedPlatforms.length !== preview?.reviewedPlatformCountInPreview
  ) {
    blockers.push("platform_text_draft_review_receipt_invalid");
    return;
  }

  const seenPlatforms = new Set();
  for (const review of reviewedPlatforms) {
    const checkNames = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks)
      ? Object.keys(review.checks)
      : [];
    if (
      !SUPPORTED_PLATFORMS.has(review?.platform)
      || seenPlatforms.has(review?.platform)
      || !HASH.test(review?.draftFingerprint ?? "")
      || typeof review?.reviewNote !== "string"
      || review.reviewNote.trim().length < 8
      || review.status !== "human_reviewed_in_preview_not_persisted"
      || checkNames.length !== PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.length
      || checkNames.some((check) => !PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.includes(check))
      || PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.some((check) => review?.checks?.[check] !== true)
    ) blockers.push(`platform_text_draft_review_platform_invalid:${review?.platform ?? "missing"}`);
    seenPlatforms.add(review?.platform);
  }

  const orderedPlatforms = [...reviewedPlatforms].sort(
    (left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99),
  );
  if (JSON.stringify(orderedPlatforms) !== JSON.stringify(reviewedPlatforms)) blockers.push("platform_text_draft_review_platform_order_invalid");

  const recomputed = hash({
    draftPreviewFingerprint: receipt.draftPreviewFingerprint,
    blueprintFingerprint: receipt.blueprintFingerprint,
    reviewedPlatforms,
  });
  if (recomputed !== preview.reviewFingerprint) blockers.push("platform_text_draft_review_preview_tampered");
  if (preview.idempotencyKey !== `platform-text-draft-review:${preview.reviewFingerprint}`) blockers.push("platform_text_draft_review_idempotency_key_invalid");
}

export function assessPlatformTextDraftReviewSaveRequest({
  preview,
  executeRequested = false,
  confirmation = null,
  authorizedReviewFingerprint = null,
} = {}) {
  const blockers = [];
  validatePreview(preview, blockers);
  if (executeRequested !== true) blockers.push("platform_text_draft_review_save_not_requested");
  if (confirmation !== PLATFORM_TEXT_DRAFT_REVIEW_SAVE_CONFIRMATION) blockers.push("platform_text_draft_review_save_confirmation_invalid");
  if (authorizedReviewFingerprint !== preview?.reviewFingerprint) blockers.push("platform_text_draft_review_save_fingerprint_mismatch");
  return safeResult({
    status: blockers.length ? "platform_text_draft_review_save_blocked" : "platform_text_draft_review_save_authorized",
    blockers: [...new Set(blockers)],
    eligible: blockers.length === 0,
    authorizedReviewFingerprint: blockers.length ? null : authorizedReviewFingerprint,
  });
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("platform_text_draft_review_timestamp_invalid");
  return date.toISOString();
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export function createPlatformTextDraftReviewStore(d1, { now = () => new Date() } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessPlatformTextDraftReviewSaveRequest(input);
      if (!gate.eligible) return gate;
      const { preview } = input;
      const receipt = preview.receiptPreview;
      const existing = await d1.prepare(INSPECT_PLATFORM_TEXT_DRAFT_REVIEW_SQL).bind(preview.reviewFingerprint).first();
      if (existing) {
        const complete = existing.id === receipt.receiptId
          && existing.draft_preview_fingerprint === receipt.draftPreviewFingerprint
          && existing.blueprint_fingerprint === receipt.blueprintFingerprint
          && existing.idempotency_key === preview.idempotencyKey
          && existing.status === "active"
          && Number(existing.platform_count) === receipt.reviewedPlatforms.length;
        if (!complete) return safeResult({ status: "platform_text_draft_review_existing_record_incomplete", blockers: ["platform_text_draft_review_existing_record_incomplete"] });
        return safeResult({
          status: "platform_text_draft_review_already_persisted",
          eligible: true,
          alreadyPersisted: true,
          receiptId: existing.id,
        });
      }

      let timestamp;
      try {
        timestamp = timestampFrom(now);
      } catch {
        return safeResult({ blockers: ["platform_text_draft_review_timestamp_invalid"] });
      }
      const statements = [d1.prepare(INSERT_RECEIPT_SQL).bind(
        receipt.receiptId,
        receipt.draftPreviewFingerprint,
        receipt.blueprintFingerprint,
        preview.reviewFingerprint,
        preview.idempotencyKey,
        timestamp,
      )];
      for (const review of receipt.reviewedPlatforms) {
        statements.push(d1.prepare(INSERT_PLATFORM_SQL).bind(
          receipt.receiptId,
          review.platform,
          review.draftFingerprint,
          review.reviewNote,
          JSON.stringify(review.checks),
          timestamp,
        ));
      }

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({ status: "platform_text_draft_review_atomic_batch_failed", blockers: ["platform_text_draft_review_atomic_batch_failed"], databaseWriteAttempted: true });
      } catch {
        return safeResult({ status: "platform_text_draft_review_atomic_batch_failed", blockers: ["platform_text_draft_review_atomic_batch_failed"], databaseWriteAttempted: true });
      }

      return safeResult({
        status: "platform_text_draft_review_persisted",
        eligible: true,
        persisted: true,
        receiptId: receipt.receiptId,
        reviewReceiptsCreated: 1,
        platformReviewsCreated: receipt.reviewedPlatforms.length,
        databaseWriteAttempted: true,
        databaseWrites: true,
      });
    },
  };
}
