import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitStatements(sql) {
  return typeof sql === "string"
    ? sql.replaceAll("--> statement-breakpoint", "").split(";").map((statement) => statement.trim()).filter(Boolean)
    : [];
}

function statementType(statement) {
  return statement.split(/\s+/).slice(0, 3).join(" ").replaceAll(/[`()]/g, "").toUpperCase();
}

export function buildD1ChainExecutionManifest({ plan = {}, isolatedVerification = {}, migrations = [] } = {}) {
  const migrationMap = new Map(migrations.map(({ tag, sql }) => [tag, sql]));
  const tags = Array.isArray(plan.tags) ? plan.tags : [];
  const steps = tags.map((tag) => {
    const sql = migrationMap.get(tag) ?? "";
    const statements = splitStatements(sql);
    return { tag, statementCount: statements.length, statementTypes: statements.map(statementType), sha256: sha256(sql) };
  });
  const blockers = [
    ...(!plan.readyForAuthorizedApply ? ["live_plan_not_ready"] : []),
    ...(!isolatedVerification.verified ? ["isolated_verification_not_ready"] : []),
    ...(steps.some((step) => step.statementCount === 0) ? ["migration_statement_missing"] : []),
  ];
  const chainFingerprint = steps.length ? sha256(JSON.stringify(steps.map(({ tag, statementCount, sha256: digest }) => ({ tag, statementCount, sha256: digest })))) : null;
  return {
    mode: "authorization_preparation",
    targetBinding: "DB",
    readyForAuthorization: blockers.length === 0,
    blockers,
    steps,
    chainFingerprint,
    sqlBodiesReturned: false,
    executionAdapterConnected: false,
    executionCommandPrepared: false,
    authorizationRequired: true,
    applyPerformed: false,
    liveDatabaseWrites: false,
    ephemeralDatabaseWrites: isolatedVerification.ephemeralDatabaseWrites === true,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    businessResult: false,
  };
}
