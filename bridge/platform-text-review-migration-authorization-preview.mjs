import { createHash } from "node:crypto";

const MIGRATIONS = [
  { tag: "0009_chunky_praxagora", tables: 2, indexes: 5, objects: 7 },
  { tag: "0010_tranquil_donald_blake", tables: 3, indexes: 7, objects: 10 },
];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_authorization_preview_blocked",
    blockers: [],
    migrationScopeFingerprint: null,
    requiredConfirmation: null,
    migrationTags: MIGRATIONS.map(({ tag }) => tag),
    tableCount: 5,
    indexCount: 12,
    objectCount: 17,
    localOnly: true,
    remoteAllowed: false,
    createOnly: true,
    eligibleForExplicitLocalMigrationAuthorization: false,
    authorizationRequired: true,
    authorizationGranted: false,
    executorConnected: false,
    commandPrepared: false,
    applyImplemented: false,
    applyPerformed: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    browserOpenPerformed: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validReadiness(value) {
  return value?.status === "platform_text_review_storage_readiness_ready"
    && value?.storageInspectionReady === true
    && value?.bothSchemasVerified === false
    && value?.migrationAuthorizationRequired === true
    && value?.migrationApplyImplemented === false
    && value?.migrationApplyPerformed === false
    && value?.databaseReadAttempted === true
    && value?.databaseReads === 7
    && value?.databaseWrites === false
    && value?.draftReviewStorage?.status === "missing"
    && value?.draftReviewStorage?.migrationTag === MIGRATIONS[0].tag
    && value?.draftReviewStorage?.missingObjectCount === MIGRATIONS[0].objects
    && value?.draftReviewStorage?.missingColumnCount === 13
    && value?.visualReviewStorage?.status === "missing"
    && value?.visualReviewStorage?.migrationTag === MIGRATIONS[1].tag
    && value?.visualReviewStorage?.missingObjectCount === MIGRATIONS[1].objects
    && value?.visualReviewStorage?.missingColumnCount === 21;
}

export function buildPlatformTextReviewMigrationAuthorizationPreview(storageReadiness) {
  if (!validReadiness(storageReadiness)) {
    return safeResult({ blockers: ["platform_text_review_storage_readiness_invalid_or_stale"] });
  }

  const scope = {
    targetBinding: "DB",
    localOnly: true,
    migrations: MIGRATIONS,
    observedStorage: {
      draft: storageReadiness.draftReviewStorage.status,
      visual: storageReadiness.visualReviewStorage.status,
      databaseReads: storageReadiness.databaseReads,
    },
    constraints: {
      createOnly: true,
      remoteAllowed: false,
      noDrop: true,
      noDelete: true,
      noDataRowsRead: true,
      stopAfterMigration: true,
    },
  };
  const migrationScopeFingerprint = hash(scope);

  return safeResult({
    status: "platform_text_review_migration_authorization_preview_ready",
    migrationScopeFingerprint,
    requiredConfirmation: `AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${migrationScopeFingerprint}`,
    eligibleForExplicitLocalMigrationAuthorization: true,
  });
}
