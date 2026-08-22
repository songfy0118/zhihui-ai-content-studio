const MUTATING_SQL = /\b(?:ALTER|DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

export const ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG = "0012_kind_emma_frost";

const REQUIRED_TABLES = Object.freeze([
  "account_topic_weight_update_items",
  "account_topic_weight_update_receipts",
  "account_topic_weight_values",
]);
const REQUIRED_INDEXES = Object.freeze([
  "uq_account_topic_weight_update_item_receipt_scope_key",
  "idx_account_topic_weight_update_item_receipt",
  "uq_account_topic_weight_update_source_review",
  "uq_account_topic_weight_update_authorization_preview",
  "uq_account_topic_weight_update_idempotency_key",
  "idx_account_topic_weight_update_profile_created_at",
  "uq_account_topic_weight_value_profile_scope_key",
  "idx_account_topic_weight_value_source_receipt",
]);

export function assessAccountTopicWeightStoreMigrationPreflight({
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
  const createdIndexes = REQUIRED_INDEXES.filter((index) => statements.some((statement) => {
    const normalized = statement.toLowerCase();
    return normalized.startsWith(`create index \`${index}\``)
      || normalized.startsWith(`create unique index \`${index}\``);
  }));
  const onlyCreateStatements = statements.length > 0 && statements.every((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(statement));
  const destructiveStatements = MUTATING_SQL.test(normalizedSql);

  if (targetBinding !== "DB") blockers.push("d1_binding_mismatch");
  if (migrationTag !== ACCOUNT_TOPIC_WEIGHT_STORE_MIGRATION_TAG) blockers.push("account_topic_weight_store_migration_tag_invalid");
  if (storageStatus === "verified") blockers.push("migration_already_applied");
  else if (storageStatus !== "missing") blockers.push("storage_status_not_safe_to_apply");
  if (createdTables.length !== REQUIRED_TABLES.length || createdIndexes.length !== REQUIRED_INDEXES.length) {
    blockers.push("account_topic_weight_store_migration_incomplete");
  }
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
    createdIndexes,
    onlyCreateStatements,
    destructiveStatements,
    authorizationRequired: true,
    applyImplemented: false,
    applyPerformed: false,
    accountWeightsRead: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
