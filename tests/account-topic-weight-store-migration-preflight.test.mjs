import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG,
  assessAccountTopicWeightStoreMigrationPreflight,
} from "../bridge/account-topic-weight-store-migration-preflight.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS,
  ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL,
  inspectAccountTopicWeightStorage,
} from "../db/account-topic-weight-storage-inspector.mjs";
import { MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";

function fakeD1({ objects = [], columns = {} } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        async all() {
          if (sql === ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL) {
            return { results: objects.map((object) => {
              const [type, name] = object.split(":");
              return { type, name };
            }) };
          }
          const table = sql.match(/PRAGMA table_info\(`([^`]+)`\)/)?.[1];
          return { results: (columns[table] ?? []).map((name) => ({ name })) };
        },
      };
    },
  };
}

async function migrationSql() {
  return readFile(new URL(`../drizzle/${ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG}.sql`, import.meta.url), "utf8");
}

test("accepts the generated three-table and eight-index create-only migration plan", async () => {
  const plan = assessAccountTopicWeightStoreMigrationPreflight({
    hosting: { d1: "DB" },
    migrationTag: ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG,
    migrationSql: await migrationSql(),
    storageStatus: "missing",
  });

  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.statementCount, 11);
  assert.equal(plan.createdTables.length, 3);
  assert.equal(plan.createdIndexes.length, 8);
  assert.equal(plan.onlyCreateStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.authorizationRequired, true);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.learningWeightsUpdated, false);
});

test("blocks verified, partial, incomplete and mutating migration inputs", async () => {
  const sql = await migrationSql();
  const verified = assessAccountTopicWeightStoreMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG, migrationSql: sql, storageStatus: "verified" });
  const partial = assessAccountTopicWeightStoreMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG, migrationSql: sql, storageStatus: "partial" });
  const incomplete = assessAccountTopicWeightStoreMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG, migrationSql: "CREATE TABLE `account_topic_weight_values` (`profile_id` text);", storageStatus: "missing" });
  const mutating = assessAccountTopicWeightStoreMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG, migrationSql: `${sql}\nUPDATE account_topic_weight_values SET weight = 1;`, storageStatus: "missing" });

  assert.ok(verified.blockers.includes("migration_already_applied"));
  assert.ok(partial.blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(incomplete.blockers.includes("account_topic_weight_store_migration_incomplete"));
  assert.ok(mutating.blockers.includes("migration_not_create_only"));
});

test("distinguishes missing, partial and verified storage using schema-only reads", async () => {
  const missingD1 = fakeD1();
  const missing = await inspectAccountTopicWeightStorage(missingD1);
  const partial = await inspectAccountTopicWeightStorage(fakeD1({
    objects: [ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS[0]],
    columns: { account_topic_weight_update_items: [ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS.account_topic_weight_update_items[0]] },
  }));
  const verified = await inspectAccountTopicWeightStorage(fakeD1({
    objects: [...ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS],
    columns: Object.fromEntries(Object.entries(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS).map(([table, names]) => [table, [...names]])),
  }));

  assert.equal(missing.status, "missing");
  assert.equal(partial.status, "partial");
  assert.equal(verified.status, "verified");
  assert.equal(verified.accountWeightsRead, false);
  assert.equal(verified.databaseWrites, false);
  assert.equal(verified.learningWeightsUpdated, false);
  assert.equal(missingD1.calls.length, 4);
});

test("registers generated schema, journal and chain artifacts without an apply path", async () => {
  const [schema, journal, script, inspector] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-account-topic-weight-store-migration.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/account-topic-weight-storage-inspector.mjs", import.meta.url), "utf8"),
  ]);

  for (const table of ["account_topic_weight_update_receipts", "account_topic_weight_update_items", "account_topic_weight_values"]) {
    assert.match(schema, new RegExp(table));
  }
  assert.match(journal, new RegExp(ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG));
  assert.equal(MIGRATION_CHAIN.at(-1).tag, ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG);
  assert.doesNotMatch(script, /getDb|\.batch\s*\(|\.run\s*\(|wrangler d1 migrations apply/);
  assert.doesNotMatch(inspector, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
});
