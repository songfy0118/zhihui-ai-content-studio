import { DatabaseSync } from "node:sqlite";
import { inspectMigrationChain } from "./migration-chain-inspector.mjs";

function splitStatements(sql) {
  return typeof sql === "string"
    ? sql.replaceAll("--> statement-breakpoint", "").split(";").map((statement) => statement.trim()).filter(Boolean)
    : [];
}

function snapshotSchema(database) {
  return JSON.stringify(database.prepare("SELECT name, type, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all());
}

function safety(fields) {
  return {
    mode: "isolated_in_memory_sqlite",
    ...fields,
    ephemeralDatabaseWrites: true,
    liveDatabaseWrites: false,
    liveApplyPerformed: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function verifyMigrationChainInMemory({ journalEntries = [], migrations = [] } = {}) {
  const tags = journalEntries.map(({ tag }) => tag).filter((tag) => typeof tag === "string");
  const migrationMap = new Map(migrations.map(({ tag, sql }) => [tag, sql]));
  const database = new DatabaseSync(":memory:");
  const appliedTags = [];

  try {
    for (const tag of tags) {
      const sql = migrationMap.get(tag);
      if (typeof sql !== "string") {
        return safety({ verified: false, sourceTags: tags, appliedTags, failedTag: tag, failedStatementIndex: null, failureCode: "migration_file_missing", rollbackPerformed: false, rollbackVerified: false });
      }
      const statements = splitStatements(sql);
      const before = snapshotSchema(database);
      database.exec("BEGIN");
      for (let index = 0; index < statements.length; index += 1) {
        try {
          database.exec(`${statements[index]};`);
        } catch (error) {
          database.exec("ROLLBACK");
          return safety({
            verified: false,
            sourceTags: tags,
            appliedTags,
            failedTag: tag,
            failedStatementIndex: index,
            failureCode: typeof error?.code === "string" ? error.code : "sqlite_statement_failed",
            rollbackPerformed: true,
            rollbackVerified: before === snapshotSchema(database),
          });
        }
      }
      database.exec("COMMIT");
      appliedTags.push(tag);
    }

    const d1Adapter = { prepare: (sql) => ({ all: async () => ({ results: database.prepare(sql).all() }) }) };
    const inspection = await inspectMigrationChain(d1Adapter);
    return safety({
      verified: inspection.current && appliedTags.length === tags.length,
      sourceTags: tags,
      appliedTags,
      completedSteps: inspection.completedSteps,
      totalSteps: inspection.totalSteps,
      firstPending: inspection.firstPending,
      schemaStatus: inspection.status,
      blockers: inspection.blockers,
      failedTag: null,
      failedStatementIndex: null,
      failureCode: null,
      rollbackPerformed: false,
      rollbackVerified: null,
    });
  } finally {
    database.close();
  }
}
