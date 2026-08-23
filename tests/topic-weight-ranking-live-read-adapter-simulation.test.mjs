import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fingerprintTopicWeightRankingLiveReadExecutionContract,
} from "../bridge/topic-weight-ranking-live-read-authorization-gate.mjs";
import {
  preflightTopicWeightRankingLiveReadExecution,
} from "../bridge/topic-weight-ranking-live-read-execution-preflight.mjs";
import {
  simulateTopicWeightRankingAuthorizedRead,
  TOPIC_WEIGHT_RANKING_AUTHORIZED_READ_SIMULATION_CONFIRMATION,
} from "../bridge/topic-weight-ranking-live-read-adapter-simulation.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS,
  ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL,
} from "../db/account-topic-weight-storage-inspector.mjs";
import { buildAccountTopicWeightReadSql } from "../db/account-topic-weight-reader.mjs";

const AUTHORIZED_AT = "2026-08-23T03:10:00.000Z";
const EXPIRES_AT = "2026-08-23T03:25:00.000Z";
const CHECKED_AT = "2026-08-23T03:15:00.000Z";

function query(step, statement, params = [], inspectsDataRows = false) {
  return { step, statement, params, inspectsDataRows };
}

function readyAuthorization() {
  const contractPayload = {
    profileId: "zhihui-ai-tech-finance-v1",
    sourceLiveReadPlanFingerprint: "a".repeat(64),
    sourceReadEvidenceReviewFingerprint: "b".repeat(64),
    authorizationPreviewFingerprint: "c".repeat(64),
    authorizationRecordedAt: AUTHORIZED_AT,
    authorizationExpiresAt: EXPIRES_AT,
    targetBinding: "DB",
    operation: "execute_exact_read_only_query_whitelist_once",
    queryWhitelist: [
      query("inspect_expected_schema_objects", ACCOUNT_TOPIC_WEIGHT_SCHEMA_SQL, []),
      query(
        "inspect_columns_account_topic_weight_update_items",
        "PRAGMA table_info(`account_topic_weight_update_items`)",
        [],
      ),
      query(
        "inspect_columns_account_topic_weight_update_receipts",
        "PRAGMA table_info(`account_topic_weight_update_receipts`)",
        [],
      ),
      query(
        "inspect_columns_account_topic_weight_values",
        "PRAGMA table_info(`account_topic_weight_values`)",
        [],
      ),
      query(
        "read_receipt_backed_weight_projection",
        buildAccountTopicWeightReadSql(2),
        ["zhihui-ai-tech-finance-v1", "category", "technology", "topic", "technology"],
        true,
      ),
    ],
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
    maximumExecutionCount: 1,
    constraints: {
      existingBindingOnly: true,
      credentialsAllowed: false,
      permissionExpansionAllowed: false,
      selectOrPragmaOnly: true,
      databaseWritesAllowed: false,
      configurationWritesAllowed: false,
      resultPersistenceAllowed: false,
      rankingChangesAllowed: false,
      platformActionsAllowed: false,
    },
  };
  return {
    status: "topic_weight_ranking_live_read_authorization_accepted",
    blockers: [],
    authorizationAccepted: true,
    authorizedPreviewFingerprint: contractPayload.authorizationPreviewFingerprint,
    authorizationRecordedAt: AUTHORIZED_AT,
    authorizationExpiresAt: EXPIRES_AT,
    executionContract: {
      ...contractPayload,
      contractFingerprint: fingerprintTopicWeightRankingLiveReadExecutionContract(contractPayload),
      status: "authorized_not_executed",
    },
    executionContractCreated: true,
    readAllowedByContract: true,
    liveD1ReadAuthorizationGranted: true,
    authorizationPersisted: false,
    liveReadImplemented: false,
    liveReadPerformed: false,
    queryExecutionCount: 0,
    inspectedDataRows: false,
    resultPersistenceAllowed: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    credentialsRequested: false,
    permissionExpansionRequested: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function readyExecution() {
  const authorization = readyAuthorization();
  const preflight = preflightTopicWeightRankingLiveReadExecution({
    authorization,
    preflightRequested: true,
    checkedAt: CHECKED_AT,
    observedExecutionCount: 0,
  });
  return {
    authorization,
    preflight,
    executionMode: "injected_adapter_simulation_only",
    executeRequested: true,
    confirmation:
      `${TOPIC_WEIGHT_RANKING_AUTHORIZED_READ_SIMULATION_CONFIRMATION} ${authorization.executionContract.contractFingerprint}`,
    authorizedExecutionContractFingerprint: authorization.executionContract.contractFingerprint,
  };
}

function projectionRows() {
  return ["category", "topic"].map((scope) => ({
    profile_id: "zhihui-ai-tech-finance-v1",
    scope,
    weight_key: "technology",
    weight: 1,
    source_update_receipt_id: `atwu_${"d".repeat(64)}`,
    updated_at: "2026-08-22T14:30:00.000Z",
    source_review_fingerprint: "e".repeat(64),
    authorization_preview_fingerprint: "d".repeat(64),
    idempotency_key: `account-topic-weight-update:${"d".repeat(64)}`,
    receipt_status: "active",
    receipt_created_at: "2026-08-22T14:30:00.000Z",
    previous_weight: 0.95,
    applied_weight: 1,
    delta: 0.05,
    source_unique_idea_count: 3,
    source_mean_signal: 0.8,
    item_created_at: "2026-08-22T14:30:00.000Z",
  }));
}

function simulator({ partialSchema = false, failStep = null } = {}) {
  const calls = [];
  const executeRead = async (readQuery) => {
    calls.push(readQuery);
    if (readQuery.step === failStep) throw new Error("injected_read_failure");
    if (readQuery.step === "inspect_expected_schema_objects") {
      const objects = partialSchema
        ? ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.slice(1)
        : ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS;
      return { results: objects.map((object) => {
        const [type, name] = object.split(":");
        return { type, name };
      }) };
    }
    if (readQuery.step.startsWith("inspect_columns_")) {
      const table = readQuery.step.slice("inspect_columns_".length);
      return { results: ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS[table].map((name) => ({ name })) };
    }
    return { results: projectionRows() };
  };
  return { calls, executeRead };
}

test("simulates exactly five contract-bound reads without claiming live evidence", async () => {
  const { calls, executeRead } = simulator();
  const result = await simulateTopicWeightRankingAuthorizedRead(readyExecution(), { executeRead });

  assert.equal(
    result.status,
    "topic_weight_ranking_live_read_adapter_simulation_complete",
    JSON.stringify(result),
  );
  assert.equal(result.evidenceKind, "injected_adapter_simulation_only");
  assert.equal(result.storageStatus, "verified");
  assert.equal(result.weightCount, 2);
  assert.equal(result.queryAttemptCount, 5);
  assert.equal(result.queryCompletionCount, 5);
  assert.equal(calls.length, 5);
  assert.equal(result.simulatedReadPerformed, true);
  assert.equal(result.liveD1Queried, false);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.eligibleForRankingWeightInput, false);
});

test("rejects live environments and tampered preflight before injected calls", async () => {
  const live = readyExecution();
  live.executionMode = "live_d1_read_only";
  const tampered = readyExecution();
  tampered.preflight.remainingExecutionCount = 0;
  const first = simulator();
  const second = simulator();

  const liveResult = await simulateTopicWeightRankingAuthorizedRead(live, first);
  const tamperedResult = await simulateTopicWeightRankingAuthorizedRead(tampered, second);
  assert.ok(liveResult.blockers.includes("topic_weight_ranking_live_environment_not_authorized"));
  assert.ok(tamperedResult.blockers.includes("topic_weight_ranking_live_read_execution_preflight_invalid_or_tampered"));
  assert.equal(first.calls.length, 0);
  assert.equal(second.calls.length, 0);
});

test("requires exact simulation intent, confirmation and contract fingerprint", async () => {
  const missing = readyExecution();
  missing.executeRequested = false;
  const wrong = readyExecution();
  wrong.confirmation = "SIMULATE SOMETHING ELSE";
  const stale = readyExecution();
  stale.authorizedExecutionContractFingerprint = "f".repeat(64);

  for (const input of [missing, wrong, stale]) {
    const injected = simulator();
    const result = await simulateTopicWeightRankingAuthorizedRead(input, injected);
    assert.equal(injected.calls.length, 0);
    assert.equal(result.simulatedReadPerformed, false);
  }
});

test("fails closed on partial storage before the data projection query", async () => {
  const { calls, executeRead } = simulator({ partialSchema: true });
  const result = await simulateTopicWeightRankingAuthorizedRead(readyExecution(), { executeRead });

  assert.equal(result.status, "topic_weight_ranking_live_read_adapter_simulation_failed_closed");
  assert.deepEqual(result.blockers, ["account_topic_weight_storage_partial"]);
  assert.equal(result.storageStatus, "partial");
  assert.equal(result.queryAttemptCount, 4);
  assert.equal(result.weightCount, 0);
  assert.ok(calls.every(({ step }) => step !== "read_receipt_backed_weight_projection"));
});

test("diagnoses an injected exception without returning partial data", async () => {
  const { calls, executeRead } = simulator({ failStep: "inspect_columns_account_topic_weight_values" });
  const result = await simulateTopicWeightRankingAuthorizedRead(readyExecution(), { executeRead });

  assert.equal(result.status, "topic_weight_ranking_live_read_adapter_simulation_failed_closed");
  assert.deepEqual(result.blockers, ["authorized_read_simulated_storage_inspection_failed"]);
  assert.equal(result.weightCount, 0);
  assert.equal(result.liveD1Queried, false);
  assert.equal(result.authorizationConsumed, false);
  assert.equal(calls.length, 4);
});

test("simulation adapter has no D1 binding, route, credential, write or publish path", async () => {
  const result = await simulateTopicWeightRankingAuthorizedRead(readyExecution(), simulator());
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-live-read-adapter-simulation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.authorizationConsumed, false);
  assert.equal(result.authorizationPersisted, false);
  assert.equal(result.liveReadAdapterImplemented, false);
  assert.equal(result.liveD1Queried, false);
  assert.equal(result.eligibleForRankingActivation, false);
  assert.equal(result.rankingWeightsApplied, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.credentialsRequested, false);
  assert.equal(result.permissionExpansionRequested, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /process\.env|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-live-read-adapter-simulation")));
});
