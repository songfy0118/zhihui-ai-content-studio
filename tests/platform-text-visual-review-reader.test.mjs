import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";
import {
  READ_PLATFORM_TEXT_VISUAL_REVIEW_SQL,
  createPlatformTextVisualReviewReader,
} from "../db/platform-text-visual-review-reader.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fixture() {
  const renderFingerprint = "a".repeat(64);
  const bundleManifestFingerprint = "b".repeat(64);
  const reviewedPlatforms = [
    { platform: "xiaohongshu", copy: "c".repeat(64), svg: "d".repeat(64) },
    { platform: "douyin", copy: "e".repeat(64), svg: "f".repeat(64) },
  ].map(({ platform, copy, svg }) => ({
    platform,
    assetCount: 1,
    assets: [{
      cardIndex: 1,
      role: "cover",
      filename: `${platform}-01-cover.svg`,
      copyFingerprint: copy,
      svgFingerprint: svg,
    }],
    reviewNote: `${platform} 模拟信息卡已逐张打开并完成视觉检查，仅用于隔离读取测试。`,
    checks: Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true])),
    status: "human_visual_reviewed_in_preview_not_persisted",
  }));
  const visualReviewFingerprint = hash({ renderFingerprint, bundleManifestFingerprint, reviewedPlatforms });
  return { renderFingerprint, bundleManifestFingerprint, reviewedPlatforms, visualReviewFingerprint };
}

async function createDatabase() {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0010_tranquil_donald_blake.sql", import.meta.url), "utf8");
  database.exec(migration.replaceAll("--> statement-breakpoint", ""));
  return database;
}

function seed(database, current = fixture()) {
  const createdAt = "2026-08-22T09:40:00.000Z";
  const receiptId = `ptvrp_${current.visualReviewFingerprint}`;
  database.prepare(`INSERT INTO platform_text_visual_review_receipts (
    id, render_fingerprint, bundle_manifest_fingerprint, visual_review_fingerprint,
    idempotency_key, status, created_at
  ) VALUES (?, ?, ?, ?, ?, 'active', ?)`).run(
    receiptId,
    current.renderFingerprint,
    current.bundleManifestFingerprint,
    current.visualReviewFingerprint,
    `platform-text-visual-review:${current.visualReviewFingerprint}`,
    createdAt,
  );
  for (const review of current.reviewedPlatforms) {
    database.prepare(`INSERT INTO platform_text_visual_review_platforms (
      receipt_id, platform, asset_count, review_note, review_checks_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(
      receiptId, review.platform, review.assetCount, review.reviewNote, JSON.stringify(review.checks), createdAt,
    );
    for (const asset of review.assets) {
      database.prepare(`INSERT INTO platform_text_visual_review_assets (
        receipt_id, platform, card_index, role, filename, copy_fingerprint, svg_fingerprint, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        receiptId, review.platform, asset.cardIndex, asset.role, asset.filename,
        asset.copyFingerprint, asset.svgFingerprint, createdAt,
      );
    }
  }
}

function createReadD1(database, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ sql, params: [] });
      return {
        sql,
        params: [],
        bind(...params) { this.params = params; calls.at(-1).params = params; return this; },
        async all() {
          if (fail) throw new Error("injected_read_failure");
          return { results: database.prepare(this.sql).all(...this.params) };
        },
      };
    },
  };
}

test("reads a durable visual review receipt and exposes a stable read-only projection", async () => {
  const database = await createDatabase();
  const current = fixture();
  seed(database, current);
  const d1 = createReadD1(database);
  const reader = createPlatformTextVisualReviewReader(d1);

  const first = await reader.readByVisualReviewFingerprint(current.visualReviewFingerprint);
  const second = await reader.readByVisualReviewFingerprint(current.visualReviewFingerprint);

  assert.equal(first.status, "platform_text_visual_review_read_ready");
  assert.equal(first.found, true);
  assert.equal(first.reviewedPlatforms, 2);
  assert.equal(first.reviewedAssets, 2);
  assert.equal(first.durableHumanReview, true);
  assert.equal(first.durableVisualReviewInputReady, true);
  assert.equal(first.receipt.reviewedPlatforms[0].platform, "xiaohongshu");
  assert.equal(first.receipt.reviewedPlatforms[1].platform, "douyin");
  assert.equal(first.readFingerprint, second.readFingerprint);
  assert.equal(first.databaseWrites, false);
  assert.equal(first.readyForAssetHandoff, false);
  assert.equal(first.assetsUnlocked, false);
  assert.equal(first.draftSaved, false);
  assert.equal(d1.calls.every((call) => /^SELECT\b/i.test(call.sql.trim())), true);
});

test("rejects invalid fingerprints before querying and reports missing receipts honestly", async () => {
  const database = await createDatabase();
  const d1 = createReadD1(database);
  const reader = createPlatformTextVisualReviewReader(d1);

  const invalid = await reader.readByVisualReviewFingerprint("invalid");
  const missing = await reader.readByVisualReviewFingerprint("a".repeat(64));

  assert.deepEqual(invalid.blockers, ["platform_text_visual_review_fingerprint_invalid"]);
  assert.equal(invalid.databaseReadAttempted, false);
  assert.equal(missing.status, "platform_text_visual_review_not_found");
  assert.equal(missing.found, false);
  assert.equal(missing.databaseReads, 1);
  assert.equal(d1.calls.length, 1);
});

test("fails closed for inactive, incomplete, tampered and unreadable durable records", async () => {
  const current = fixture();

  const inactiveDatabase = await createDatabase();
  seed(inactiveDatabase, current);
  inactiveDatabase.prepare("UPDATE platform_text_visual_review_receipts SET status = 'revoked'").run();
  const inactive = await createPlatformTextVisualReviewReader(createReadD1(inactiveDatabase))
    .readByVisualReviewFingerprint(current.visualReviewFingerprint);
  assert.deepEqual(inactive.blockers, ["platform_text_visual_review_receipt_invalid"]);

  const incompleteDatabase = await createDatabase();
  seed(incompleteDatabase, current);
  incompleteDatabase.prepare("DELETE FROM platform_text_visual_review_assets WHERE platform = 'douyin'").run();
  const incomplete = await createPlatformTextVisualReviewReader(createReadD1(incompleteDatabase))
    .readByVisualReviewFingerprint(current.visualReviewFingerprint);
  assert.deepEqual(incomplete.blockers, ["platform_text_visual_review_asset_invalid:douyin:missing"]);

  const tamperedDatabase = await createDatabase();
  seed(tamperedDatabase, current);
  tamperedDatabase.prepare("UPDATE platform_text_visual_review_platforms SET review_note = review_note || '篡改' WHERE platform = 'xiaohongshu'").run();
  const tampered = await createPlatformTextVisualReviewReader(createReadD1(tamperedDatabase))
    .readByVisualReviewFingerprint(current.visualReviewFingerprint);
  assert.deepEqual(tampered.blockers, ["platform_text_visual_review_persisted_data_tampered"]);

  const failed = await createPlatformTextVisualReviewReader(createReadD1(await createDatabase(), { fail: true }))
    .readByVisualReviewFingerprint(current.visualReviewFingerprint);
  assert.equal(failed.status, "platform_text_visual_review_read_failed");
  assert.equal(failed.databaseWrites, false);
  assert.equal(failed.durableHumanReview, false);
});

test("uses one SELECT statement and remains disconnected from API routes", async () => {
  const [previewRoute, handoffRoute] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(READ_PLATFORM_TEXT_VISUAL_REVIEW_SQL.trim(), /^SELECT\b/i);
  assert.doesNotMatch(READ_PLATFORM_TEXT_VISUAL_REVIEW_SQL, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
  assert.ok([previewRoute, handoffRoute].every((content) => !content.includes("platform-text-visual-review-reader")));
});
