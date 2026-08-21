import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextDraftReviewMigrationPreflight } from "../bridge/platform-text-draft-review-migration-preflight.mjs";
import { PLATFORM_TEXT_DRAFT_REVIEW_SCHEMA_SQL, inspectPlatformTextDraftReviewStorage } from "../db/platform-text-draft-review-storage-inspector.mjs";

const objects = [
  ["platform_text_draft_review_receipts", "table"],
  ["platform_text_draft_review_platforms", "table"],
  ["uq_platform_text_draft_review_fingerprint", "index"],
  ["uq_platform_text_draft_review_idempotency_key", "index"],
  ["idx_platform_text_draft_review_preview_created_at", "index"],
  ["uq_platform_text_draft_review_platform_receipt_platform", "index"],
  ["idx_platform_text_draft_review_platform_draft", "index"],
];
const columns = {
  platform_text_draft_review_receipts: ["id", "draft_preview_fingerprint", "blueprint_fingerprint", "review_fingerprint", "idempotency_key", "status", "created_at"],
  platform_text_draft_review_platforms: ["receipt_id", "platform", "draft_fingerprint", "review_note", "review_checks_json", "created_at"],
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

test("verifies every expected review table, index and column using read-only schema queries", async () => {
  const d1 = fakeD1();
  const result = await inspectPlatformTextDraftReviewStorage(d1);

  assert.equal(result.status, "verified");
  assert.equal(result.verified, true);
  assert.equal(result.expectedObjectCount, 7);
  assert.equal(result.expectedColumnCount, 13);
  assert.deepEqual(result.missingObjects, []);
  assert.deepEqual(result.missingColumns, []);
  assert.equal(result.inspectedDataRows, false);
  assert.ok(d1.calls.every((sql) => /^SELECT name, type FROM sqlite_schema|^PRAGMA table_info/.test(sql)));
  assert.equal(result.databaseWrites, false);
  assert.equal(result.readyForDraftHandoff, false);
});

test("distinguishes entirely missing review storage from a partial schema", async () => {
  const missing = await inspectPlatformTextDraftReviewStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const partialColumns = structuredClone(columns);
  partialColumns.platform_text_draft_review_platforms = partialColumns.platform_text_draft_review_platforms.filter((name) => name !== "review_checks_json");
  const partial = await inspectPlatformTextDraftReviewStorage(fakeD1({ schemaObjects: objects.slice(0, -1), tableColumns: partialColumns }));

  assert.equal(missing.status, "missing");
  assert.deepEqual(missing.blockers, ["platform_text_draft_review_storage_missing"]);
  assert.equal(partial.status, "partial");
  assert.ok(partial.missingObjects.includes("index:idx_platform_text_draft_review_platform_draft"));
  assert.ok(partial.missingColumns.includes("platform_text_draft_review_platforms.review_checks_json"));
});

test("feeds only the observed review storage status into the create-only migration decision", async () => {
  const sql = await readFile(new URL("../drizzle/0009_chunky_praxagora.sql", import.meta.url), "utf8");
  const missing = await inspectPlatformTextDraftReviewStorage(fakeD1({ schemaObjects: [], tableColumns: {} }));
  const verified = await inspectPlatformTextDraftReviewStorage(fakeD1());
  const missingPlan = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0009_chunky_praxagora", migrationSql: sql, storageStatus: missing.status });
  const verifiedPlan = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: "0009_chunky_praxagora", migrationSql: sql, storageStatus: verified.status });

  assert.equal(missingPlan.readyToApplyLocally, true);
  assert.equal(missingPlan.applyImplemented, false);
  assert.equal(verifiedPlan.readyToApplyLocally, false);
  assert.ok(verifiedPlan.blockers.includes("migration_already_applied"));
});

test("keeps the review storage inspector out of API routes and contains no write SQL", async () => {
  const [previewRoute, handoffRoute] = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok([previewRoute, handoffRoute].every((content) => !content.includes("platform-text-draft-review-storage-inspector")));
  assert.doesNotMatch(PLATFORM_TEXT_DRAFT_REVIEW_SCHEMA_SQL, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
});
