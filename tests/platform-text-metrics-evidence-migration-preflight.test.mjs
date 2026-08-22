import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG,
  assessPlatformTextMetricsEvidenceMigrationPreflight,
} from "../bridge/platform-text-metrics-evidence-migration-preflight.mjs";
import { MIGRATION_CHAIN } from "../db/migration-chain-inspector.mjs";
import {
  METRICS_EVIDENCE_COLUMNS,
  METRICS_EVIDENCE_COLUMNS_SQL,
  METRICS_EVIDENCE_INDEXES,
  METRICS_EVIDENCE_INDEXES_SQL,
  inspectPlatformTextMetricsEvidenceStorage,
} from "../db/platform-text-metrics-evidence-storage-inspector.mjs";

const legacyColumns = ["id", "idea_id", "platform", "source_kind", "external_post_id", "captured_at", "imported_at", "created_at"];
const legacyIndexes = ["idx_metrics_platform_created_at", "idx_metrics_idea_id", "uq_metrics_platform_post_captured_at"];

function fakeD1({ columns = legacyColumns, indexes = legacyIndexes } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return { async all() { return { results: (sql.startsWith("PRAGMA") ? columns : indexes).map((name) => ({ name })) }; } };
    },
  };
}

async function migrationSql() {
  return readFile(new URL(`../drizzle/${PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG}.sql`, import.meta.url), "utf8");
}

test("accepts the generated five-column and two-index additive migration as a plan", async () => {
  const plan = assessPlatformTextMetricsEvidenceMigrationPreflight({
    hosting: { d1: "DB" },
    migrationTag: PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG,
    migrationSql: await migrationSql(),
    storageStatus: "legacy_verified",
  });

  assert.equal(plan.readyToApplyLocally, true);
  assert.equal(plan.statementCount, 7);
  assert.equal(plan.addedColumns.length, 5);
  assert.equal(plan.createdIndexes.length, 2);
  assert.equal(plan.onlyAdditiveStatements, true);
  assert.equal(plan.destructiveStatements, false);
  assert.equal(plan.applyImplemented, false);
  assert.equal(plan.databaseWrites, false);
});

test("blocks unsafe storage states, incomplete SQL and any unapproved statement", async () => {
  const sql = await migrationSql();
  const verified = assessPlatformTextMetricsEvidenceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG, migrationSql: sql, storageStatus: "verified" });
  const partial = assessPlatformTextMetricsEvidenceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG, migrationSql: sql, storageStatus: "partial" });
  const incomplete = assessPlatformTextMetricsEvidenceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG, migrationSql: "ALTER TABLE `metrics` ADD `content_fingerprint` text;", storageStatus: "legacy_verified" });
  const destructive = assessPlatformTextMetricsEvidenceMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG, migrationSql: `${sql}\nUPDATE metrics SET views = 1;`, storageStatus: "legacy_verified" });

  assert.ok(verified.blockers.includes("migration_already_applied"));
  assert.ok(partial.blockers.includes("storage_status_not_safe_to_apply"));
  assert.ok(incomplete.blockers.includes("platform_text_metrics_evidence_migration_incomplete"));
  assert.ok(destructive.blockers.includes("migration_not_additive_only"));
});

test("distinguishes legacy, partial, verified and missing metrics evidence storage read-only", async () => {
  const legacyD1 = fakeD1();
  const legacy = await inspectPlatformTextMetricsEvidenceStorage(legacyD1);
  const partial = await inspectPlatformTextMetricsEvidenceStorage(fakeD1({ columns: [...legacyColumns, METRICS_EVIDENCE_COLUMNS[0]] }));
  const verified = await inspectPlatformTextMetricsEvidenceStorage(fakeD1({ columns: [...legacyColumns, ...METRICS_EVIDENCE_COLUMNS], indexes: [...legacyIndexes, ...METRICS_EVIDENCE_INDEXES] }));
  const missing = await inspectPlatformTextMetricsEvidenceStorage(fakeD1({ columns: [], indexes: [] }));

  assert.equal(legacy.status, "legacy_verified");
  assert.equal(partial.status, "partial");
  assert.equal(verified.status, "verified");
  assert.equal(missing.status, "missing_table");
  assert.deepEqual(legacyD1.calls, [METRICS_EVIDENCE_COLUMNS_SQL, METRICS_EVIDENCE_INDEXES_SQL]);
  assert.equal(legacy.databaseWrites, false);
  assert.equal(verified.metricsImported, false);
  assert.equal(verified.learningWeightsUpdated, false);
});

test("registers generated schema and migration-chain artifacts without an apply path", async () => {
  const [schema, journal, script, inspector] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-platform-text-metrics-evidence-migration.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/platform-text-metrics-evidence-storage-inspector.mjs", import.meta.url), "utf8"),
  ]);
  for (const column of METRICS_EVIDENCE_COLUMNS) assert.match(schema, new RegExp(column));
  assert.match(journal, new RegExp(PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG));
  assert.ok(MIGRATION_CHAIN.some(({ tag }) => tag === PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG));
  assert.doesNotMatch(script, /getDb|\.batch\(|\.run\(|wrangler d1 migrations apply/);
  assert.doesNotMatch(inspector, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
});
