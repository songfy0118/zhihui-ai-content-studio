import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TAGS = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_execution_preflight_blocked",
    blockers: [],
    sourceMigrationScopeFingerprint: null,
    migrationExecutionPreflightFingerprint: null,
    migrationTags: TAGS,
    requiredConfirmation: null,
    evidenceValidated: false,
    ephemeralEvidenceUsed: false,
    readyForExplicitAuthorizationRequest: false,
    singleUseAuthorizationRequired: true,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    executionContract: null,
    executorConnected: false,
    applyImplemented: false,
    applyPerformed: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validAuthorizationPreview(value) {
  return value?.status === "platform_text_review_migration_authorization_preview_ready"
    && HASH.test(value?.migrationScopeFingerprint ?? "")
    && value?.requiredConfirmation === `AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${value.migrationScopeFingerprint}`
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && Array.isArray(value?.migrationManifest)
    && value.migrationManifest.length === 2
    && value.tableCount === 5
    && value.indexCount === 12
    && value.objectCount === 17
    && value.localOnly === true
    && value.remoteAllowed === false
    && value.createOnly === true
    && value.eligibleForExplicitLocalMigrationAuthorization === true
    && value.authorizationRequired === true
    && value.authorizationGranted === false
    && value.executorConnected === false
    && value.commandPrepared === false
    && value.applyImplemented === false
    && value.applyPerformed === false
    && value.databaseWrites === false
    && value.externalCalls === false
    && value.publishTriggered === false;
}

function validIsolatedRehearsal(value) {
  return value?.status === "platform_text_review_migration_isolated_rehearsal_verified"
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && JSON.stringify(value?.appliedTags) === JSON.stringify(TAGS)
    && value.tableCount === 5
    && value.indexCount === 12
    && value.schemaVerified === true
    && value.successPathVerified === true
    && Array.isArray(value?.rollbackScenarios)
    && value.rollbackScenarios.length === 2
    && value.rollbackScenarios.every((scenario, index) => scenario?.tag === TAGS[index]
      && scenario?.rollbackPerformed === true
      && scenario?.rollbackVerified === true)
    && value.rollbackScenarioCount === 2
    && value.rollbackVerifiedCount === 2
    && value.failurePathVerified === true
    && value.intentionalFailureProbes === 2
    && value.ephemeralDatabaseWrites === true
    && value.liveDatabaseAccessed === false
    && value.liveDatabaseWrites === false
    && value.liveApplyPerformed === false
    && value.filesystemMutations === false
    && value.externalCalls === false
    && value.publishTriggered === false
    && value.businessResult === false;
}

export function buildPlatformTextReviewMigrationExecutionPreflight({ authorizationPreview, isolatedRehearsal } = {}) {
  const blockers = [];
  if (!validAuthorizationPreview(authorizationPreview)) blockers.push("review_migration_authorization_preview_invalid_or_tampered");
  if (!validIsolatedRehearsal(isolatedRehearsal)) blockers.push("review_migration_isolated_rehearsal_invalid_or_tampered");
  if (blockers.length) return safeResult({ blockers });

  const evidence = {
    sourceMigrationScopeFingerprint: authorizationPreview.migrationScopeFingerprint,
    migrationTags: TAGS,
    objectCounts: { tables: authorizationPreview.tableCount, indexes: authorizationPreview.indexCount },
    isolatedEvidence: {
      appliedTags: isolatedRehearsal.appliedTags,
      schemaVerified: isolatedRehearsal.schemaVerified,
      rollbackVerifiedCount: isolatedRehearsal.rollbackVerifiedCount,
      liveDatabaseAccessed: isolatedRehearsal.liveDatabaseAccessed,
      liveDatabaseWrites: isolatedRehearsal.liveDatabaseWrites,
    },
  };

  return safeResult({
    status: "platform_text_review_migration_execution_preflight_ready",
    sourceMigrationScopeFingerprint: authorizationPreview.migrationScopeFingerprint,
    migrationExecutionPreflightFingerprint: hash(evidence),
    requiredConfirmation: authorizationPreview.requiredConfirmation,
    evidenceValidated: true,
    ephemeralEvidenceUsed: true,
    readyForExplicitAuthorizationRequest: true,
  });
}
