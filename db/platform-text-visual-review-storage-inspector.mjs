export const PLATFORM_TEXT_VISUAL_REVIEW_SCHEMA_SQL = `SELECT name, type FROM sqlite_schema
WHERE name IN (
  'platform_text_visual_review_receipts', 'platform_text_visual_review_platforms', 'platform_text_visual_review_assets',
  'uq_platform_text_visual_review_fingerprint', 'uq_platform_text_visual_review_idempotency_key',
  'idx_platform_text_visual_review_render_created_at',
  'uq_platform_text_visual_review_platform_receipt_platform', 'idx_platform_text_visual_review_platform_platform',
  'uq_platform_text_visual_review_asset_receipt_platform_card', 'idx_platform_text_visual_review_asset_svg_fingerprint'
)`;

const EXPECTED_OBJECTS = [
  "table:platform_text_visual_review_receipts",
  "table:platform_text_visual_review_platforms",
  "table:platform_text_visual_review_assets",
  "index:uq_platform_text_visual_review_fingerprint",
  "index:uq_platform_text_visual_review_idempotency_key",
  "index:idx_platform_text_visual_review_render_created_at",
  "index:uq_platform_text_visual_review_platform_receipt_platform",
  "index:idx_platform_text_visual_review_platform_platform",
  "index:uq_platform_text_visual_review_asset_receipt_platform_card",
  "index:idx_platform_text_visual_review_asset_svg_fingerprint",
];
const EXPECTED_COLUMNS = {
  platform_text_visual_review_receipts: ["id", "render_fingerprint", "bundle_manifest_fingerprint", "visual_review_fingerprint", "idempotency_key", "status", "created_at"],
  platform_text_visual_review_platforms: ["receipt_id", "platform", "asset_count", "review_note", "review_checks_json", "created_at"],
  platform_text_visual_review_assets: ["receipt_id", "platform", "card_index", "role", "filename", "copy_fingerprint", "svg_fingerprint", "created_at"],
};

function names(result) {
  return new Set(Array.isArray(result?.results) ? result.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
}

export async function inspectPlatformTextVisualReviewStorage(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const tableNames = Object.keys(EXPECTED_COLUMNS);
  const [schemaResult, ...columnResults] = await Promise.all([
    d1.prepare(PLATFORM_TEXT_VISUAL_REVIEW_SCHEMA_SQL).all(),
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
    blockers: status === "verified" ? [] : [status === "missing" ? "platform_text_visual_review_storage_missing" : "platform_text_visual_review_storage_partial"],
    missingObjects,
    missingColumns,
    expectedObjectCount: EXPECTED_OBJECTS.length,
    expectedColumnCount,
    inspectedDataRows: false,
    databaseWrites: false,
    applyPerformed: false,
    readyForAssetHandoff: false,
    assetsUnlocked: false,
    draftSaved: false,
    externalCalls: false,
    publishTriggered: false,
  };
}
