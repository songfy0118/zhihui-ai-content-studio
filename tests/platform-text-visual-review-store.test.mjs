import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";
import {
  PLATFORM_TEXT_VISUAL_REVIEW_SAVE_CONFIRMATION,
  createPlatformTextVisualReviewStore,
} from "../db/platform-text-visual-review-store.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyPreview() {
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
    reviewNote: `${platform} 模拟信息卡已逐张打开并完成视觉检查，仅用于隔离测试。`,
    checks: Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true])),
    status: "human_visual_reviewed_in_preview_not_persisted",
  }));
  const visualReviewFingerprint = hash({ renderFingerprint, bundleManifestFingerprint, reviewedPlatforms });
  return {
    status: "platform_text_visual_review_preview_ready",
    blockers: [],
    receiptPreview: {
      receiptId: `ptvrp_${visualReviewFingerprint}`,
      renderFingerprint,
      bundleManifestFingerprint,
      reviewedPlatforms,
      status: "preview_not_persisted",
    },
    visualReviewFingerprint,
    idempotencyKey: `platform-text-visual-review:${visualReviewFingerprint}`,
    reviewedPlatformCountInPreview: reviewedPlatforms.length,
    reviewedAssetCountInPreview: 2,
    eligibleForAuthorizedVisualReviewSave: true,
  };
}

function createMemoryD1({ failAtStatement = null } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE platform_text_visual_review_receipts (
      id TEXT PRIMARY KEY, render_fingerprint TEXT NOT NULL,
      bundle_manifest_fingerprint TEXT NOT NULL, visual_review_fingerprint TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE platform_text_visual_review_platforms (
      receipt_id TEXT NOT NULL, platform TEXT NOT NULL, asset_count INTEGER NOT NULL,
      review_note TEXT NOT NULL, review_checks_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(receipt_id, platform)
    );
    CREATE TABLE platform_text_visual_review_assets (
      receipt_id TEXT NOT NULL, platform TEXT NOT NULL, card_index INTEGER NOT NULL,
      role TEXT NOT NULL, filename TEXT NOT NULL, copy_fingerprint TEXT NOT NULL,
      svg_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(receipt_id, platform, card_index)
    );
  `);
  const prepare = (sql) => ({
    sql,
    params: [],
    bind(...params) { return { ...this, params }; },
    first() { return database.prepare(this.sql).get(...this.params); },
  });
  return {
    database,
    prepare,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (index === failAtStatement) throw new Error("injected_batch_failure");
          const result = database.prepare(statement.sql).run(...statement.params);
          results.push({ success: true, meta: { changes: Number(result.changes) } });
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function saveInput(preview, overrides = {}) {
  return {
    preview,
    executeRequested: true,
    confirmation: PLATFORM_TEXT_VISUAL_REVIEW_SAVE_CONFIRMATION,
    authorizedVisualReviewFingerprint: preview.visualReviewFingerprint,
    ...overrides,
  };
}

function count(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("atomically stores one visual review receipt, both platform reviews and asset links in memory", async () => {
  const d1 = createMemoryD1();
  const result = await createPlatformTextVisualReviewStore(d1, { now: () => "2026-08-21T21:35:00.000Z" }).save(saveInput(readyPreview()));

  assert.equal(result.status, "platform_text_visual_review_persisted");
  assert.equal(result.persisted, true);
  assert.equal(result.visualReviewReceiptsCreated, 1);
  assert.equal(result.platformReviewsCreated, 2);
  assert.equal(result.assetLinksCreated, 2);
  assert.equal(count(d1.database, "platform_text_visual_review_receipts"), 1);
  assert.equal(count(d1.database, "platform_text_visual_review_platforms"), 2);
  assert.equal(count(d1.database, "platform_text_visual_review_assets"), 2);
  assert.equal(result.humanVisualReviewCompleted, false);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.readyForDraftHandoff, false);
});

test("replays the same visual review fingerprint idempotently without a second batch", async () => {
  const d1 = createMemoryD1();
  const preview = readyPreview();
  const store = createPlatformTextVisualReviewStore(d1);
  await store.save(saveInput(preview));
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const replay = await store.save(saveInput(preview));

  assert.equal(replay.alreadyPersisted, true);
  assert.equal(replay.databaseWriteAttempted, false);
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "platform_text_visual_review_receipts"), 1);
});

test("blocks missing authorization and tampered previews before a batch", async () => {
  const d1 = createMemoryD1();
  const preview = readyPreview();
  let batchCalls = 0;
  const originalBatch = d1.batch;
  d1.batch = async (...args) => { batchCalls += 1; return originalBatch(...args); };
  const store = createPlatformTextVisualReviewStore(d1);
  const missing = await store.save(saveInput(preview, { confirmation: null }));
  const tampered = structuredClone(preview);
  tampered.receiptPreview.reviewedPlatforms[0].reviewNote += "篡改";
  const changed = await store.save(saveInput(tampered));

  assert.ok(missing.blockers.includes("platform_text_visual_review_save_confirmation_invalid"));
  assert.ok(changed.blockers.includes("platform_text_visual_review_preview_tampered"));
  assert.equal(batchCalls, 0);
  assert.equal(count(d1.database, "platform_text_visual_review_receipts"), 0);
});

test("rolls back all isolated tables when one asset insert fails", async () => {
  const d1 = createMemoryD1({ failAtStatement: 3 });
  const result = await createPlatformTextVisualReviewStore(d1).save(saveInput(readyPreview()));

  assert.equal(result.status, "platform_text_visual_review_atomic_batch_failed");
  assert.equal(result.persisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(count(d1.database, "platform_text_visual_review_receipts"), 0);
  assert.equal(count(d1.database, "platform_text_visual_review_platforms"), 0);
  assert.equal(count(d1.database, "platform_text_visual_review_assets"), 0);
});

test("keeps the isolated visual review store disconnected from routes, migrations and live D1", async () => {
  const [previewRoute, handoffRoute, journal] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  ]);
  assert.ok([previewRoute, handoffRoute, journal].every((content) => !content.includes("platform-text-visual-review-store")));
});
