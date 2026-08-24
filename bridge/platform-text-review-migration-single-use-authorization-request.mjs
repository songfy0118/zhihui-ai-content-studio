import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TAGS = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];
const TICKET_TERMS = Object.freeze({
  singleUse: true,
  ttlSecondsAfterAcceptance: 300,
  localTargetOnly: true,
  remoteAllowed: false,
  exactFingerprintsRequired: true,
  createOnlyMigrations: true,
  rollbackOnFailureRequired: true,
  postApplyReadOnlyVerificationRequired: true,
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_single_use_authorization_request_blocked",
    blockers: [],
    migrationTags: TAGS,
    sourceMigrationScopeFingerprint: null,
    migrationExecutionPreflightFingerprint: null,
    localTargetEvidenceFingerprint: null,
    authorizationRequestFingerprint: null,
    requiredConfirmation: null,
    ticketTerms: TICKET_TERMS,
    evidenceValidated: false,
    readyForHumanConfirmation: false,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    authorizationTicket: null,
    executionContract: null,
    commandPrepared: false,
    executorConnected: false,
    applyImplemented: false,
    applyPerformed: false,
    databaseFileOpened: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    filesystemWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validExecutionPreflight(value) {
  return value?.status === "platform_text_review_migration_execution_preflight_ready"
    && value?.blockers?.length === 0
    && HASH.test(value?.sourceMigrationScopeFingerprint ?? "")
    && HASH.test(value?.migrationExecutionPreflightFingerprint ?? "")
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && value?.requiredConfirmation === `AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${value.sourceMigrationScopeFingerprint}`
    && value?.evidenceValidated === true
    && value?.ephemeralEvidenceUsed === true
    && value?.readyForExplicitAuthorizationRequest === true
    && value?.singleUseAuthorizationRequired === true
    && value?.confirmationReceived === false
    && value?.authorizationGranted === false
    && value?.authorizationConsumed === false
    && value?.executionContract === null
    && value?.executorConnected === false
    && value?.applyImplemented === false
    && value?.applyPerformed === false
    && value?.databaseReadAttempted === false
    && value?.databaseReads === 0
    && value?.databaseWrites === false
    && value?.externalCalls === false
    && value?.publishTriggered === false
    && value?.businessResult === false;
}

function validLocalTargetDiagnostic(value) {
  return value?.status === "platform_text_review_migration_local_target_diagnostic_verified"
    && value?.blockers?.length === 0
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && value?.targetBinding === "DB"
    && value?.bindingScope === "loopback_miniflare_only"
    && value?.databaseNameConfigured === true
    && value?.placeholderLocalDatabaseId === true
    && value?.loopbackDevConfig === true
    && value?.migrationJournalVerified === true
    && value?.localStateCandidateCount === 1
    && HASH.test(value?.localTargetEvidenceFingerprint ?? "")
    && value?.localTargetProven === true
    && value?.readyForExplicitAuthorizationRequest === true
    && value?.confirmationReceived === false
    && value?.authorizationGranted === false
    && value?.authorizationConsumed === false
    && value?.commandPrepared === false
    && value?.executorConnected === false
    && value?.databaseFileOpened === false
    && value?.databaseReadAttempted === false
    && value?.databaseReads === 0
    && value?.databaseWrites === false
    && value?.filesystemWrites === false
    && value?.externalCalls === false
    && value?.publishTriggered === false
    && value?.businessResult === false;
}

export function buildPlatformTextReviewMigrationSingleUseAuthorizationRequest({ executionPreflight, localTargetDiagnostic } = {}) {
  const blockers = [];
  if (!validExecutionPreflight(executionPreflight)) blockers.push("review_migration_execution_preflight_invalid_or_tampered");
  if (!validLocalTargetDiagnostic(localTargetDiagnostic)) blockers.push("review_migration_local_target_diagnostic_invalid_or_tampered");
  if (blockers.length) return safeResult({ blockers });

  const evidence = {
    migrationTags: TAGS,
    sourceMigrationScopeFingerprint: executionPreflight.sourceMigrationScopeFingerprint,
    migrationExecutionPreflightFingerprint: executionPreflight.migrationExecutionPreflightFingerprint,
    localTargetEvidenceFingerprint: localTargetDiagnostic.localTargetEvidenceFingerprint,
    requiredConfirmation: executionPreflight.requiredConfirmation,
    ticketTerms: TICKET_TERMS,
  };
  return safeResult({
    status: "platform_text_review_migration_single_use_authorization_request_ready",
    sourceMigrationScopeFingerprint: executionPreflight.sourceMigrationScopeFingerprint,
    migrationExecutionPreflightFingerprint: executionPreflight.migrationExecutionPreflightFingerprint,
    localTargetEvidenceFingerprint: localTargetDiagnostic.localTargetEvidenceFingerprint,
    authorizationRequestFingerprint: hash(evidence),
    requiredConfirmation: executionPreflight.requiredConfirmation,
    evidenceValidated: true,
    readyForHumanConfirmation: true,
  });
}
