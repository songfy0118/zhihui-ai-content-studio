import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextReviewMigrationSingleUseAuthorizationRequest } from "../bridge/platform-text-review-migration-single-use-authorization-request.mjs";

const tags = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

function inputs() {
  const sourceMigrationScopeFingerprint = "a".repeat(64);
  return {
    executionPreflight: {
      status:"platform_text_review_migration_execution_preflight_ready", blockers:[], sourceMigrationScopeFingerprint,
      migrationExecutionPreflightFingerprint:"b".repeat(64), migrationTags:tags,
      requiredConfirmation:`AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${sourceMigrationScopeFingerprint}`,
      evidenceValidated:true, ephemeralEvidenceUsed:true, readyForExplicitAuthorizationRequest:true, singleUseAuthorizationRequired:true,
      confirmationReceived:false, authorizationGranted:false, authorizationConsumed:false, executionContract:null,
      executorConnected:false, applyImplemented:false, applyPerformed:false, databaseReadAttempted:false, databaseReads:0,
      databaseWrites:false, externalCalls:false, publishTriggered:false, businessResult:false,
    },
    localTargetDiagnostic: {
      status:"platform_text_review_migration_local_target_diagnostic_verified", blockers:[], migrationTags:tags,
      targetBinding:"DB", bindingScope:"loopback_miniflare_only", databaseNameConfigured:true, placeholderLocalDatabaseId:true,
      loopbackDevConfig:true, migrationJournalVerified:true, localStateCandidateCount:1, localTargetEvidenceFingerprint:"c".repeat(64),
      localTargetProven:true, readyForExplicitAuthorizationRequest:true, confirmationReceived:false, authorizationGranted:false,
      authorizationConsumed:false, commandPrepared:false, executorConnected:false, databaseFileOpened:false,
      databaseReadAttempted:false, databaseReads:0, databaseWrites:false, filesystemWrites:false, externalCalls:false,
      publishTriggered:false, businessResult:false,
    },
  };
}

test("binds exact preflight and local target evidence into one deterministic single-use request preview", () => {
  const first = buildPlatformTextReviewMigrationSingleUseAuthorizationRequest(inputs());
  const repeat = buildPlatformTextReviewMigrationSingleUseAuthorizationRequest(structuredClone(inputs()));
  assert.equal(first.status, "platform_text_review_migration_single_use_authorization_request_ready");
  assert.equal(first.authorizationRequestFingerprint, repeat.authorizationRequestFingerprint);
  assert.match(first.authorizationRequestFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.ticketTerms, { singleUse:true, ttlSecondsAfterAcceptance:300, localTargetOnly:true, remoteAllowed:false, exactFingerprintsRequired:true, createOnlyMigrations:true, rollbackOnFailureRequired:true, postApplyReadOnlyVerificationRequired:true });
  assert.equal(first.readyForHumanConfirmation, true);
  assert.equal(first.confirmationReceived, false);
  assert.equal(first.authorizationTicket, null);
  assert.equal(first.executionContract, null);
  assert.equal(first.commandPrepared, false);
  assert.equal(first.databaseWrites, false);
});

test("blocks stale, tampered and already-authorized evidence", () => {
  for (const mutate of [
    (value) => { value.executionPreflight.migrationExecutionPreflightFingerprint = "tampered"; },
    (value) => { value.localTargetDiagnostic.localTargetEvidenceFingerprint = "d".repeat(63); },
    (value) => { value.executionPreflight.authorizationGranted = true; },
    (value) => { value.localTargetDiagnostic.commandPrepared = true; },
  ]) {
    const value = inputs();
    mutate(value);
    const result = buildPlatformTextReviewMigrationSingleUseAuthorizationRequest(value);
    assert.equal(result.readyForHumanConfirmation, false);
    assert.equal(result.authorizationRequestFingerprint, null);
    assert.equal(result.authorizationTicket, null);
  }
});

test("contains no confirmation receiver, ticket issuer, command or database capability", async () => {
  const [moduleSource, routeSource] = await Promise.all([
    readFile(new URL("../bridge/platform-text-review-migration-single-use-authorization-request.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/platform-text-review-migration-single-use-authorization-request/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(moduleSource, /DatabaseSync|node:sqlite|spawn\(|exec\(|wrangler d1|\.prepare\(|\.batch\(/);
  assert.match(routeSource, /local_request_required/);
  assert.doesNotMatch(routeSource, /fetch\(|getD1|\.insert\(|\.update\(|\.delete\(|spawn\(|exec\(/);
  assert.match(routeSource, /authorizationTicket: null/);
  assert.doesNotMatch(routeSource, /confirmationText|issueAuthorization|createTicket/);
});
