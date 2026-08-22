import { createHash } from "node:crypto";

import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const SUPPORTED_PLATFORMS = new Set(["xiaohongshu", "douyin"]);
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);

export const READ_PLATFORM_TEXT_VISUAL_REVIEW_SQL = `SELECT
  r.id AS receipt_id,
  r.render_fingerprint,
  r.bundle_manifest_fingerprint,
  r.visual_review_fingerprint,
  r.idempotency_key,
  r.status AS receipt_status,
  r.created_at AS receipt_created_at,
  p.platform,
  p.asset_count,
  p.review_note,
  p.review_checks_json,
  p.created_at AS platform_review_created_at,
  a.card_index,
  a.role,
  a.filename,
  a.copy_fingerprint,
  a.svg_fingerprint,
  a.created_at AS asset_created_at
FROM platform_text_visual_review_receipts r
LEFT JOIN platform_text_visual_review_platforms p ON p.receipt_id = r.id
LEFT JOIN platform_text_visual_review_assets a ON a.receipt_id = r.id AND a.platform = p.platform
WHERE r.visual_review_fingerprint = ?
ORDER BY p.platform, a.card_index`;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_review_read_blocked",
    blockers: [],
    found: false,
    receipt: null,
    readFingerprint: null,
    reviewedPlatforms: 0,
    reviewedAssets: 0,
    durableHumanReview: false,
    durableVisualReviewInputReady: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    readyForAssetHandoff: false,
    assetsUnlocked: false,
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
    return names.length === PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.length
      && names.every((check) => PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.includes(check))
      && PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.every((check) => checks[check] === true)
      ? Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true]))
      : null;
  } catch {
    return null;
  }
}

function mapReceipt(rows, expectedFingerprint) {
  const first = rows[0];
  const common = [
    "receipt_id", "render_fingerprint", "bundle_manifest_fingerprint", "visual_review_fingerprint",
    "idempotency_key", "receipt_status", "receipt_created_at",
  ];
  if (rows.some((row) => common.some((field) => row?.[field] !== first?.[field]))) {
    return { blocker: "platform_text_visual_review_receipt_rows_inconsistent" };
  }
  if (
    first?.receipt_id !== `ptvrp_${expectedFingerprint}`
    || first?.visual_review_fingerprint !== expectedFingerprint
    || first?.idempotency_key !== `platform-text-visual-review:${expectedFingerprint}`
    || first?.receipt_status !== "active"
    || !HASH.test(first?.render_fingerprint ?? "")
    || !HASH.test(first?.bundle_manifest_fingerprint ?? "")
    || !text(first?.receipt_created_at)
  ) return { blocker: "platform_text_visual_review_receipt_invalid" };

  const groups = new Map();
  for (const row of rows) {
    const platform = text(row?.platform);
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return { blocker: `platform_text_visual_review_platform_invalid:${platform ?? "missing"}` };
    }
    const existing = groups.get(platform);
    const platformFields = ["asset_count", "review_note", "review_checks_json", "platform_review_created_at"];
    if (existing && platformFields.some((field) => row?.[field] !== existing.row?.[field])) {
      return { blocker: `platform_text_visual_review_platform_rows_inconsistent:${platform}` };
    }
    if (!existing) groups.set(platform, { row, assets: [] });
    groups.get(platform).assets.push(row);
  }
  if (groups.size !== SUPPORTED_PLATFORMS.size) {
    return { blocker: "platform_text_visual_review_platform_count_invalid" };
  }

  const fingerprintPlatforms = [];
  const persistedPlatforms = [];
  let reviewedAssetCount = 0;
  for (const platform of [...groups.keys()].sort((left, right) => PLATFORM_ORDER.get(left) - PLATFORM_ORDER.get(right))) {
    const group = groups.get(platform);
    const reviewNote = text(group.row?.review_note);
    const checks = parseChecks(group.row?.review_checks_json);
    const expectedAssetCount = Number(group.row?.asset_count);
    if (
      !Number.isInteger(expectedAssetCount)
      || expectedAssetCount < 1
      || expectedAssetCount > 9
      || expectedAssetCount !== group.assets.length
      || !reviewNote
      || reviewNote.length < 8
      || reviewNote.length > 500
      || !checks
      || !text(group.row?.platform_review_created_at)
    ) return { blocker: `platform_text_visual_review_platform_invalid:${platform}` };

    const fingerprintAssets = [];
    const persistedAssets = [];
    const filenames = new Set();
    for (const [index, row] of group.assets.entries()) {
      const cardIndex = Number(row?.card_index);
      const role = text(row?.role);
      const filename = text(row?.filename);
      if (
        !Number.isInteger(cardIndex)
        || cardIndex !== index + 1
        || role !== (cardIndex === 1 ? "cover" : "body")
        || filename !== `${platform}-${String(cardIndex).padStart(2, "0")}-${role}.svg`
        || filenames.has(filename)
        || !HASH.test(row?.copy_fingerprint ?? "")
        || !HASH.test(row?.svg_fingerprint ?? "")
        || !text(row?.asset_created_at)
      ) return { blocker: `platform_text_visual_review_asset_invalid:${platform}:${row?.card_index ?? "missing"}` };
      filenames.add(filename);
      fingerprintAssets.push({
        cardIndex,
        role,
        filename,
        copyFingerprint: row.copy_fingerprint,
        svgFingerprint: row.svg_fingerprint,
      });
      persistedAssets.push({
        ...fingerprintAssets.at(-1),
        createdAt: row.asset_created_at.trim(),
      });
    }
    fingerprintPlatforms.push({
      platform,
      assetCount: expectedAssetCount,
      assets: fingerprintAssets,
      reviewNote,
      checks,
      status: "human_visual_reviewed_in_preview_not_persisted",
    });
    persistedPlatforms.push({
      platform,
      assetCount: expectedAssetCount,
      assets: persistedAssets,
      reviewNote,
      checks,
      status: "human_visual_reviewed_persisted",
      createdAt: group.row.platform_review_created_at.trim(),
    });
    reviewedAssetCount += expectedAssetCount;
  }

  const recomputed = hash({
    renderFingerprint: first.render_fingerprint,
    bundleManifestFingerprint: first.bundle_manifest_fingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  if (recomputed !== expectedFingerprint) {
    return { blocker: "platform_text_visual_review_persisted_data_tampered" };
  }

  return {
    reviewedAssetCount,
    receipt: {
      receiptId: first.receipt_id,
      renderFingerprint: first.render_fingerprint,
      bundleManifestFingerprint: first.bundle_manifest_fingerprint,
      visualReviewFingerprint: first.visual_review_fingerprint,
      idempotencyKey: first.idempotency_key,
      status: first.receipt_status,
      createdAt: first.receipt_created_at.trim(),
      reviewedPlatforms: persistedPlatforms,
    },
  };
}

export function createPlatformTextVisualReviewReader(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async readByVisualReviewFingerprint(visualReviewFingerprint) {
      if (!HASH.test(visualReviewFingerprint ?? "")) {
        return safeResult({ blockers: ["platform_text_visual_review_fingerprint_invalid"] });
      }

      let queryResult;
      try {
        queryResult = await d1.prepare(READ_PLATFORM_TEXT_VISUAL_REVIEW_SQL).bind(visualReviewFingerprint).all();
      } catch {
        return safeResult({
          status: "platform_text_visual_review_read_failed",
          blockers: ["platform_text_visual_review_query_failed"],
          databaseReadAttempted: true,
        });
      }
      const rows = Array.isArray(queryResult?.results) ? queryResult.results : [];
      if (rows.length === 0) {
        return safeResult({
          status: "platform_text_visual_review_not_found",
          blockers: ["platform_text_visual_review_not_found"],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }

      const mapped = mapReceipt(rows, visualReviewFingerprint);
      if (!mapped.receipt) {
        return safeResult({
          blockers: [mapped.blocker],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }
      return safeResult({
        status: "platform_text_visual_review_read_ready",
        found: true,
        receipt: mapped.receipt,
        readFingerprint: hash(mapped.receipt),
        reviewedPlatforms: mapped.receipt.reviewedPlatforms.length,
        reviewedAssets: mapped.reviewedAssetCount,
        durableHumanReview: true,
        durableVisualReviewInputReady: true,
        databaseReadAttempted: true,
        databaseReads: 1,
      });
    },
  };
}
