import { createHash } from "node:crypto";

import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "../bridge/platform-text-draft-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SUPPORTED_PLATFORMS = new Set(["xiaohongshu", "douyin"]);
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);

export const READ_PLATFORM_TEXT_DRAFT_REVIEW_SQL = `SELECT
  r.id AS receipt_id,
  r.draft_preview_fingerprint,
  r.blueprint_fingerprint,
  r.review_fingerprint,
  r.idempotency_key,
  r.status AS receipt_status,
  r.created_at AS receipt_created_at,
  p.platform,
  p.draft_fingerprint,
  p.review_note,
  p.review_checks_json,
  p.created_at AS platform_review_created_at
FROM platform_text_draft_review_receipts r
LEFT JOIN platform_text_draft_review_platforms p ON p.receipt_id = r.id
WHERE r.review_fingerprint = ?
ORDER BY p.platform`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_draft_review_read_blocked",
    blockers: [],
    found: false,
    receipt: null,
    readFingerprint: null,
    reviewedPlatforms: 0,
    durableHumanReview: false,
    durableReviewInputReady: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    readyForDraftHandoff: false,
    draftSaved: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseChecks(value) {
  try {
    const checks = JSON.parse(value);
    const names = checks && typeof checks === "object" && !Array.isArray(checks) ? Object.keys(checks) : [];
    return names.length === PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.length
      && names.every((check) => PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.includes(check))
      && PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.every((check) => checks[check] === true)
      ? Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true]))
      : null;
  } catch {
    return null;
  }
}

function mapReceipt(rows, expectedFingerprint) {
  const first = rows[0];
  const common = [
    "receipt_id", "draft_preview_fingerprint", "blueprint_fingerprint", "review_fingerprint",
    "idempotency_key", "receipt_status", "receipt_created_at",
  ];
  if (rows.some((row) => common.some((field) => row?.[field] !== first?.[field]))) {
    return { blocker: "platform_text_draft_review_receipt_rows_inconsistent" };
  }
  if (
    first?.receipt_id !== `ptdrp_${expectedFingerprint}`
    || first?.review_fingerprint !== expectedFingerprint
    || first?.idempotency_key !== `platform-text-draft-review:${expectedFingerprint}`
    || first?.receipt_status !== "active"
    || !HASH.test(first?.draft_preview_fingerprint ?? "")
    || !HASH.test(first?.blueprint_fingerprint ?? "")
    || !text(first?.receipt_created_at)
  ) return { blocker: "platform_text_draft_review_receipt_invalid" };
  if (rows.length < 1 || rows.length > 2) return { blocker: "platform_text_draft_review_platform_count_invalid" };

  const seenPlatforms = new Set();
  const persistedPlatforms = [];
  const fingerprintPlatforms = [];
  for (const row of rows) {
    const platform = text(row?.platform);
    const reviewNote = text(row?.review_note);
    const checks = parseChecks(row?.review_checks_json);
    if (
      !SUPPORTED_PLATFORMS.has(platform)
      || seenPlatforms.has(platform)
      || !HASH.test(row?.draft_fingerprint ?? "")
      || !reviewNote
      || reviewNote.length < 8
      || !checks
      || !text(row?.platform_review_created_at)
    ) return { blocker: `platform_text_draft_review_platform_invalid:${platform ?? "missing"}` };
    seenPlatforms.add(platform);
    fingerprintPlatforms.push({
      platform,
      draftFingerprint: row.draft_fingerprint,
      reviewNote,
      checks,
      status: "human_reviewed_in_preview_not_persisted",
    });
    persistedPlatforms.push({
      platform,
      draftFingerprint: row.draft_fingerprint,
      reviewNote,
      checks,
      status: "human_reviewed_persisted",
      createdAt: row.platform_review_created_at.trim(),
    });
  }
  fingerprintPlatforms.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  persistedPlatforms.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  const recomputed = hash({
    draftPreviewFingerprint: first.draft_preview_fingerprint,
    blueprintFingerprint: first.blueprint_fingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  if (recomputed !== expectedFingerprint) return { blocker: "platform_text_draft_review_persisted_data_tampered" };

  return {
    receipt: {
      receiptId: first.receipt_id,
      draftPreviewFingerprint: first.draft_preview_fingerprint,
      blueprintFingerprint: first.blueprint_fingerprint,
      reviewFingerprint: first.review_fingerprint,
      idempotencyKey: first.idempotency_key,
      status: first.receipt_status,
      createdAt: first.receipt_created_at.trim(),
      reviewedPlatforms: persistedPlatforms,
    },
  };
}

export function createPlatformTextDraftReviewReader(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async readByReviewFingerprint(reviewFingerprint) {
      if (!HASH.test(reviewFingerprint ?? "")) {
        return safeResult({ blockers: ["platform_text_draft_review_fingerprint_invalid"] });
      }

      let queryResult;
      try {
        queryResult = await d1.prepare(READ_PLATFORM_TEXT_DRAFT_REVIEW_SQL).bind(reviewFingerprint).all();
      } catch {
        return safeResult({
          status: "platform_text_draft_review_read_failed",
          blockers: ["platform_text_draft_review_query_failed"],
          databaseReadAttempted: true,
        });
      }
      const rows = Array.isArray(queryResult?.results) ? queryResult.results : [];
      if (rows.length === 0) {
        return safeResult({
          status: "platform_text_draft_review_not_found",
          blockers: ["platform_text_draft_review_not_found"],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }

      const mapped = mapReceipt(rows, reviewFingerprint);
      if (!mapped.receipt) {
        return safeResult({
          blockers: [mapped.blocker],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }
      return safeResult({
        status: "platform_text_draft_review_read_ready",
        blockers: [],
        found: true,
        receipt: mapped.receipt,
        readFingerprint: hash(mapped.receipt),
        reviewedPlatforms: mapped.receipt.reviewedPlatforms.length,
        durableHumanReview: true,
        durableReviewInputReady: true,
        databaseReadAttempted: true,
        databaseReads: 1,
      });
    },
  };
}
