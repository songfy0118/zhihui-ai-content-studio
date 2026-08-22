import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextVisualReviewMigrationPreflight } from "../bridge/platform-text-visual-review-migration-preflight.mjs";
import { PLATFORM_TEXT_VISUAL_REVIEW_SCHEMA_SQL, inspectPlatformTextVisualReviewStorage } from "../db/platform-text-visual-review-storage-inspector.mjs";

const objects = [
  ["platform_text_visual_review_receipts", "table"],
  ["platform_text_visual_review_platforms", "table"],
  ["platform_text_visual_review_assets", "table"],
  ["uq_platform_text_visual_review_fingerprint", "index"],
  ["uq_platform_text_visual_review_idempotency_key", "index"],
  ["idx_platform_text_visual_review_render_created_at", "index"],
  ["uq_platform_text_visual_review_platform_receipt_platform", "index"],
  ["idx_platform_text_visual_review_platform_platform", "index"],
  ["uq_platform_text_visual_review_asset_receipt_platform_card", "index"],
  ["idx_platform_text_visual_review_asset_svg_fingerprint", "index"],
];
const columns = {
  platform_text_visual_review_receipts: ["id", "render_fingerprint", "bundle_manifest_fingerprint", "visual_review_fingerprint", "idempotency_key", "status", "created_at"],
  platform_text_visual_review_platforms: ["receipt_id", "platform", "asset_count", "review_note", "review_checks_json", "created_at"],
  platform_text_visual_review_assets: ["receipt_id", "platform", "card_index", "role", "filename", "copy_fingerprint", "svg_fingerprint", "created_at"],
};

function fakeD1({ schemaObjects = objects, tableColumns = columns } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        async all() {
          if (sql.includes("sqlite_schema")) return { results: schemaObjects.map(([name, type]) => ({ name, type })) };
          const table = Object.keys(columns).find((name) => sql.includes(name));
          return { results: (tableColumns[table] ?? []).map((name) => ({ name })) };
        },
      };
    },
  };
}

test("verifies every expected visual review table, index and column using read-only schema queries", async () => {
  const d1 = fakeD1();
  const result = await inspectPlatformTextVisualReviewStorage(d1);

  assert.equal(result.status, "verified");
  assert.equal(result.verified, true);
  assert.equal(result.expectedObjectCount, 10);
  assert.equal(result.expectedColumnCount, 21);
  assert.deepEqual(result.missingObjects, []);
  assert.deepEqual(result.missingColumns, []);
  assert.equal(result.inspectedDataRows, false);
  assert.ok(d1.calls.every((sql) => /^SELECT name, type FROM sqlite_schema|^PRAGMA table_info/.test(sql)));
  assert.equal(result.databaseWrites, false);
  assert.equal(result.readyForAssetHandoff, false);
  assert.equal(result.assetsUnlocked, false);
});

test("distinguishes entirely missing visual review storage from a partial schema", async () => {
  const missing = await inspectPlatformTextVisualReviewStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const partialColumns = structuredClone(columns);
  partialColumns.platform_text_visual_review_platforms = partialColumns.platform_text_visual_review_platforms.filter((name) => name !== "review_checks_json");
  const partial = await inspectPlatformTextVisualReviewStorage(fakeD1({ schemaObjects: objects.slice(0, -1), tableColumns: partialColumns }));

  assert.equal(missing.status, "missing");
  assert.deepEqual(missing.blockers, ["platform_text_visual_review_storage_missing"]);
  assert.equal(partial.status, "partial");
  assert.ok(partial.missingObjects.includes("index:idx_platform_text_visual_review_asset_svg_fingerprint"));
  assert.ok(partial.missingColumns.includes("platform_text_visual_review_platforms.review_checks_json"));
});

test("feeds only the observed visual review storage status into the create-only migration decision", async () => {
  const sql = await readFile(new URL("../drizzle/0010_tranquil_donald_blake.sql", import.meta.url), "utf8");
  const missing = await inspectPlatformTextVisualReviewStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const verified = await inspectPlatformTextVisualReviewStorage(fakeD1());
  const missingPlan = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0010_tranquil_donald_blake", migrationSql: sql, storageStatus: missing.status });
  const verifiedPlan = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0010_tranquil_donald_blake", migrationSql: sql, storageStatus: verified.status });

  assert.equal(missingPlan.readyToApplyLocally, true);
  assert.equal(missingPlan.applyImplemented, false);
  assert.equal(verifiedPlan.readyToApplyLocally, false);
  assert.ok(verifiedPlan.blockers.includes("migration_already_applied"));
});

test("keeps the visual review storage inspector out of API routes and contains no write SQL", async () => {
  const [previewRoute, handoffRoute] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok([previewRoute, handoffRoute].every((content) => !content.includes("platform-text-visual-review-storage-inspector")));
  assert.doesNotMatch(PLATFORM_TEXT_VISUAL_REVIEW_SCHEMA_SQL, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
});
