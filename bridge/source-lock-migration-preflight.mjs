const MUTATING_SQL = /\b(?:ALTER|DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

export function assessSourceLockMigrationPreflight({ hosting, migrationTag, migrationSql, storageStatus } = {}) {
  const normalizedSql = typeof migrationSql === "string" ? migrationSql.replaceAll("--> statement-breakpoint", "") : "";
  const statements = normalizedSql.split(";").map((statement) => statement.trim()).filter(Boolean);
  const blockers = [];
  const targetBinding = hosting?.d1 ?? null;
  const createsLockTable = statements.some((statement) => /^CREATE TABLE `source_locks`/i.test(statement));
  const createsEvidenceTable = statements.some((statement) => /^CREATE TABLE `source_lock_evidence`/i.test(statement));
  const createsReviewFingerprintIndex = statements.some((statement) => /CREATE UNIQUE INDEX `uq_source_locks_review_fingerprint`/i.test(statement));
  const createsSavePlanFingerprintIndex = statements.some((statement) => /CREATE UNIQUE INDEX `uq_source_locks_save_plan_fingerprint`/i.test(statement));
  const createsEvidenceRoleIndex = statements.some((statement) => /CREATE UNIQUE INDEX `uq_source_lock_evidence_lock_role`/i.test(statement));
  const onlyCreateStatements = statements.length > 0 && statements.every((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(statement));
  const destructiveStatements = MUTATING_SQL.test(normalizedSql);
  if (targetBinding !== "DB") blockers.push("d1_binding_mismatch");
  if (!migrationTag) blockers.push("migration_tag_missing");
  if (storageStatus === "verified") blockers.push("migration_already_applied");
  else if (storageStatus !== "missing") blockers.push("storage_status_not_safe_to_apply");
  if (!createsLockTable || !createsEvidenceTable || !createsReviewFingerprintIndex || !createsSavePlanFingerprintIndex || !createsEvidenceRoleIndex) blockers.push("source_lock_migration_incomplete");
  if (destructiveStatements || !onlyCreateStatements) blockers.push("migration_not_create_only");
  return {
    mode: "plan_only",
    readyToApplyLocally: blockers.length === 0,
    blockers,
    targetBinding,
    storageStatus: storageStatus ?? "unknown",
    migrationTag: migrationTag ?? null,
    statementCount: statements.length,
    createsLockTable,
    createsEvidenceTable,
    createsReviewFingerprintIndex,
    createsSavePlanFingerprintIndex,
    createsEvidenceRoleIndex,
    onlyCreateStatements,
    destructiveStatements,
    authorizationRequired: true,
    applyImplemented: false,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
