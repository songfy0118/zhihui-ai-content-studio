const DESTRUCTIVE_SQL = /\b(?:DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

export const PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG = "0011_living_logan";
export const REQUIRED_METRICS_EVIDENCE_COLUMNS = [
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
];
export const REQUIRED_METRICS_EVIDENCE_INDEXES = [
  "idx_metrics_content_fingerprint",
  "idx_metrics_source_evidence_fingerprint",
];

function statementsFrom(migrationSql) {
  const normalizedSql = typeof migrationSql === "string"
    ? migrationSql.replaceAll("--> statement-breakpoint", "")
    : "";
  return {
    normalizedSql,
    statements: normalizedSql.split(";").map((statement) => statement.trim()).filter(Boolean),
  };
}

function addedColumn(statement) {
  return statement.match(/^ALTER TABLE\s+`metrics`\s+ADD\s+`([^`]+)`\s+text$/i)?.[1] ?? null;
}

function createdIndex(statement) {
  return statement.match(/^CREATE INDEX\s+`([^`]+)`\s+ON\s+`metrics`\s+\(`([^`]+)`\)$/i)?.slice(1) ?? null;
}

export function assessPlatformTextMetricsEvidenceMigrationPreflight({
  hosting,
  migrationTag,
  migrationSql,
  storageStatus,
} = {}) {
  const { normalizedSql, statements } = statementsFrom(migrationSql);
  const parsedColumns = statements.map(addedColumn).filter(Boolean);
  const parsedIndexes = statements.map(createdIndex).filter(Boolean);
  const addedColumns = REQUIRED_METRICS_EVIDENCE_COLUMNS.filter((column) => parsedColumns.includes(column));
  const createdIndexes = REQUIRED_METRICS_EVIDENCE_INDEXES.filter((index) => parsedIndexes.some(([name, column]) => name === index && column === index.replace("idx_metrics_", "")));
  const onlyAdditiveStatements = statements.length > 0 && statements.every((statement) => {
    const column = addedColumn(statement);
    if (column) return REQUIRED_METRICS_EVIDENCE_COLUMNS.includes(column);
    const index = createdIndex(statement);
    return Boolean(index && REQUIRED_METRICS_EVIDENCE_INDEXES.includes(index[0]) && index[1] === index[0].replace("idx_metrics_", ""));
  });
  const destructiveStatements = DESTRUCTIVE_SQL.test(normalizedSql);
  const blockers = [];
  const targetBinding = hosting?.d1 ?? null;

  if (targetBinding !== "DB") blockers.push("d1_binding_mismatch");
  if (migrationTag !== PLATFORM_TEXT_METRICS_EVIDENCE_MIGRATION_TAG) blockers.push("platform_text_metrics_evidence_migration_tag_invalid");
  if (storageStatus === "verified") blockers.push("migration_already_applied");
  else if (storageStatus !== "legacy_verified") blockers.push("storage_status_not_safe_to_apply");
  if (addedColumns.length !== REQUIRED_METRICS_EVIDENCE_COLUMNS.length || createdIndexes.length !== REQUIRED_METRICS_EVIDENCE_INDEXES.length) {
    blockers.push("platform_text_metrics_evidence_migration_incomplete");
  }
  if (destructiveStatements || !onlyAdditiveStatements) blockers.push("migration_not_additive_only");

  return {
    mode: "plan_only",
    readyToApplyLocally: blockers.length === 0,
    blockers,
    targetBinding,
    storageStatus: storageStatus ?? "unknown",
    migrationTag: migrationTag ?? null,
    statementCount: statements.length,
    addedColumns,
    createdIndexes,
    onlyAdditiveStatements,
    destructiveStatements,
    authorizationRequired: true,
    applyImplemented: false,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
