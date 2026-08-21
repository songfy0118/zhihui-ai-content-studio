const DESTRUCTIVE_SQL = /\b(?:ALTER|DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

export function assessLocalD1MigrationPreflight({ hosting, migrationTag, migrationSql, storageStatus } = {}) {
  const blockers = [];
  const normalizedSql = typeof migrationSql === "string" ? migrationSql.replaceAll("--> statement-breakpoint", "") : "";
  const statements = normalizedSql.split(";").map((statement) => statement.trim()).filter(Boolean);
  const targetBinding = hosting?.d1 ?? null;
  const createsReceiptTable = statements.some((statement) => /^CREATE TABLE `pilot_authorization_receipts`/i.test(statement));
  const createsAuditIndex = statements.some((statement) => /CREATE INDEX `idx_pilot_receipts_execution_hash_issued_at`/i.test(statement));
  const createsExpiryIndex = statements.some((statement) => /CREATE INDEX `idx_pilot_receipts_status_expires_at`/i.test(statement));
  const destructiveStatements = DESTRUCTIVE_SQL.test(normalizedSql);
  const onlyCreateStatements = statements.length > 0 && statements.every((statement) => /^CREATE (?:TABLE|INDEX)\b/i.test(statement));

  if (targetBinding !== "DB") blockers.push("d1_binding_mismatch");
  if (storageStatus === "verified") blockers.push("migration_already_applied");
  else if (storageStatus !== "missing") blockers.push("storage_status_not_safe_to_apply");
  if (!migrationTag) blockers.push("migration_tag_missing");
  if (!createsReceiptTable || !createsAuditIndex || !createsExpiryIndex) blockers.push("receipt_migration_incomplete");
  if (destructiveStatements || !onlyCreateStatements) blockers.push("migration_not_create_only");

  return {
    readyToApplyLocally: blockers.length === 0,
    blockers,
    targetBinding,
    storageStatus: storageStatus ?? "unknown",
    migrationTag: migrationTag ?? null,
    statementCount: statements.length,
    createsReceiptTable,
    createsAuditIndex,
    createsExpiryIndex,
    onlyCreateStatements,
    destructiveStatements,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
  };
}
