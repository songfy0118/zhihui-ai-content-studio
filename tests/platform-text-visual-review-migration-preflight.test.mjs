import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextVisualReviewMigrationPreflight } from "../bridge/platform-text-visual-review-migration-preflight.mjs";
import { MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";

const migrationTag = "0010_tranquil_donald_blake";

async function migrationSql() {
  return readFile(new URL(`../drizzle/${migrationTag}.sql`, import.meta.url), "utf8");
}

test("accepts the generated three-table create-only visual review migration as a plan", async () => {
  const sql = await migrationSql();
  const plan = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "missing" });

  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.statementCount, 10);
  assert.equal(plan.createdTables.length, 3);
  assert.equal(plan.createdUniqueIndexes.length, 4);
  assert.equal(plan.onlyCreateStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.applyPerformed, false);
  assert.equal(plan.databaseWrites, false);
});

test("blocks partial, existing, incomplete and destructive visual review migration states", async () => {
  const sql = await migrationSql();
  const partial = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "partial" });
  const existing = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "verified" });
  const incomplete = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: "CREATE TABLE `platform_text_visual_review_receipts` (`id` text);", storageStatus: "missing" });
  const destructive = assessPlatformTextVisualReviewMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: `${sql}\nDROP TABLE old_data;`, storageStatus: "missing" });

  assert.ok(partial.blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(existing.blockers.includes("migration_already_applied"));
  assert.ok(incomplete.blockers.includes("platform_text_visual_review_migration_incomplete"));
  assert.ok(destructive.blockers.includes("migration_not_create_only"));
});

test("registers visual review schema and migration-chain artifacts without an apply route", async () => {
  const [schema, journal, script] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-platform-text-visual-review-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("platform_text_visual_review_receipts"/);
  assert.match(schema, /sqliteTable\("platform_text_visual_review_platforms"/);
  assert.match(schema, /sqliteTable\("platform_text_visual_review_assets"/);
  assert.match(journal, /0010_tranquil_donald_blake/);
  assert.ok(MIGRATION_CHAIN.some(({ tag }) => tag === migrationTag));
  assert.doesNotMatch(script, /getDb|\.batch\(|\.run\(|wrangler d1 migrations apply/);
});
