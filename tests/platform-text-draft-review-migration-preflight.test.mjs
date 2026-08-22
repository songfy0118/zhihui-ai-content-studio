import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextDraftReviewMigrationPreflight } from "../bridge/platform-text-draft-review-migration-preflight.mjs";
import { MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";

const migrationTag = "0009_chunky_praxagora";

async function migrationSql() {
  return readFile(new URL(`../drizzle/${migrationTag}.sql`, import.meta.url), "utf8");
}

test("accepts the generated two-table create-only review migration as a plan", async () => {
  const sql = await migrationSql();
  const plan = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "missing" });

  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.statementCount, 7);
  assert.equal(plan.createdTables.length, 2);
  assert.equal(plan.createdUniqueIndexes.length, 3);
  assert.equal(plan.onlyCreateStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.applyPerformed, false);
  assert.equal(plan.databaseWrites, false);
});

test("blocks partial, existing, incomplete and destructive review migration states", async () => {
  const sql = await migrationSql();
  const partial = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "partial" });
  const existing = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "verified" });
  const incomplete = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: "CREATE TABLE `platform_text_draft_review_receipts` (`id` text);", storageStatus: "missing" });
  const destructive = assessPlatformTextDraftReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: `${sql}\nDROP TABLE old_data;`, storageStatus: "missing" });

  assert.ok(partial.blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(existing.blockers.includes("migration_already_applied"));
  assert.ok(incomplete.blockers.includes("platform_text_draft_review_migration_incomplete"));
  assert.ok(destructive.blockers.includes("migration_not_create_only"));
});

test("registers review schema and migration-chain artifacts without an apply route", async () => {
  const [schema, journal, script] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-platform-text-draft-review-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("platform_text_draft_review_receipts"/);
  assert.match(schema, /sqliteTable\("platform_text_draft_review_platforms"/);
  assert.match(journal, /0009_chunky_praxagora/);
  assert.ok(MIGRATION_CHAIN.some(({ tag }) => tag === migrationTag));
  assert.doesNotMatch(script, /getDb|\.batch\(|\.run\(|wrangler d1 migrations apply/);
});
