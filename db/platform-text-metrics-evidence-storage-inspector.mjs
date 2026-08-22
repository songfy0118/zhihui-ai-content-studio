export const METRICS_EVIDENCE_COLUMNS_SQL = "PRAGMA table_info(`metrics`)";
export const METRICS_EVIDENCE_INDEXES_SQL = `SELECT name FROM sqlite_schema
WHERE type = 'index' AND tbl_name = 'metrics'`;

export const LEGACY_METRICS_PROVENANCE_COLUMNS = ["source_kind", "external_post_id", "captured_at", "imported_at"];
export const LEGACY_METRICS_PROVENANCE_INDEX = "uq_metrics_platform_post_captured_at";
export const METRICS_EVIDENCE_COLUMNS = [
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
];
export const METRICS_EVIDENCE_INDEXES = [
  "idx_metrics_content_fingerprint",
  "idx_metrics_source_evidence_fingerprint",
];

function names(result) {
  return new Set(Array.isArray(result?.results) ? result.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
}

export async function inspectPlatformTextMetricsEvidenceStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const [columnResult, indexResult] = await Promise.all([
    d1.prepare(METRICS_EVIDENCE_COLUMNS_SQL).all(),
    d1.prepare(METRICS_EVIDENCE_INDEXES_SQL).all(),
  ]);
  const columns = names(columnResult);
  const indexes = names(indexResult);
  const missingColumns = METRICS_EVIDENCE_COLUMNS.filter((name) => !columns.has(name));
  const missingIndexes = METRICS_EVIDENCE_INDEXES.filter((name) => !indexes.has(name));
  const presentEvidenceCount = METRICS_EVIDENCE_COLUMNS.length - missingColumns.length + METRICS_EVIDENCE_INDEXES.length - missingIndexes.length;
  const legacyVerified = LEGACY_METRICS_PROVENANCE_COLUMNS.every((name) => columns.has(name)) && indexes.has(LEGACY_METRICS_PROVENANCE_INDEX);
  const tablePresent = columns.size > 0;
  const verified = missingColumns.length === 0 && missingIndexes.length === 0;
  const status = verified
    ? "verified"
    : legacyVerified && presentEvidenceCount === 0
      ? "legacy_verified"
      : tablePresent
        ? "partial"
        : "missing_table";

  return {
    status,
    verified,
    legacyVerified,
    tablePresent,
    columnsPresent: METRICS_EVIDENCE_COLUMNS.filter((name) => columns.has(name)),
    indexesPresent: METRICS_EVIDENCE_INDEXES.filter((name) => indexes.has(name)),
    missingColumns,
    missingIndexes,
    blockers: verified ? [] : [
      status === "legacy_verified"
        ? "metrics_evidence_migration_pending"
        : status === "missing_table"
          ? "metrics_table_missing"
          : "metrics_evidence_storage_partial",
    ],
    inspectedDataRows: false,
    databaseWrites: false,
    applyPerformed: false,
    metricsImported: false,
    learningWeightsUpdated: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
