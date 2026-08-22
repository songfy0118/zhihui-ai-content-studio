const MUTATING_SQL = /\b(?:ALTER|DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;
const REQUIRED_TABLES = [
  "platform_text_visual_review_receipts",
  "platform_text_visual_review_platforms",
  "platform_text_visual_review_assets",
];
const REQUIRED_UNIQUE_INDEXES = [
  "uq_platform_text_visual_review_fingerprint",
  "uq_platform_text_visual_review_idempotency_key",
  "uq_platform_text_visual_review_platform_receipt_platform",
  "uq_platform_text_visual_review_asset_receipt_platform_card",
];

export function assessPlatformTextVisualReviewMigrationPreflight({
  hosting,
  migrationTag,
  migrationSql,
  storageStatus,
} = {}) {
  const normalizedSql = typeof migrationSql === "string" ? migrationSql.replaceAll("--> statement-breakpoint", "") : "";
  const statements = normalizedSql.split(";").map((statement) => statement.trim()).filter(Boolean);
  const blockers = [];
  const targetBinding = hosting?.d1 ?? null;
  const createdTables = REQUIRED_TABLES.filter((table) => statements.some((statement) => statement.toLowerCase().startsWith(`create table \`${table}\``)));
  const createdUniqueIndexes = REQUIRED_UNIQUE_INDEXES.filter((index) => statements.some((statement) => statement.toLowerCase().startsWith(`create unique index \`${index}\``)));
  const onlyCreateStatements = statements.length > 0 && statements.every((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(statement));
  const destructiveStatements = MUTATING_SQL.test(normalizedSql);

  if (targetBinding !== "DB") blockers.push("d1_binding_mismatch");
  if (migrationTag !== "0010_tranquil_donald_blake") blockers.push("platform_text_visual_review_migration_tag_invalid");
  if (storageStatus === "verified") blockers.push("migration_already_applied");
  else if (storageStatus !== "missing") blockers.push("storage_status_not_safe_to_apply");
  if (createdTables.length !== REQUIRED_TABLES.length || createdUniqueIndexes.length !== REQUIRED_UNIQUE_INDEXES.length) blockers.push("platform_text_visual_review_migration_incomplete");
  if (destructiveStatements || !onlyCreateStatements) blockers.push("migration_not_create_only");

  return {
    mode: "plan_only",
    readyToApplyLocally: blockers.length === 0,
    blockers,
    targetBinding,
    storageStatus: storageStatus ?? "unknown",
    migrationTag: migrationTag ?? null,
    statementCount: statements.length,
    createdTables,
    createdUniqueIndexes,
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
