import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextReviewMigrationAuthorizationPreview } from "../bridge/platform-text-review-migration-authorization-preview.mjs";
import { buildPlatformTextReviewMigrationExecutionPreflight } from "../bridge/platform-text-review-migration-execution-preflight.mjs";
import { runPlatformTextReviewMigrationIsolatedRehearsal } from "../bridge/platform-text-review-migration-isolated-rehearsal.mjs";

const tags = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

function storageReadiness() {
  return {
    status: "platform_text_review_storage_readiness_ready",
    blockers: [],
    draftReviewStorage: { status: "missing", verified: false, missingObjectCount: 7, missingColumnCount: 13, migrationTag: tags[0] },
    visualReviewStorage: { status: "missing", verified: false, missingObjectCount: 10, missingColumnCount: 21, migrationTag: tags[1] },
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

async function readyInput() {
  const migrations = await Promise.all(tags.map(async (tag) => ({
    tag,
    sql: await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8"),
  })));
  return {
    authorizationPreview: buildPlatformTextReviewMigrationAuthorizationPreview(storageReadiness()),
    isolatedRehearsal: runPlatformTextReviewMigrationIsolatedRehearsal({ migrations }),
  };
}

test("prepares deterministic evidence for an explicit authorization request without granting it", async () => {
  const input = await readyInput();
  const first = buildPlatformTextReviewMigrationExecutionPreflight(input);
  const repeat = buildPlatformTextReviewMigrationExecutionPreflight(structuredClone(input));
  assert.equal(first.status, "platform_text_review_migration_execution_preflight_ready");
  assert.equal(first.migrationExecutionPreflightFingerprint, repeat.migrationExecutionPreflightFingerprint);
  assert.match(first.migrationExecutionPreflightFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(first.requiredConfirmation, input.authorizationPreview.requiredConfirmation);
  assert.equal(first.evidenceValidated, true);
  assert.equal(first.ephemeralEvidenceUsed, true);
  assert.equal(first.readyForExplicitAuthorizationRequest, true);
  assert.equal(first.confirmationReceived, false);
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.authorizationConsumed, false);
  assert.equal(first.executionContract, null);
  assert.equal(first.executorConnected, false);
  assert.equal(first.applyImplemented, false);
  assert.equal(first.applyPerformed, false);
  assert.equal(first.databaseWrites, false);
});

test("blocks tampered scope, stale rehearsal and any false live-write evidence", async () => {
  const input = await readyInput();
  const tamperedScope = structuredClone(input);
  tamperedScope.authorizationPreview.requiredConfirmation = "AUTHORIZE SOMETHING ELSE";
  const staleRehearsal = structuredClone(input);
  staleRehearsal.isolatedRehearsal.appliedTags = [tags[0]];
  const liveWrite = structuredClone(input);
  liveWrite.isolatedRehearsal.liveDatabaseWrites = true;
  for (const value of [tamperedScope, staleRehearsal, liveWrite, {}]) {
    const result = buildPlatformTextReviewMigrationExecutionPreflight(value);
    assert.equal(result.readyForExplicitAuthorizationRequest, false);
    assert.equal(result.authorizationGranted, false);
    assert.equal(result.executionContract, null);
    assert.equal(result.applyPerformed, false);
  }
});

test("keeps the preflight API free of migration executors and database access", async () => {
  const [route, bridge] = await Promise.all([
    readFile(new URL("../app/api/news/platform-text-review-migration-execution-preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/platform-text-review-migration-execution-preflight.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(route, /export async function POST/);
  assert.match(route, /buildPlatformTextReviewMigrationExecutionPreflight/);
  assert.doesNotMatch(route, /getD1|wrangler|fetch\(|readFile|\.insert\(|\.update\(|\.delete\(|\.batch\(|\.exec\(/);
  assert.doesNotMatch(bridge, /DatabaseSync|node:sqlite|getD1|wrangler|fetch\(|readFile/);
});
