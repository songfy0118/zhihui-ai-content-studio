import { createHash } from "node:crypto";

const MIGRATIONS = [
  {
    tag: "0009_chunky_praxagora",
    tables: ["platform_text_draft_review_platforms", "platform_text_draft_review_receipts"],
    indexes: [
      "uq_platform_text_draft_review_platform_receipt_platform",
      "idx_platform_text_draft_review_platform_draft",
      "uq_platform_text_draft_review_fingerprint",
      "uq_platform_text_draft_review_idempotency_key",
      "idx_platform_text_draft_review_preview_created_at",
    ],
  },
  {
    tag: "0010_tranquil_donald_blake",
    tables: [
      "platform_text_visual_review_assets",
      "platform_text_visual_review_platforms",
      "platform_text_visual_review_receipts",
    ],
    indexes: [
      "uq_platform_text_visual_review_asset_receipt_platform_card",
      "idx_platform_text_visual_review_asset_svg_fingerprint",
      "uq_platform_text_visual_review_platform_receipt_platform",
      "idx_platform_text_visual_review_platform_platform",
      "uq_platform_text_visual_review_fingerprint",
      "uq_platform_text_visual_review_idempotency_key",
      "idx_platform_text_visual_review_render_created_at",
    ],
  },
];

const TABLE_COUNT = MIGRATIONS.reduce((total, migration) => total + migration.tables.length, 0);
const INDEX_COUNT = MIGRATIONS.reduce((total, migration) => total + migration.indexes.length, 0);
const MIGRATION_MANIFEST = MIGRATIONS.map(({ tag, tables, indexes }) => ({
  tag,
  tables: [...tables],
  indexes: [...indexes],
}));

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
    migrationManifest: MIGRATION_MANIFEST,
    tableCount: TABLE_COUNT,
    indexCount: INDEX_COUNT,
    objectCount: TABLE_COUNT + INDEX_COUNT,
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
    && value?.draftReviewStorage?.missingObjectCount === MIGRATIONS[0].tables.length + MIGRATIONS[0].indexes.length
    && value?.draftReviewStorage?.missingColumnCount === 13
    && value?.visualReviewStorage?.status === "missing"
    && value?.visualReviewStorage?.migrationTag === MIGRATIONS[1].tag
    && value?.visualReviewStorage?.missingObjectCount === MIGRATIONS[1].tables.length + MIGRATIONS[1].indexes.length
    && value?.visualReviewStorage?.missingColumnCount === 21;
}

export function buildPlatformTextReviewMigrationAuthorizationPreview(storageReadiness) {
  if (!validReadiness(storageReadiness)) {
    return safeResult({ blockers: ["platform_text_review_storage_readiness_invalid_or_stale"] });
  }

  const scope = {
    targetBinding: "DB",
    localOnly: true,
    migrations: MIGRATION_MANIFEST,
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
