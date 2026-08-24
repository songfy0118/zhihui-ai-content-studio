import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TAGS = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];
const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_local_target_diagnostic_blocked",
    blockers: [],
    migrationTags: TAGS,
    targetBinding: null,
    bindingScope: "unverified",
    databaseNameConfigured: false,
    placeholderLocalDatabaseId: false,
    loopbackDevConfig: false,
    migrationJournalVerified: false,
    localStateCandidateCount: 0,
    localTargetEvidenceFingerprint: null,
    localTargetProven: false,
    readyForExplicitAuthorizationRequest: false,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    commandPrepared: false,
    executorConnected: false,
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

export function inspectPlatformTextReviewMigrationLocalEnvironment({
  hosting,
  deployConfig,
  runtimeConfig,
  journalEntries,
  localStateFiles,
} = {}) {
  const blockers = [];
  const targetBinding = hosting?.d1 ?? null;
  const normalizedConfigPath = typeof deployConfig?.configPath === "string" ? deployConfig.configPath.replaceAll("\\", "/") : "";
  const d1 = Array.isArray(runtimeConfig?.d1_databases)
    ? runtimeConfig.d1_databases.find((entry) => entry?.binding === targetBinding)
    : null;
  const journalTags = Array.isArray(journalEntries) ? journalEntries.map((entry) => entry?.tag) : [];
  const candidates = Array.isArray(localStateFiles)
    ? localStateFiles.filter((name) => typeof name === "string" && name.endsWith(".sqlite") && name !== "metadata.sqlite")
    : [];
  const loopbackDevConfig = runtimeConfig?.dev?.ip === "127.0.0.1" && runtimeConfig?.dev?.local_protocol === "http";
  const databaseNameConfigured = typeof d1?.database_name === "string" && Boolean(d1.database_name.trim());
  const placeholderLocalDatabaseId = d1?.database_id === LOCAL_DATABASE_ID;
  const migrationJournalVerified = TAGS.every((tag) => journalTags.includes(tag));

  if (targetBinding !== "DB") blockers.push("review_migration_local_target_binding_mismatch");
  if (normalizedConfigPath !== "../../dist/server/wrangler.json") blockers.push("review_migration_local_runtime_config_unbound");
  if (!loopbackDevConfig) blockers.push("review_migration_local_runtime_not_loopback");
  if (!databaseNameConfigured || !placeholderLocalDatabaseId) blockers.push("review_migration_local_d1_config_not_local");
  if (!migrationJournalVerified) blockers.push("review_migration_local_journal_incomplete");
  if (candidates.length !== 1) blockers.push("review_migration_local_state_target_ambiguous");
  if (blockers.length) return safeResult({ blockers, targetBinding, databaseNameConfigured, placeholderLocalDatabaseId, loopbackDevConfig, migrationJournalVerified, localStateCandidateCount:candidates.length });

  const evidence = {
    targetBinding,
    runtimeName: runtimeConfig.name,
    databaseName: d1.database_name,
    placeholderLocalDatabaseId,
    loopbackDevConfig,
    migrationTags: TAGS,
    localStateCandidateCount: candidates.length,
  };
  return safeResult({
    status: "platform_text_review_migration_local_environment_verified",
    targetBinding,
    bindingScope: "loopback_miniflare_only",
    databaseNameConfigured,
    placeholderLocalDatabaseId,
    loopbackDevConfig,
    migrationJournalVerified,
    localStateCandidateCount: candidates.length,
    localTargetEvidenceFingerprint: hash(evidence),
    localTargetProven: true,
  });
}

function validExecutionPreflight(value) {
  return value?.status === "platform_text_review_migration_execution_preflight_ready"
    && HASH.test(value?.sourceMigrationScopeFingerprint ?? "")
    && HASH.test(value?.migrationExecutionPreflightFingerprint ?? "")
    && value?.requiredConfirmation === `AUTHORIZE LOCAL REVIEW STORAGE MIGRATIONS 0009 0010 ${value.sourceMigrationScopeFingerprint}`
    && JSON.stringify(value?.migrationTags) === JSON.stringify(TAGS)
    && value?.evidenceValidated === true
    && value?.readyForExplicitAuthorizationRequest === true
    && value?.confirmationReceived === false
    && value?.authorizationGranted === false
    && value?.authorizationConsumed === false
    && value?.executionContract === null
    && value?.executorConnected === false
    && value?.applyImplemented === false
    && value?.applyPerformed === false
    && value?.databaseWrites === false;
}

function validEnvironment(value) {
  return value?.status === "platform_text_review_migration_local_environment_verified"
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
    && value?.databaseFileOpened === false
    && value?.databaseReadAttempted === false
    && value?.databaseWrites === false
    && value?.filesystemWrites === false
    && value?.externalCalls === false;
}

export function bindPlatformTextReviewMigrationLocalTargetDiagnostic({ executionPreflight, environment } = {}) {
  const blockers = [];
  if (!validExecutionPreflight(executionPreflight)) blockers.push("review_migration_execution_preflight_invalid_or_tampered");
  if (!validEnvironment(environment)) blockers.push(...(environment?.blockers?.length ? environment.blockers : ["review_migration_local_environment_invalid_or_tampered"]));
  if (blockers.length) return safeResult({ blockers:[...new Set(blockers)] });
  return safeResult({
    status: "platform_text_review_migration_local_target_diagnostic_verified",
    targetBinding: environment.targetBinding,
    bindingScope: environment.bindingScope,
    databaseNameConfigured: true,
    placeholderLocalDatabaseId: true,
    loopbackDevConfig: true,
    migrationJournalVerified: true,
    localStateCandidateCount: 1,
    localTargetEvidenceFingerprint: environment.localTargetEvidenceFingerprint,
    localTargetProven: true,
    readyForExplicitAuthorizationRequest: true,
  });
}
