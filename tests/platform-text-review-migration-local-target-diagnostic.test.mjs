import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindPlatformTextReviewMigrationLocalTargetDiagnostic,
  inspectPlatformTextReviewMigrationLocalEnvironment,
} from "../bridge/platform-text-review-migration-local-target-diagnostic.mjs";

const tags = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

function executionPreflight() {
  const sourceMigrationScopeFingerprint = "a".repeat(64);
  return {
    status:"platform_text_review_migration_execution_preflight_ready",
    blockers:[],
    sourceMigrationScopeFingerprint,
    migrationExecutionPreflightFingerprint:"b".repeat(64),
    migrationTags:tags,
    requiredConfirmation:`AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${sourceMigrationScopeFingerprint}`,
    evidenceValidated:true,
    readyForExplicitAuthorizationRequest:true,
    confirmationReceived:false,
    authorizationGranted:false,
    authorizationConsumed:false,
    executionContract:null,
    executorConnected:false,
    applyImplemented:false,
    applyPerformed:false,
    databaseWrites:false,
  };
}

function environmentInput() {
  return {
    hosting:{d1:"DB"},
    deployConfig:{configPath:"..\\..\\dist\\server\\wrangler.json"},
    runtimeConfig:{name:"zhihui-ai-content-studio",dev:{ip:"127.0.0.1",local_protocol:"http"},d1_databases:[{binding:"DB",database_name:"site-creator-d1",database_id:"00000000-0000-4000-8000-000000000000"}]},
    journalEntries:tags.map((tag) => ({tag})),
    localStateFiles:["metadata.sqlite", "local-target.sqlite", "metadata.sqlite-wal"],
  };
}

test("verifies one loopback Miniflare D1 target without opening its database file", () => {
  const environment = inspectPlatformTextReviewMigrationLocalEnvironment(environmentInput());
  const result = bindPlatformTextReviewMigrationLocalTargetDiagnostic({ executionPreflight:executionPreflight(), environment });
  assert.equal(result.status, "platform_text_review_migration_local_target_diagnostic_verified");
  assert.equal(result.targetBinding, "DB");
  assert.equal(result.bindingScope, "loopback_miniflare_only");
  assert.equal(result.localStateCandidateCount, 1);
  assert.match(result.localTargetEvidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.localTargetProven, true);
  assert.equal(result.readyForExplicitAuthorizationRequest, true);
  assert.equal(result.confirmationReceived, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.commandPrepared, false);
  assert.equal(result.executorConnected, false);
  assert.equal(result.databaseFileOpened, false);
  assert.equal(result.databaseReadAttempted, false);
  assert.equal(result.databaseWrites, false);
});

test("blocks non-loopback, remote-id, ambiguous and tampered evidence", () => {
  const cases = [
    {runtimeConfig:{dev:{ip:"0.0.0.0",local_protocol:"http"},d1_databases:[]}},
    {runtimeConfig:{name:"x",dev:{ip:"127.0.0.1",local_protocol:"http"},d1_databases:[{binding:"DB",database_name:"x",database_id:"remote-id"}]}},
    {localStateFiles:["one.sqlite", "two.sqlite"]},
  ];
  for (const patch of cases) {
    const environment = inspectPlatformTextReviewMigrationLocalEnvironment({...environmentInput(), ...patch});
    assert.equal(environment.localTargetProven, false);
  }
  const environment = inspectPlatformTextReviewMigrationLocalEnvironment(environmentInput());
  const tampered = executionPreflight();
  tampered.authorizationGranted = true;
  assert.equal(bindPlatformTextReviewMigrationLocalTargetDiagnostic({executionPreflight:tampered, environment}).localTargetProven, false);
});

test("keeps local target diagnosis free of commands, database opens and external targets", async () => {
  const [moduleSource, routeSource] = await Promise.all([
    readFile(new URL("../bridge/platform-text-review-migration-local-target-diagnostic.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/platform-text-review-migration-local-target-diagnostic/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(moduleSource, /DatabaseSync|node:sqlite|spawn\(|exec\(|wrangler d1|\.prepare\(|\.batch\(/);
  assert.match(routeSource, /local_request_required/);
  assert.match(routeSource, /\/d1\/review-migrations\/local-target/);
  assert.doesNotMatch(routeSource, /getD1|\.insert\(|\.update\(|\.delete\(|spawn\(|exec\(/);
});
