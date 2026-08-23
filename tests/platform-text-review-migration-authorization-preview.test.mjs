import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextReviewMigrationAuthorizationPreview } from "../bridge/platform-text-review-migration-authorization-preview.mjs";

function missingStorageReadiness() {
  return {
    status: "platform_text_review_storage_readiness_ready",
    blockers: [],
    draftReviewStorage: { status: "missing", verified: false, missingObjectCount: 7, missingColumnCount: 13, migrationTag: "0009_chunky_praxagora" },
    visualReviewStorage: { status: "missing", verified: false, missingObjectCount: 10, missingColumnCount: 21, migrationTag: "0010_tranquil_donald_blake" },
    storageInspectionReady: true,
    bothSchemasVerified: false,
    migrationAuthorizationRequired: true,
    migrationApplyImplemented: false,
    migrationApplyPerformed: false,
    databaseReadAttempted: true,
    databaseReads: 7,
    databaseWrites: false,
  };
}

test("builds a deterministic non-executing authorization preview for exactly 0009 and 0010", () => {
  const first = buildPlatformTextReviewMigrationAuthorizationPreview(missingStorageReadiness());
  const repeat = buildPlatformTextReviewMigrationAuthorizationPreview(structuredClone(missingStorageReadiness()));

  assert.equal(first.status, "platform_text_review_migration_authorization_preview_ready");
  assert.equal(first.migrationScopeFingerprint, repeat.migrationScopeFingerprint);
  assert.match(first.requiredConfirmation, /^AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 [a-f0-9]{64}$/);
  assert.deepEqual(first.migrationTags, ["0009_chunky_praxagora", "0010_tranquil_donald_blake"]);
  assert.equal(first.migrationManifest.length, 2);
  assert.deepEqual(first.migrationManifest.map(({ tables, indexes }) => [tables.length, indexes.length]), [[2, 5], [3, 7]]);
  assert.equal(first.tableCount, 5);
  assert.equal(first.indexCount, 12);
  assert.equal(first.objectCount, 17);
  assert.equal(first.localOnly, true);
  assert.equal(first.remoteAllowed, false);
  assert.equal(first.eligibleForExplicitLocalMigrationAuthorization, true);
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.executorConnected, false);
  assert.equal(first.commandPrepared, false);
  assert.equal(first.applyImplemented, false);
  assert.equal(first.applyPerformed, false);
  assert.equal(first.databaseWrites, false);
  assert.equal(first.publishTriggered, false);
});

test("binds the displayed object manifest to the checked-in create-only SQL", async () => {
  const preview = buildPlatformTextReviewMigrationAuthorizationPreview(missingStorageReadiness());
  for (const migration of preview.migrationManifest) {
    const sql = await readFile(new URL(`../drizzle/${migration.tag}.sql`, import.meta.url), "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
    const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX `([^`]+)`/g)].map((match) => match[1]);
    assert.deepEqual(migration.tables, tables);
    assert.deepEqual(migration.indexes, indexes);
    assert.doesNotMatch(sql, /\b(?:DROP|DELETE|UPDATE|ALTER)\b/i);
  }
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.applyPerformed, false);
});

test("blocks stale, partial, already verified or write-bearing readiness", () => {
  const partial = missingStorageReadiness();
  partial.draftReviewStorage.status = "partial";
  const verified = missingStorageReadiness();
  verified.bothSchemasVerified = true;
  const writeBearing = missingStorageReadiness();
  writeBearing.databaseWrites = true;

  for (const value of [partial, verified, writeBearing, null]) {
    const result = buildPlatformTextReviewMigrationAuthorizationPreview(value);
    assert.deepEqual(result.blockers, ["platform_text_review_storage_readiness_invalid_or_stale"]);
    assert.equal(result.eligibleForExplicitLocalMigrationAuthorization, false);
    assert.equal(result.requiredConfirmation, null);
    assert.equal(result.applyPerformed, false);
  }
});

test("keeps the preview route free of migration executors and database writes", async () => {
  const route = await readFile(new URL("../app/api/news/platform-text-review-migration-authorization-preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /buildPlatformTextReviewMigrationAuthorizationPreview/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /getD1|wrangler|migrations apply|\.insert\(|\.update\(|\.delete\(|\.batch\(|\.exec\(|fetch\(|playwright|puppeteer/);
});
