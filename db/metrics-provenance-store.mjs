export const INSPECT_METRICS_COLUMNS_SQL = "PRAGMA table_info(`metrics`)";
export const INSPECT_METRICS_INDEXES_SQL = `SELECT name FROM sqlite_schema
WHERE type = 'index' AND tbl_name = 'metrics'`;

export const REQUIRED_METRICS_PROVENANCE_COLUMNS = ["source_kind", "external_post_id", "captured_at", "imported_at"];
export const REQUIRED_METRICS_PROVENANCE_INDEX = "uq_metrics_platform_post_captured_at";

function safeResult(fields = {}) {
  return {
    verification: "read_only_sqlite_schema",
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    ...fields,
  };
}

export async function inspectMetricsProvenanceStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const [columnResult, indexResult] = await Promise.all([
    d1.prepare(INSPECT_METRICS_COLUMNS_SQL).all(),
    d1.prepare(INSPECT_METRICS_INDEXES_SQL).all(),
  ]);
  const columns = Array.isArray(columnResult?.results)
    ? columnResult.results.map((row) => row?.name).filter((name) => typeof name === "string")
    : [];
  if (columns.length === 0) {
    return safeResult({ status: "missing_table", verified: false, tablePresent: false, columnsPresent: [], missingColumns: REQUIRED_METRICS_PROVENANCE_COLUMNS, indexPresent: false, blockers: ["metrics_table_missing"] });
  }
  const indexes = Array.isArray(indexResult?.results)
    ? indexResult.results.map((row) => row?.name).filter((name) => typeof name === "string")
    : [];
  const missingColumns = REQUIRED_METRICS_PROVENANCE_COLUMNS.filter((name) => !columns.includes(name));
  const indexPresent = indexes.includes(REQUIRED_METRICS_PROVENANCE_INDEX);
  const verified = missingColumns.length === 0 && indexPresent;
  return safeResult({
    status: verified ? "verified" : "incomplete",
    verified,
    tablePresent: true,
    columnsPresent: REQUIRED_METRICS_PROVENANCE_COLUMNS.filter((name) => columns.includes(name)),
    missingColumns,
    indexPresent,
    blockers: verified ? [] : [missingColumns.length ? "provenance_columns_missing" : "deduplication_index_missing"],
  });
}
