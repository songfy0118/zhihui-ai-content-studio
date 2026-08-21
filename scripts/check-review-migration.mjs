import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [hostingRaw, schema, journalRaw] = await Promise.all([
  readFile(new URL(".openai/hosting.json", root), "utf8"),
  readFile(new URL("db/schema.ts", root), "utf8"),
  readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
]);
const hosting = JSON.parse(hostingRaw);
const journal = JSON.parse(journalRaw);
const entries = journal.entries ?? [];
const latest = entries.at(-1);

assert.equal(hosting.d1, "DB", "Sites D1 binding must remain `DB`");
assert.match(schema, /sqliteTable\("review_audits"/, "review_audits is missing from db/schema.ts");
assert.match(schema, /sqliteTable\("pilot_authorization_receipts"/, "pilot_authorization_receipts is missing from db/schema.ts");
assert.ok(latest?.tag, "No generated Drizzle migration was found");

const migrations = await Promise.all(entries.map(async ({ tag }) => ({ tag, sql: await readFile(new URL(`drizzle/${tag}.sql`, root), "utf8") })));
const reviewMigration = migrations.find(({ sql }) => /CREATE TABLE `review_audits`/.test(sql));
const receiptMigration = migrations.find(({ sql }) => /CREATE TABLE `pilot_authorization_receipts`/.test(sql));
const metricsMigration = migrations.find(({ sql }) => /ALTER TABLE `metrics` ADD `source_kind`/.test(sql));
const scriptReviewAcceptanceMigration = migrations.find(({ sql }) => /CREATE TABLE `script_review_acceptances`/.test(sql));
const sourceLockMigration = migrations.find(({ sql }) => /CREATE TABLE `source_locks`/.test(sql));
assert.ok(reviewMigration, "No migration creates review_audits");
assert.match(reviewMigration.sql, /idx_review_audits_job_created_at/, "Review audit lookup index is missing");
assert.ok(receiptMigration, "No migration creates pilot_authorization_receipts");
assert.match(receiptMigration.sql, /idx_pilot_receipts_execution_hash_issued_at/, "Receipt audit lookup index is missing");
assert.match(receiptMigration.sql, /idx_pilot_receipts_status_expires_at/, "Receipt expiry lookup index is missing");
assert.doesNotMatch(receiptMigration.sql, /\b(?:DROP|DELETE|TRUNCATE)\b/i, "Receipt migration contains a destructive statement");
assert.ok(metricsMigration, "No migration adds metrics provenance fields");
assert.match(metricsMigration.sql, /ALTER TABLE `metrics` ADD `external_post_id`/, "Metrics external post id is missing");
assert.match(metricsMigration.sql, /ALTER TABLE `metrics` ADD `captured_at`/, "Metrics capture time is missing");
assert.match(metricsMigration.sql, /ALTER TABLE `metrics` ADD `imported_at`/, "Metrics import time is missing");
assert.match(metricsMigration.sql, /uq_metrics_platform_post_captured_at/, "Metrics snapshot deduplication index is missing");
assert.doesNotMatch(metricsMigration.sql, /\b(?:DROP|DELETE|TRUNCATE)\b/i, "Metrics provenance migration contains a destructive statement");
assert.ok(scriptReviewAcceptanceMigration, "No migration creates script_review_acceptances");
assert.match(scriptReviewAcceptanceMigration.sql, /uq_script_review_acceptances_output_source_lock/, "Script review acceptance deduplication index is missing");
assert.match(scriptReviewAcceptanceMigration.sql, /idx_script_review_acceptances_idea_reviewed_at/, "Script review acceptance history index is missing");
assert.doesNotMatch(scriptReviewAcceptanceMigration.sql, /\b(?:DROP|DELETE|TRUNCATE)\b/i, "Script review acceptance migration contains a destructive statement");
assert.ok(sourceLockMigration, "No migration creates source_locks");
assert.match(sourceLockMigration.sql, /CREATE TABLE `source_lock_evidence`/, "Source lock evidence table is missing");
assert.match(sourceLockMigration.sql, /uq_source_locks_review_fingerprint/, "Source lock review fingerprint dedupe index is missing");
assert.match(sourceLockMigration.sql, /uq_source_locks_save_plan_fingerprint/, "Source lock save-plan dedupe index is missing");
assert.match(sourceLockMigration.sql, /uq_source_lock_evidence_lock_role/, "Source evidence role uniqueness index is missing");
assert.doesNotMatch(sourceLockMigration.sql, /\b(?:ALTER|DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i, "Source lock migration contains a mutating statement");

console.log(JSON.stringify({
  sourcePlanReady: true,
  readyToApply: false,
  liveStateRequired: true,
  applied: false,
  targetBinding: hosting.d1,
  migrations: { reviewAudit: reviewMigration.tag, pilotAuthorizationReceipts: receiptMigration.tag, metricsProvenance: metricsMigration.tag, scriptReviewAcceptances: scriptReviewAcceptanceMigration.tag, sourceLocks: sourceLockMigration.tag },
  destructiveStatements: false,
}, null, 2));
