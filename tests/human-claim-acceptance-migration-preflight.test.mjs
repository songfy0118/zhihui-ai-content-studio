import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessHumanClaimAcceptanceMigrationPreflight } from "../bridge/human-claim-acceptance-migration-preflight.mjs";
import { MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";

const migrationTag = "0008_overconfident_vance_astro";

async function migrationSql() {
  return readFile(new URL(`../drizzle/${migrationTag}.sql`, import.meta.url), "utf8");
}

test("accepts the generated three-table create-only migration as a plan", async () => {
  const sql = await migrationSql();
  const plan = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "missing" });

  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.statementCount, 11);
  assert.equal(plan.createdTables.length, 3);
  assert.equal(plan.createdUniqueIndexes.length, 4);
  assert.equal(plan.onlyCreateStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.applyPerformed, false);
  assert.equal(plan.databaseWrites, false);
});

test("blocks partial, existing, incomplete and destructive migration states", async () => {
  const sql = await migrationSql();
  const partial = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "partial" });
  const existing = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: sql, storageStatus: "verified" });
  const incomplete = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: "CREATE TABLE `human_claim_acceptance_receipts` (`id` text);", storageStatus: "missing" });
  const destructive = assessHumanClaimAcceptanceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag, migrationSql: `${sql}\nDROP TABLE old_data;`, storageStatus: "missing" });

  assert.ok(partial.blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(existing.blockers.includes("migration_already_applied"));
  assert.ok(incomplete.blockers.includes("claim_acceptance_migration_incomplete"));
  assert.ok(destructive.blockers.includes("migration_not_create_only"));
});

test("registers schema and migration-chain artifacts without an apply route", async () => {
  const [schema, journal, script] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-human-claim-acceptance-migration.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("human_claim_acceptance_receipts"/);
  assert.match(schema, /sqliteTable\("human_claim_acceptance_items"/);
  assert.match(schema, /sqliteTable\("human_claim_acceptance_sources"/);
  assert.match(journal, /0008_overconfident_vance_astro/);
  assert.equal(MIGRATION_CHAIN.at(-1).tag, migrationTag);
  assert.doesNotMatch(script, /getDb|\.batch\(|\.run\(|wrangler d1 migrations apply/);
});
