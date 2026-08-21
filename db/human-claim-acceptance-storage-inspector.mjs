export const HUMAN_CLAIM_ACCEPTANCE_SCHEMA_SQL = `SELECT name, type FROM sqlite_schema
WHERE name IN (
  'human_claim_acceptance_receipts', 'human_claim_acceptance_items', 'human_claim_acceptance_sources',
  'uq_human_claim_acceptance_fingerprint', 'uq_human_claim_acceptance_idempotency_key', 'idx_human_claim_acceptance_selection_created_at',
  'uq_human_claim_acceptance_items_receipt_claim', 'idx_human_claim_acceptance_items_claim_id',
  'uq_human_claim_acceptance_sources_receipt_claim_role', 'idx_human_claim_acceptance_sources_candidate_id', 'idx_human_claim_acceptance_sources_source_id'
)`;

const EXPECTED_OBJECTS = [
  "table:human_claim_acceptance_receipts",
  "table:human_claim_acceptance_items",
  "table:human_claim_acceptance_sources",
  "index:uq_human_claim_acceptance_fingerprint",
  "index:uq_human_claim_acceptance_idempotency_key",
  "index:idx_human_claim_acceptance_selection_created_at",
  "index:uq_human_claim_acceptance_items_receipt_claim",
  "index:idx_human_claim_acceptance_items_claim_id",
  "index:uq_human_claim_acceptance_sources_receipt_claim_role",
  "index:idx_human_claim_acceptance_sources_candidate_id",
  "index:idx_human_claim_acceptance_sources_source_id",
];
const EXPECTED_COLUMNS = {
  human_claim_acceptance_receipts: ["id", "claim_selection_fingerprint", "acceptance_fingerprint", "idempotency_key", "status", "created_at"],
  human_claim_acceptance_items: ["receipt_id", "claim_id", "proposed_claim", "review_note", "acceptance_checks_json", "created_at"],
  human_claim_acceptance_sources: ["receipt_id", "claim_id", "candidate_id", "evidence_id", "source_id", "evidence_role", "canonical_url", "source_sentence", "created_at"],
};

function names(result) {
  return new Set(Array.isArray(result?.results) ? result.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
}

export async function inspectHumanClaimAcceptanceStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const tableNames = Object.keys(EXPECTED_COLUMNS);
  const [schemaResult, ...columnResults] = await Promise.all([
    d1.prepare(HUMAN_CLAIM_ACCEPTANCE_SCHEMA_SQL).all(),
    ...tableNames.map((table) => d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()),
  ]);
  const objects = new Set(Array.isArray(schemaResult?.results) ? schemaResult.results.map((row) => `${row.type}:${row.name}`) : []);
  const missingObjects = EXPECTED_OBJECTS.filter((object) => !objects.has(object));
  const missingColumns = tableNames.flatMap((table, index) => {
    const present = names(columnResults[index]);
    return EXPECTED_COLUMNS[table].filter((column) => !present.has(column)).map((column) => `${table}.${column}`);
  });
  const expectedColumnCount = Object.values(EXPECTED_COLUMNS).reduce((total, columns) => total + columns.length, 0);
  const presentCount = EXPECTED_OBJECTS.length - missingObjects.length + expectedColumnCount - missingColumns.length;
  const status = presentCount === 0 ? "missing" : missingObjects.length || missingColumns.length ? "partial" : "verified";

  return {
    status,
    verified: status === "verified",
    blockers: status === "verified" ? [] : [status === "missing" ? "claim_acceptance_storage_missing" : "claim_acceptance_storage_partial"],
    missingObjects,
    missingColumns,
    expectedObjectCount: EXPECTED_OBJECTS.length,
    expectedColumnCount,
    inspectedDataRows: false,
    databaseWrites: false,
    applyPerformed: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
