import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readPlatformTextReviewStorageReadiness } from "../bridge/platform-text-review-storage-readiness.mjs";

function inspector(status, { missingObjects = [], missingColumns = [] } = {}) {
  return async () => ({ status, verified: status === "verified", missingObjects, missingColumns });
}

test("summarizes missing review schemas without applying migrations", async () => {
  const result = await readPlatformTextReviewStorageReadiness({
    inspectDraftReviewStorage: inspector("missing", { missingObjects: ["table:a"], missingColumns: ["a.id"] }),
    inspectVisualReviewStorage: inspector("missing", { missingObjects: ["table:b", "table:c"], missingColumns: ["b.id", "c.id"] }),
  });

  assert.equal(result.status, "platform_text_review_storage_readiness_ready");
  assert.equal(result.storageInspectionReady, true);
  assert.equal(result.bothSchemasVerified, false);
  assert.equal(result.draftReviewStorage.status, "missing");
  assert.equal(result.draftReviewStorage.missingObjectCount, 1);
  assert.equal(result.visualReviewStorage.missingObjectCount, 2);
  assert.equal(result.draftReviewStorage.migrationTag, "0009_chunky_praxagora");
  assert.equal(result.visualReviewStorage.migrationTag, "0010_tranquil_donald_blake");
  assert.equal(result.migrationAuthorizationRequired, true);
  assert.equal(result.migrationApplyImplemented, false);
  assert.equal(result.migrationApplyPerformed, false);
  assert.equal(result.databaseReads, 7);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.publishTriggered, false);
});

test("reports verified schemas and blocks partial or failed inspection", async () => {
  const verified = await readPlatformTextReviewStorageReadiness({
    inspectDraftReviewStorage: inspector("verified"),
    inspectVisualReviewStorage: inspector("verified"),
  });
  assert.equal(verified.bothSchemasVerified, true);
  assert.equal(verified.migrationAuthorizationRequired, false);

  const partial = await readPlatformTextReviewStorageReadiness({
    inspectDraftReviewStorage: inspector("partial", { missingColumns: ["draft.id"] }),
    inspectVisualReviewStorage: inspector("verified"),
  });
  assert.deepEqual(partial.blockers, ["platform_text_draft_review_storage_partial"]);
  assert.equal(partial.storageInspectionReady, false);

  const failed = await readPlatformTextReviewStorageReadiness({
    inspectDraftReviewStorage: async () => { throw new Error("db"); },
    inspectVisualReviewStorage: inspector("verified"),
  });
  assert.deepEqual(failed.blockers, ["platform_text_review_storage_inspection_failed"]);
  assert.equal(failed.databaseWrites, false);
});

test("keeps the storage readiness API read-only and without a migration apply handler", async () => {
  const route = await readFile(new URL("../app/api/news/platform-text-review-storage-readiness/route.ts", import.meta.url), "utf8");
  assert.match(route, /inspectPlatformTextDraftReviewStorage/);
  assert.match(route, /inspectPlatformTextVisualReviewStorage/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|\.insert\(|\.update\(|\.delete\(|\.batch\(|\.exec\(|fetch\(|applyMigration|wrangler|playwright|puppeteer/);
});
