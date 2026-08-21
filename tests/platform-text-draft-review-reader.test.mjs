import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "../bridge/platform-text-draft-review-preview.mjs";
import { createPlatformTextDraftReviewReader, READ_PLATFORM_TEXT_DRAFT_REVIEW_SQL } from "../db/platform-text-draft-review-reader.mjs";

const DRAFT_PREVIEW_FINGERPRINT = "a".repeat(64);
const BLUEPRINT_FINGERPRINT = "b".repeat(64);
const CHECKS = Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true]));
const REVIEWED_PLATFORMS = [
  { platform: "xiaohongshu", draftFingerprint: "c".repeat(64), reviewNote: "小红书模拟文案已逐项人工确认，仅用于测试。", checks: CHECKS, status: "human_reviewed_in_preview_not_persisted" },
  { platform: "douyin", draftFingerprint: "d".repeat(64), reviewNote: "抖音模拟文案已逐项人工确认，仅用于测试。", checks: CHECKS, status: "human_reviewed_in_preview_not_persisted" },
];
const REVIEW_FINGERPRINT = createHash("sha256").update(JSON.stringify({
  draftPreviewFingerprint: DRAFT_PREVIEW_FINGERPRINT,
  blueprintFingerprint: BLUEPRINT_FINGERPRINT,
  reviewedPlatforms: REVIEWED_PLATFORMS,
})).digest("hex");

async function memoryD1() {
  const database = new DatabaseSync(":memory:");
  const migration = await readFile(new URL("../drizzle/0009_chunky_praxagora.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  return {
    database,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) { return { ...this, params }; },
        all() { return { results: database.prepare(this.sql).all(...this.params) }; },
      };
    },
  };
}

function seedReceipt(database, { status = "active", platformCount = 2, checks = CHECKS } = {}) {
  const createdAt = "2026-08-21T20:25:00.000Z";
  database.prepare(`INSERT INTO platform_text_draft_review_receipts (
    id, draft_preview_fingerprint, blueprint_fingerprint, review_fingerprint,
    idempotency_key, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    `ptdrp_${REVIEW_FINGERPRINT}`,
    DRAFT_PREVIEW_FINGERPRINT,
    BLUEPRINT_FINGERPRINT,
    REVIEW_FINGERPRINT,
    `platform-text-draft-review:${REVIEW_FINGERPRINT}`,
    status,
    createdAt,
  );
  for (const review of REVIEWED_PLATFORMS.slice(0, platformCount)) {
    database.prepare(`INSERT INTO platform_text_draft_review_platforms (
      receipt_id, platform, draft_fingerprint, review_note, review_checks_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(
      `ptdrp_${REVIEW_FINGERPRINT}`,
      review.platform,
      review.draftFingerprint,
      review.reviewNote,
      JSON.stringify(checks),
      createdAt,
    );
  }
}

test("reads a durable platform review receipt as a stable read-only projection", async () => {
  const d1 = await memoryD1();
  seedReceipt(d1.database);
  const result = await createPlatformTextDraftReviewReader(d1).readByReviewFingerprint(REVIEW_FINGERPRINT);

  assert.equal(result.status, "platform_text_draft_review_read_ready");
  assert.equal(result.found, true);
  assert.equal(result.durableHumanReview, true);
  assert.equal(result.durableReviewInputReady, true);
  assert.equal(result.reviewedPlatforms, 2);
  assert.match(result.readFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.receipt.reviewedPlatforms.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(result.receipt.reviewedPlatforms.every(({ status }) => status === "human_reviewed_persisted"));
  assert.equal(result.databaseReads, 1);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.draftSaved, false);
});

test("blocks an invalid review fingerprint before querying and reports a missing receipt honestly", async () => {
  const d1 = await memoryD1();
  let prepareCalls = 0;
  const prepare = d1.prepare;
  d1.prepare = (...args) => { prepareCalls += 1; return prepare(...args); };
  const reader = createPlatformTextDraftReviewReader(d1);

  const invalid = await reader.readByReviewFingerprint("not-a-fingerprint");
  assert.equal(invalid.databaseReadAttempted, false);
  assert.equal(prepareCalls, 0);

  const missing = await reader.readByReviewFingerprint(REVIEW_FINGERPRINT);
  assert.equal(missing.status, "platform_text_draft_review_not_found");
  assert.equal(missing.found, false);
  assert.equal(missing.databaseReads, 1);
});

test("fails closed on inactive, incomplete or malformed persisted review data", async () => {
  const inactive = await memoryD1();
  seedReceipt(inactive.database, { status: "revoked" });
  const inactiveResult = await createPlatformTextDraftReviewReader(inactive).readByReviewFingerprint(REVIEW_FINGERPRINT);
  assert.ok(inactiveResult.blockers.includes("platform_text_draft_review_receipt_invalid"));

  const incomplete = await memoryD1();
  seedReceipt(incomplete.database, { platformCount: 1 });
  const incompleteResult = await createPlatformTextDraftReviewReader(incomplete).readByReviewFingerprint(REVIEW_FINGERPRINT);
  assert.ok(incompleteResult.blockers.includes("platform_text_draft_review_persisted_data_tampered"));

  const malformed = await memoryD1();
  seedReceipt(malformed.database, { checks: { title_and_cover_approved: true } });
  const malformedResult = await createPlatformTextDraftReviewReader(malformed).readByReviewFingerprint(REVIEW_FINGERPRINT);
  assert.ok(malformedResult.blockers.includes("platform_text_draft_review_platform_invalid:douyin"));
  assert.equal(malformedResult.durableReviewInputReady, false);
});

test("ships only SELECT access and remains disconnected from API routes", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(READ_PLATFORM_TEXT_DRAFT_REVIEW_SQL, /^SELECT/);
  assert.doesNotMatch(READ_PLATFORM_TEXT_DRAFT_REVIEW_SQL, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
  assert.ok(routes.every((route) => !route.includes("platform-text-draft-review-reader")));
});
