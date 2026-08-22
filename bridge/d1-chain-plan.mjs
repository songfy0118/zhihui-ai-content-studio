const UNSAFE_DATA_SQL = /\b(?:DROP|DELETE|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;

function splitStatements(sql) {
  return typeof sql === "string"
    ? sql.replaceAll("--> statement-breakpoint", "").split(";").map((statement) => statement.trim()).filter(Boolean)
    : [];
}

export function buildD1ChainPlan({ journalEntries = [], migrations = [], liveStatus = null } = {}) {
  const tags = journalEntries.map((entry) => entry?.tag).filter((tag) => typeof tag === "string");
  const migrationMap = new Map(migrations.map((migration) => [migration.tag, migration.sql]));
  const missingFiles = tags.filter((tag) => !migrationMap.has(tag));
  const unsafeFiles = [];
  const unsupportedStatements = [];
  for (const tag of tags) {
    const sql = migrationMap.get(tag) ?? "";
    if (UNSAFE_DATA_SQL.test(sql)) unsafeFiles.push(tag);
    for (const statement of splitStatements(sql)) {
      if (!/^(?:CREATE (?:TABLE|INDEX|UNIQUE INDEX)|ALTER TABLE\b.+\bADD\b)/i.test(statement)) unsupportedStatements.push({ tag, statementType: statement.split(/\s+/).slice(0, 3).join(" ") });
    }
  }
  const expectedOrder = ["0000_serious_tinkerer", "0001_modern_hydra", "0002_shiny_spitfire", "0003_faithful_harry_osborn", "0004_strange_doorman", "0005_jazzy_toad", "0006_amused_vulture", "0007_silly_turbo", "0008_overconfident_vance_astro", "0009_chunky_praxagora", "0010_tranquil_donald_blake", "0011_living_logan"];
  const orderMatches = JSON.stringify(tags) === JSON.stringify(expectedOrder);
  const sourcePlanReady = orderMatches && missingFiles.length === 0 && unsafeFiles.length === 0 && unsupportedStatements.length === 0;
  const liveStateVerified = liveStatus?.verification === "read_only_sqlite_schema";
  const ledgerRequiresReview = Array.isArray(liveStatus?.migrationLedgerObjects) && liveStatus.migrationLedgerObjects.length > 0;
  const readyForAuthorizedApply = sourcePlanReady && liveStateVerified && liveStatus?.status === "empty" && !ledgerRequiresReview;
  const blockers = [
    ...(!orderMatches ? ["migration_order_mismatch"] : []),
    ...(missingFiles.length ? ["migration_files_missing"] : []),
    ...(unsafeFiles.length ? ["unsafe_sql_detected"] : []),
    ...(unsupportedStatements.length ? ["unsupported_schema_statement"] : []),
    ...(!liveStateVerified ? ["live_database_state_not_verified"] : []),
    ...(liveStatus && liveStatus.status !== "empty" && liveStatus.status !== "current" ? ["database_not_empty_or_current"] : []),
    ...(ledgerRequiresReview ? ["migration_ledger_requires_review"] : []),
  ];
  return {
    mode: "plan_only",
    sourcePlanReady,
    liveStateVerified,
    readyForAuthorizedApply,
    authorizationRequired: !liveStatus?.current,
    tags,
    expectedOrder,
    missingFiles,
    unsafeFiles,
    unsupportedStatements,
    databaseStatus: liveStatus?.status ?? "unknown",
    firstPending: liveStatus?.firstPending ?? null,
    migrationLedgerObjects: liveStatus?.migrationLedgerObjects ?? [],
    blockers,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
  };
}
