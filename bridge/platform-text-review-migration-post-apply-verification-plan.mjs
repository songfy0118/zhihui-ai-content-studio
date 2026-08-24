import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TAGS = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];
const EXPECTED_COUNTS = Object.freeze({ tables:5, indexes:12, columns:34, metadataQueries:7 });
const CHECKS = Object.freeze([
  "migration_journal_exact",
  "schema_objects_exact",
  "columns_exact",
  "no_unexpected_schema_delta",
  "no_business_rows_read",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_post_apply_verification_plan_blocked",
    blockers: [],
    migrationTags: TAGS,
    sourceAuthorizationRequestFingerprint: null,
    verificationPlanFingerprint: null,
    expectedCounts: EXPECTED_COUNTS,
    plannedChecks: CHECKS,
    verificationMode: "post_apply_read_only_metadata",
    rollbackProofExpectation: {
      required: true,
      availableBeforeApply: false,
      status: "awaiting_authorized_transaction",
      failureInjectionForbiddenOnLiveTarget: true,
      rollbackEvidenceRequiredOnFailure: true,
    },
    evidenceValidated: false,
    readyForFuturePostApplyVerification: false,
    preApplySnapshotCaptured: false,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationTicket: null,
    executionContract: null,
    commandPrepared: false,
    applyPerformed: false,
    verificationPerformed: false,
    rollbackPerformed: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    inspectedBusinessRows: false,
    databaseWrites: false,
    filesystemWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validAuthorizationRequest(value) {
  const terms = value?.ticketTerms;
  return value?.status === "platform_text_review_migration_single_use_authorization_request_ready"
    && value?.blockers?.length === 0
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && HASH.test(value?.sourceMigrationScopeFingerprint ?? "")
    && HASH.test(value?.migrationExecutionPreflightFingerprint ?? "")
    && HASH.test(value?.localTargetEvidenceFingerprint ?? "")
    && HASH.test(value?.authorizationRequestFingerprint ?? "")
    && value?.requiredConfirmation === `AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${value.sourceMigrationScopeFingerprint}`
    && terms?.singleUse === true
    && terms?.ttlSecondsAfterAcceptance === 300
    && terms?.localTargetOnly === true
    && terms?.remoteAllowed === false
    && terms?.exactFingerprintsRequired === true
    && terms?.createOnlyMigrations === true
    && terms?.rollbackOnFailureRequired === true
    && terms?.postApplyReadOnlyVerificationRequired === true
    && value?.evidenceValidated === true
    && value?.readyForHumanConfirmation === true
    && value?.confirmationReceived === false
    && value?.authorizationGranted === false
    && value?.authorizationConsumed === false
    && value?.authorizationTicket === null
    && value?.executionContract === null
    && value?.commandPrepared === false
    && value?.executorConnected === false
    && value?.applyImplemented === false
    && value?.applyPerformed === false
    && value?.databaseFileOpened === false
    && value?.databaseReadAttempted === false
    && value?.databaseReads === 0
    && value?.databaseWrites === false
    && value?.filesystemWrites === false
    && value?.externalCalls === false
    && value?.publishTriggered === false
    && value?.businessResult === false;
}

export function buildPlatformTextReviewMigrationPostApplyVerificationPlan({ authorizationRequest } = {}) {
  if (!validAuthorizationRequest(authorizationRequest)) {
    return safeResult({ blockers:["review_migration_authorization_request_invalid_or_tampered"] });
  }
  const plan = {
    sourceAuthorizationRequestFingerprint: authorizationRequest.authorizationRequestFingerprint,
    migrationTags: TAGS,
    expectedCounts: EXPECTED_COUNTS,
    plannedChecks: CHECKS,
    verificationMode: "post_apply_read_only_metadata",
    rollbackProofExpectation: {
      required: true,
      availableBeforeApply: false,
      failureInjectionForbiddenOnLiveTarget: true,
      rollbackEvidenceRequiredOnFailure: true,
    },
  };
  return safeResult({
    status: "platform_text_review_migration_post_apply_verification_plan_ready",
    sourceAuthorizationRequestFingerprint: authorizationRequest.authorizationRequestFingerprint,
    verificationPlanFingerprint: hash(plan),
    evidenceValidated: true,
    readyForFuturePostApplyVerification: true,
  });
}
