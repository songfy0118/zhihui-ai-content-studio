import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextReviewMigrationPostApplyVerificationPlan } from "../bridge/platform-text-review-migration-post-apply-verification-plan.mjs";

const tags = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

function authorizationRequest() {
  const sourceMigrationScopeFingerprint = "a".repeat(64);
  return {
    status:"platform_text_review_migration_single_use_authorization_request_ready", blockers:[], migrationTags:tags,
    sourceMigrationScopeFingerprint, migrationExecutionPreflightFingerprint:"b".repeat(64), localTargetEvidenceFingerprint:"c".repeat(64),
    authorizationRequestFingerprint:"d".repeat(64), requiredConfirmation:`AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${sourceMigrationScopeFingerprint}`,
    ticketTerms:{singleUse:true,ttlSecondsAfterAcceptance:300,localTargetOnly:true,remoteAllowed:false,exactFingerprintsRequired:true,createOnlyMigrations:true,rollbackOnFailureRequired:true,postApplyReadOnlyVerificationRequired:true},
    evidenceValidated:true, readyForHumanConfirmation:true, confirmationReceived:false, authorizationGranted:false, authorizationConsumed:false,
    authorizationTicket:null, executionContract:null, commandPrepared:false, executorConnected:false, applyImplemented:false,
    applyPerformed:false, databaseFileOpened:false, databaseReadAttempted:false, databaseReads:0, databaseWrites:false,
    filesystemWrites:false, externalCalls:false, publishTriggered:false, businessResult:false,
  };
}

test("locks a deterministic future read-only verification plan to one authorization request", () => {
  const first = buildPlatformTextReviewMigrationPostApplyVerificationPlan({authorizationRequest:authorizationRequest()});
  const repeat = buildPlatformTextReviewMigrationPostApplyVerificationPlan({authorizationRequest:structuredClone(authorizationRequest())});
  assert.equal(first.status, "platform_text_review_migration_post_apply_verification_plan_ready");
  assert.equal(first.verificationPlanFingerprint, repeat.verificationPlanFingerprint);
  assert.match(first.verificationPlanFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.expectedCounts, {tables:5,indexes:12,columns:34,metadataQueries:7});
  assert.equal(first.rollbackProofExpectation.availableBeforeApply, false);
  assert.equal(first.readyForFuturePostApplyVerification, true);
  assert.equal(first.verificationPerformed, false);
  assert.equal(first.databaseReadAttempted, false);
  assert.equal(first.databaseWrites, false);
});

test("blocks tampered, already-authorized or write-bearing requests", () => {
  for (const mutate of [
    (value) => { value.authorizationRequestFingerprint = "bad"; },
    (value) => { value.authorizationGranted = true; },
    (value) => { value.commandPrepared = true; },
    (value) => { value.databaseWrites = true; },
    (value) => { value.ticketTerms.postApplyReadOnlyVerificationRequired = false; },
  ]) {
    const value = authorizationRequest();
    mutate(value);
    const result = buildPlatformTextReviewMigrationPostApplyVerificationPlan({authorizationRequest:value});
    assert.equal(result.readyForFuturePostApplyVerification, false);
    assert.equal(result.verificationPlanFingerprint, null);
    assert.equal(result.databaseReads, 0);
  }
});

test("contains no authorization receiver, SQL executor or database accessor", async () => {
  const [moduleSource, routeSource] = await Promise.all([
    readFile(new URL("../bridge/platform-text-review-migration-post-apply-verification-plan.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/platform-text-review-migration-post-apply-verification-plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(moduleSource, /DatabaseSync|node:sqlite|spawn\(|exec\(|wrangler d1|\.prepare\(|\.batch\(/);
  assert.match(routeSource, /local_request_required/);
  assert.doesNotMatch(routeSource, /fetch\(|getD1|\.prepare\(|\.batch\(|spawn\(|exec\(/);
  assert.doesNotMatch(routeSource, /confirmationText|issueAuthorization|createTicket/);
});
