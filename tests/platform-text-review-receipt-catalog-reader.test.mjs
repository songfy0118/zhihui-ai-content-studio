import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPlatformTextReviewReceiptCatalogReader,
  READ_RECENT_PLATFORM_TEXT_DRAFT_REVIEWS_SQL,
} from "../db/platform-text-review-receipt-catalog-reader.mjs";

const DRAFT_FINGERPRINT = "d".repeat(64);
const VISUAL_FINGERPRINT = "e".repeat(64);

function fakeD1({ draftRows = [], visualRows = [], fail = false } = {}) {
  const sql = [];
  return {
    sql,
    prepare(statement) {
      sql.push(statement);
      return {
        async all() {
          if (fail) throw new Error("missing_table");
          return { results: statement === READ_RECENT_PLATFORM_TEXT_DRAFT_REVIEWS_SQL ? draftRows : visualRows };
        },
      };
    },
  };
}

test("lists recent durable review fingerprints without returning content or paths", async () => {
  const d1 = fakeD1({
    draftRows: [{ review_fingerprint: DRAFT_FINGERPRINT, created_at: "2026-08-23T16:00:00.000Z" }],
    visualRows: [{ visual_review_fingerprint: VISUAL_FINGERPRINT, created_at: "2026-08-23T16:05:00.000Z" }],
  });
  const result = await createPlatformTextReviewReceiptCatalogReader(d1).readRecent();

  assert.equal(result.status, "platform_text_review_receipt_catalog_ready");
  assert.equal(result.catalogReadReady, true);
  assert.equal(result.candidatePairAvailable, true);
  assert.deepEqual(result.draftReviews, [{ fingerprint: DRAFT_FINGERPRINT, createdAt: "2026-08-23T16:00:00.000Z" }]);
  assert.deepEqual(result.visualReviews, [{ fingerprint: VISUAL_FINGERPRINT, createdAt: "2026-08-23T16:05:00.000Z" }]);
  assert.equal(result.databaseReads, 2);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(JSON.stringify(result).includes("content"), false);
  assert.equal(JSON.stringify(result).includes("path"), false);
  assert.equal(d1.sql.every((statement) => /^SELECT\s/i.test(statement)), true);
});

test("reports an empty catalog honestly and fails closed on query or malformed data", async () => {
  const empty = await createPlatformTextReviewReceiptCatalogReader(fakeD1()).readRecent();
  assert.equal(empty.catalogReadReady, true);
  assert.equal(empty.candidatePairAvailable, false);
  assert.deepEqual(empty.draftReviews, []);
  assert.deepEqual(empty.visualReviews, []);

  const failed = await createPlatformTextReviewReceiptCatalogReader(fakeD1({ fail: true })).readRecent();
  assert.deepEqual(failed.blockers, ["platform_text_review_receipt_catalog_query_failed"]);
  assert.equal(failed.catalogReadReady, false);
  assert.equal(failed.databaseReads, 0);

  const malformed = await createPlatformTextReviewReceiptCatalogReader(fakeD1({
    draftRows: [{ review_fingerprint: "invalid", created_at: "2026-08-23" }],
  })).readRecent();
  assert.deepEqual(malformed.blockers, ["platform_text_draft_review_catalog_invalid"]);
  assert.equal(malformed.catalogReadReady, false);
});

test("keeps the receipt catalog API read-only and disconnected from creator platforms", async () => {
  const route = await readFile(new URL("../app/api/news/platform-text-review-receipt-catalog/route.ts", import.meta.url), "utf8");
  assert.match(route, /createPlatformTextReviewReceiptCatalogReader/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|\.insert\(|\.update\(|\.delete\(|\.batch\(|\.exec\(|fetch\(|playwright|puppeteer|creator\.douyin|xiaohongshu/);
});
