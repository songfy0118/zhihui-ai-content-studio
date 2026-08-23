import { DatabaseSync } from "node:sqlite";

import { REVIEW_MIGRATION_MANIFEST } from "./platform-text-review-migration-authorization-preview.mjs";

const EXPECTED_TAGS = REVIEW_MIGRATION_MANIFEST.map(({ tag }) => tag);
const EXPECTED_OBJECTS = REVIEW_MIGRATION_MANIFEST.flatMap(({ tables, indexes }) => [
  ...tables.map((name) => ({ name, type: "table" })),
  ...indexes.map((name) => ({ name, type: "index" })),
]);

function splitStatements(sql) {
  return typeof sql === "string"
    ? sql.replaceAll("--> statement-breakpoint", "").split(";").map((statement) => statement.trim()).filter(Boolean)
    : [];
}

function snapshotSchema(database) {
  return JSON.stringify(database.prepare("SELECT name, type, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all());
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_migration_isolated_rehearsal_blocked",
    blockers: [],
    mode: "isolated_in_memory_sqlite",
    migrationTags: EXPECTED_TAGS,
    appliedTags: [],
    tableCount: 0,
    indexCount: 0,
    schemaVerified: false,
    successPathVerified: false,
    rollbackScenarios: [],
    rollbackScenarioCount: 0,
    rollbackVerifiedCount: 0,
    failurePathVerified: false,
    intentionalFailureProbes: 0,
    ephemeralDatabaseWrites: false,
    liveDatabaseAccessed: false,
    liveDatabaseWrites: false,
    liveApplyPerformed: false,
    filesystemMutations: false,
    externalCalls: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validMigrations(migrations) {
  return Array.isArray(migrations)
    && migrations.length === EXPECTED_TAGS.length
    && migrations.every(({ tag, sql }, index) => tag === EXPECTED_TAGS[index]
      && typeof sql === "string"
      && splitStatements(sql).length > 0
      && !/\b(?:DROP|DELETE|UPDATE|ALTER|TRUNCATE)\b/i.test(sql));
}

function verifyRollback(migration) {
  const database = new DatabaseSync(":memory:");
  const before = snapshotSchema(database);
  let rollbackPerformed = false;
  try {
    database.exec("BEGIN");
    for (const statement of splitStatements(migration.sql)) database.exec(`${statement};`);
    database.exec("INTENTIONAL REVIEW MIGRATION FAILURE PROBE;");
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
    rollbackPerformed = true;
  }
  const rollbackVerified = rollbackPerformed && before === snapshotSchema(database);
  database.close();
  return { tag: migration.tag, rollbackPerformed, rollbackVerified };
}

export function runPlatformTextReviewMigrationIsolatedRehearsal({ migrations = [] } = {}) {
  if (!validMigrations(migrations)) {
    return safeResult({ blockers: ["platform_text_review_migration_rehearsal_input_invalid"] });
  }

  const database = new DatabaseSync(":memory:");
  const appliedTags = [];
  try {
    for (const migration of migrations) {
      database.exec("BEGIN");
      try {
        for (const statement of splitStatements(migration.sql)) database.exec(`${statement};`);
        database.exec("COMMIT");
        appliedTags.push(migration.tag);
      } catch {
        database.exec("ROLLBACK");
        return safeResult({
          status: "platform_text_review_migration_isolated_rehearsal_failed",
          blockers: ["platform_text_review_migration_success_path_failed"],
          appliedTags,
          ephemeralDatabaseWrites: true,
        });
      }
    }

    const objects = database.prepare("SELECT name, type FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const schemaVerified = objects.length === EXPECTED_OBJECTS.length
      && EXPECTED_OBJECTS.every((expected) => objects.some((object) => object.name === expected.name && object.type === expected.type));
    const rollbackScenarios = migrations.map(verifyRollback);
    const rollbackVerifiedCount = rollbackScenarios.filter(({ rollbackVerified }) => rollbackVerified).length;
    const successPathVerified = schemaVerified && appliedTags.length === EXPECTED_TAGS.length;
    const failurePathVerified = rollbackVerifiedCount === rollbackScenarios.length;

    return safeResult({
      status: successPathVerified && failurePathVerified
        ? "platform_text_review_migration_isolated_rehearsal_verified"
        : "platform_text_review_migration_isolated_rehearsal_failed",
      blockers: [
        ...(!successPathVerified ? ["platform_text_review_migration_schema_rehearsal_failed"] : []),
        ...(!failurePathVerified ? ["platform_text_review_migration_rollback_rehearsal_failed"] : []),
      ],
      appliedTags,
      tableCount: objects.filter(({ type }) => type === "table").length,
      indexCount: objects.filter(({ type }) => type === "index").length,
      schemaVerified,
      successPathVerified,
      rollbackScenarios,
      rollbackScenarioCount: rollbackScenarios.length,
      rollbackVerifiedCount,
      failurePathVerified,
      intentionalFailureProbes: rollbackScenarios.length,
      ephemeralDatabaseWrites: true,
    });
  } finally {
    database.close();
  }
}
