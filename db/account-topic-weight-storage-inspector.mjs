export const ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL = `SELECT name, type FROM sqlite_schema
WHERE name IN (
  'account_topic_weight_update_items', 'account_topic_weight_update_receipts', 'account_topic_weight_values',
  'uq_account_topic_weight_update_item_receipt_scope_key', 'idx_account_topic_weight_update_item_receipt',
  'uq_account_topic_weight_update_source_review', 'uq_account_topic_weight_update_authorization_preview',
  'uq_account_topic_weight_update_idempotency_key', 'idx_account_topic_weight_update_profile_created_at',
  'uq_account_topic_weight_value_profile_scope_key', 'idx_account_topic_weight_value_source_receipt'
)`;

export const ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS = Object.freeze([
  "table:account_topic_weight_update_items",
  "table:account_topic_weight_update_receipts",
  "table:account_topic_weight_values",
  "index:uq_account_topic_weight_update_item_receipt_scope_key",
  "index:idx_account_topic_weight_update_item_receipt",
  "index:uq_account_topic_weight_update_source_review",
  "index:uq_account_topic_weight_update_authorization_preview",
  "index:uq_account_topic_weight_update_idempotency_key",
  "index:idx_account_topic_weight_update_profile_created_at",
  "index:uq_account_topic_weight_value_profile_scope_key",
  "index:idx_account_topic_weight_value_source_receipt",
]);

export const ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS = Object.freeze({
  account_topic_weight_update_items: Object.freeze([
    "receipt_id", "scope", "weight_key", "previous_weight", "applied_weight", "delta",
    "source_unique_idea_count", "source_mean_signal", "created_at",
  ]),
  account_topic_weight_update_receipts: Object.freeze([
    "id", "profile_id", "source_review_fingerprint", "authorization_preview_fingerprint",
    "idempotency_key", "status", "created_at",
  ]),
  account_topic_weight_values: Object.freeze([
    "profile_id", "scope", "weight_key", "weight", "source_update_receipt_id", "updated_at",
  ]),
});

function names(result) {
  return new Set(Array.isArray(result?.results) ? result.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
}

export async function inspectAccountTopicWeightStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const tableNames = Object.keys(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS);
  const [schemaResult, ...columnResults] = await Promise.all([
    d1.prepare(ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL).all(),
    ...tableNames.map((table) => d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()),
  ]);
  const objects = new Set(Array.isArray(schemaResult?.results) ? schemaResult.results.map((row) => `${row.type}:${row.name}`) : []);
  const missingObjects = ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.filter((object) => !objects.has(object));
  const missingColumns = tableNames.flatMap((table, index) => {
    const present = names(columnResults[index]);
    return ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS[table]
      .filter((column) => !present.has(column))
      .map((column) => `${table}.${column}`);
  });
  const expectedColumnCount = Object.values(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS).reduce((total, columns) => total + columns.length, 0);
  const presentCount = ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.length - missingObjects.length + expectedColumnCount - missingColumns.length;
  const status = presentCount === 0 ? "missing" : missingObjects.length || missingColumns.length ? "partial" : "verified";

  return {
    status,
    verified: status === "verified",
    blockers: status === "verified" ? [] : [status === "missing"
      ? "account_topic_weight_storage_missing"
      : "account_topic_weight_storage_partial"],
    missingObjects,
    missingColumns,
    expectedObjectCount: ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.length,
    expectedColumnCount,
    inspectedDataRows: false,
    accountWeightsRead: false,
    databaseWrites: false,
    applyPerformed: false,
    learningWeightsUpdated: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
