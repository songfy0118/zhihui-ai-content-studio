import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fingerprintTopicWeightRankingLiveReadExecutionContract,
} from "../bridge/topic-weight-ranking-live-read-authorization-gate.mjs";
import {
  preflightTopicWeightRankingLiveReadExecution,
} from "../bridge/topic-weight-ranking-live-read-execution-preflight.mjs";

const AUTHORIZED_AT = "2026-08-23T03:00:00.000Z";
const EXPIRES_AT = "2026-08-23T03:15:00.000Z";
const CHECKED_AT = "2026-08-23T03:05:00.000Z";

function query(step, statement, params = [], inspectsDataRows = false) {
  return { step, statement, params, inspectsDataRows };
}

function authorization() {
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
      query("inspect_expected_schema_objects", "SELECT name, type FROM sqlite_schema", []),
      query("inspect_columns_items", "PRAGMA table_info(`account_topic_weight_update_items`)", []),
      query("inspect_columns_receipts", "PRAGMA table_info(`account_topic_weight_update_receipts`)", []),
      query("inspect_columns_values", "PRAGMA table_info(`account_topic_weight_values`)", []),
      query(
        "read_receipt_backed_weight_projection",
        "SELECT v.profile_id FROM account_topic_weight_values v WHERE v.profile_id = ?",
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

function preflight(value = authorization(), overrides = {}) {
  return preflightTopicWeightRankingLiveReadExecution({
    authorization: value,
    preflightRequested: true,
    checkedAt: CHECKED_AT,
    observedExecutionCount: 0,
    ...overrides,
  });
}

test("preflights one authorized read deterministically inside the time window", () => {
  const value = authorization();
  const first = preflight(value);
  const repeat = preflight(structuredClone(value));

  assert.equal(first.status, "topic_weight_ranking_live_read_execution_preflight_ready");
  assert.equal(first.authorizationWindowValid, true);
  assert.equal(first.eligibleForSingleReadAdapterHandoff, true);
  assert.equal(first.readyForSingleLiveReadInvocation, false);
  assert.equal(first.authorizedQueryCount, 5);
  assert.equal(first.remainingExecutionCount, 1);
  assert.equal(first.millisecondsUntilExpiry, 10 * 60_000);
  assert.deepEqual(first, repeat);
});

test("blocks before the authorization window and at or after expiry", () => {
  const before = preflight(authorization(), { checkedAt: "2026-08-23T02:59:59.999Z" });
  const atExpiry = preflight(authorization(), { checkedAt: EXPIRES_AT });
  const after = preflight(authorization(), { checkedAt: "2026-08-23T03:15:00.001Z" });

  assert.ok(before.blockers.includes("topic_weight_ranking_live_read_authorization_not_yet_valid"));
  assert.ok(atExpiry.blockers.includes("topic_weight_ranking_live_read_authorization_expired"));
  assert.ok(after.blockers.includes("topic_weight_ranking_live_read_authorization_expired"));
  assert.ok([before, atExpiry, after].every(({ readyForSingleLiveReadInvocation }) => !readyForSingleLiveReadInvocation));
});

test("blocks replay, invalid counts, missing intent and invalid check time", () => {
  const replay = preflight(authorization(), { observedExecutionCount: 1 });
  const invalidCount = preflight(authorization(), { observedExecutionCount: -1 });
  const missing = preflight(authorization(), { preflightRequested: false });
  const badTime = preflight(authorization(), { checkedAt: "soon" });

  assert.ok(replay.blockers.includes("topic_weight_ranking_live_read_authorization_already_consumed"));
  assert.ok(invalidCount.blockers.includes("topic_weight_ranking_live_read_execution_count_invalid"));
  assert.ok(missing.blockers.includes("topic_weight_ranking_live_read_execution_preflight_not_requested"));
  assert.ok(badTime.blockers.includes("topic_weight_ranking_live_read_execution_preflight_timestamp_invalid"));
});

test("rejects tampered contracts and changed validity windows", () => {
  const changedSql = authorization();
  changedSql.executionContract.queryWhitelist[0].statement = "DELETE FROM account_topic_weight_values";
  changedSql.executionContract.contractFingerprint =
    fingerprintTopicWeightRankingLiveReadExecutionContract(changedSql.executionContract);

  const changedWindow = authorization();
  changedWindow.authorizationExpiresAt = "2026-08-23T03:16:00.000Z";
  changedWindow.executionContract.authorizationExpiresAt = changedWindow.authorizationExpiresAt;
  changedWindow.executionContract.contractFingerprint =
    fingerprintTopicWeightRankingLiveReadExecutionContract(changedWindow.executionContract);

  for (const result of [preflight(changedSql), preflight(changedWindow)]) {
    assert.ok(result.blockers.includes("topic_weight_ranking_live_read_authorization_invalid_or_tampered"));
    assert.equal(result.remainingExecutionCount, 0);
  }
});

test("preflight does not consume authorization or execute any query", () => {
  const result = preflight();

  assert.equal(result.authorizationConsumed, false);
  assert.equal(result.authorizationPersisted, false);
  assert.equal(result.liveReadAdapterImplemented, false);
  assert.equal(result.readyForSingleLiveReadInvocation, false);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.queryExecutionCount, 0);
  assert.equal(result.inspectedDataRows, false);
  assert.equal(result.resultPersistenceAllowed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("preflight remains disconnected from D1 bindings, routes and credentials", async () => {
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-live-read-execution-preflight.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /process\.env|\.prepare\s*\(|\bfetch\s*\(|writeFile|appendFile|mkdir|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-live-read-execution-preflight")));
});
