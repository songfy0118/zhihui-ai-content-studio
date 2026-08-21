export const SOURCE_LOCK_SCHEMA_SQL = `SELECT name, type FROM sqlite_schema
WHERE name IN (
  'source_locks', 'source_lock_evidence',
  'uq_source_locks_review_fingerprint', 'uq_source_locks_save_plan_fingerprint', 'idx_source_locks_lead_created_at',
  'uq_source_lock_evidence_lock_role', 'idx_source_lock_evidence_canonical_url', 'idx_source_lock_evidence_source_id'
)`;

const EXPECTED_OBJECTS = [
  "table:source_locks",
  "table:source_lock_evidence",
  "index:uq_source_locks_review_fingerprint",
  "index:uq_source_locks_save_plan_fingerprint",
  "index:idx_source_locks_lead_created_at",
  "index:uq_source_lock_evidence_lock_role",
  "index:idx_source_lock_evidence_canonical_url",
  "index:idx_source_lock_evidence_source_id",
];
const EXPECTED_LOCK_COLUMNS = ["id", "lead_id", "title", "review_fingerprint", "save_plan_fingerprint", "status", "created_at", "updated_at"];
const EXPECTED_EVIDENCE_COLUMNS = ["source_lock_id", "evidence_id", "source_id", "source_name", "title", "canonical_url", "published_at", "evidence_role", "created_at"];

function names(result) {
  return new Set(Array.isArray(result?.results) ? result.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
}

export async function inspectSourceLockStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const [schemaResult, lockColumnsResult, evidenceColumnsResult] = await Promise.all([
    d1.prepare(SOURCE_LOCK_SCHEMA_SQL).all(),
    d1.prepare("PRAGMA table_info(`source_locks`)").all(),
    d1.prepare("PRAGMA table_info(`source_lock_evidence`)").all(),
  ]);
  const objects = new Set(Array.isArray(schemaResult?.results) ? schemaResult.results.map((row) => `${row.type}:${row.name}`) : []);
  const lockColumns = names(lockColumnsResult);
  const evidenceColumns = names(evidenceColumnsResult);
  const missingObjects = EXPECTED_OBJECTS.filter((object) => !objects.has(object));
  const missingColumns = [
    ...EXPECTED_LOCK_COLUMNS.filter((column) => !lockColumns.has(column)).map((column) => `source_locks.${column}`),
    ...EXPECTED_EVIDENCE_COLUMNS.filter((column) => !evidenceColumns.has(column)).map((column) => `source_lock_evidence.${column}`),
  ];
  const presentCount = EXPECTED_OBJECTS.length - missingObjects.length + EXPECTED_LOCK_COLUMNS.length - missingColumns.filter((column) => column.startsWith("source_locks.")).length + EXPECTED_EVIDENCE_COLUMNS.length - missingColumns.filter((column) => column.startsWith("source_lock_evidence.")).length;
  const expectedCount = EXPECTED_OBJECTS.length + EXPECTED_LOCK_COLUMNS.length + EXPECTED_EVIDENCE_COLUMNS.length;
  const status = presentCount === 0 ? "missing" : missingObjects.length || missingColumns.length ? "partial" : "verified";
  return {
    status,
    verified: status === "verified",
    missingObjects,
    missingColumns,
    expectedObjectCount: EXPECTED_OBJECTS.length,
    databaseWrites: false,
    applyPerformed: false,
    externalCalls: false,
  };
}
