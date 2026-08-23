import { createHash } from "node:crypto";

import { readAccountTopicWeightProjection } from "../db/account-topic-weight-reader.mjs";
import { inspectAccountTopicWeightStorage } from "../db/account-topic-weight-storage-inspector.mjs";
import { buildTopicWeightRankingLiveReadPlan } from "./topic-weight-ranking-live-read-plan.mjs";

const HASH = /^[a-f0-9]{64}$/;

export const TOPIC_WEIGHT_RANKING_ISOLATED_READ_CONFIRMATION =
  "SIMULATE TOPIC WEIGHT RANKING READ";

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_isolated_read_blocked",
    blockers: [],
    diagnostics: [],
    profileId: null,
    sourceLiveReadPlanFingerprint: null,
    isolatedReadResultFingerprint: null,
    storageStatus: null,
    storageVerified: false,
    weights: [],
    weightCount: 0,
    queryAttemptCount: 0,
    queryCompletionCount: 0,
    executionMode: "isolated_simulation",
    requestedBinding: "DB",
    injectedExecutorRequired: true,
    injectedExecutorUsed: false,
    simulatedReadPerformed: false,
    liveExecutionImplemented: false,
    liveReadPerformed: false,
    inspectedDataRows: false,
    eligibleForRankingWeightInput: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function fingerprintPayload(result) {
  return {
    profileId: result.profileId,
    sourceLiveReadPlanFingerprint: result.sourceLiveReadPlanFingerprint,
    storageStatus: result.storageStatus,
    storageVerified: result.storageVerified,
    weights: result.weights,
    weightCount: result.weightCount,
    queryAttemptCount: result.queryAttemptCount,
    queryCompletionCount: result.queryCompletionCount,
    executionMode: result.executionMode,
    simulatedReadPerformed: result.simulatedReadPerformed,
    liveReadPerformed: result.liveReadPerformed,
  };
}

export function fingerprintTopicWeightRankingIsolatedReadResult(result) {
  return createHash("sha256").update(JSON.stringify(fingerprintPayload(result))).digest("hex");
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildInjectedTopicWeightReadD1(queryWhitelist, executeRead, attempts, completions) {
  const queries = new Map(queryWhitelist.map((query) => [query.statement, query]));
  const usedSteps = new Set();

  async function run(statement, params) {
    const query = queries.get(statement);
    if (!query || usedSteps.has(query.step) || !exactJson(params, query.params)) {
      throw new Error("isolated_read_query_not_whitelisted");
    }
    usedSteps.add(query.step);
    attempts.push(query.step);
    const result = await executeRead(Object.freeze({
      step: query.step,
      statement: query.statement,
      params: Object.freeze([...query.params]),
    }));
    if (!result || !Array.isArray(result.results)) {
      throw new Error("isolated_read_result_invalid");
    }
    completions.push(query.step);
    return result;
  }

  return {
    prepare(statement) {
      return {
        bind(...params) {
          return { all: () => run(statement, params) };
        },
        all() {
          return run(statement, []);
        },
      };
    },
  };
}

function assessGate(input, executeRead) {
  const blockers = [];
  const rebuiltPlan = buildTopicWeightRankingLiveReadPlan({
    authorizationPreview: input.authorizationPreview,
    reviewConfirmation: input.reviewConfirmation,
    requestedWeights: input.requestedWeights,
    profile: input.profile,
  });
  if (
    input.plan?.status !== "topic_weight_ranking_live_read_plan_ready"
    || !HASH.test(input.plan?.liveReadPlanFingerprint ?? "")
    || !exactJson(input.plan, rebuiltPlan)
  ) blockers.push("topic_weight_ranking_live_read_plan_invalid_or_tampered");
  if (input.executionMode !== "isolated_simulation") {
    blockers.push("topic_weight_ranking_live_environment_not_authorized");
  }
  if (input.executeRequested !== true) blockers.push("isolated_read_execution_not_requested");
  if (
    input.confirmation
    !== `${TOPIC_WEIGHT_RANKING_ISOLATED_READ_CONFIRMATION} ${input.plan?.liveReadPlanFingerprint}`
  ) blockers.push("isolated_read_confirmation_invalid");
  if (input.authorizedPlanFingerprint !== input.plan?.liveReadPlanFingerprint) {
    blockers.push("isolated_read_plan_fingerprint_mismatch");
  }
  if (typeof executeRead !== "function") blockers.push("isolated_read_executor_required");
  return [...new Set(blockers)];
}

export async function executeTopicWeightRankingIsolatedRead(input = {}, { executeRead } = {}) {
  const blockers = assessGate(input, executeRead);
  if (blockers.length) return safeResult({ blockers });

  const attempts = [];
  const completions = [];
  const d1 = buildInjectedTopicWeightReadD1(input.plan.queries, executeRead, attempts, completions);
  let storage;
  try {
    storage = await inspectAccountTopicWeightStorage(d1);
  } catch {
    return safeResult({
      status: "topic_weight_ranking_isolated_read_failed_closed",
      blockers: ["isolated_storage_inspection_failed"],
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      injectedExecutorUsed: attempts.length > 0,
      simulatedReadPerformed: attempts.length > 0,
    });
  }
  if (!storage.verified) {
    return safeResult({
      status: "topic_weight_ranking_isolated_read_failed_closed",
      blockers: storage.blockers,
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      storageStatus: storage.status,
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      injectedExecutorUsed: true,
      simulatedReadPerformed: true,
    });
  }

  const projection = await readAccountTopicWeightProjection(d1, {
    profileId: input.plan.profileId,
    weights: input.plan.requestedWeights,
  });
  if (
    projection.status !== "account_topic_weight_projection_ready"
    || attempts.length !== input.plan.queryCount
    || completions.length !== input.plan.queryCount
  ) {
    return safeResult({
      status: "topic_weight_ranking_isolated_read_failed_closed",
      blockers: projection.blockers.length
        ? projection.blockers
        : ["isolated_read_query_set_incomplete"],
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      profileId: input.plan.profileId,
      sourceLiveReadPlanFingerprint: input.plan.liveReadPlanFingerprint,
      storageStatus: storage.status,
      storageVerified: true,
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      injectedExecutorUsed: true,
      simulatedReadPerformed: true,
      inspectedDataRows: projection.inspectedDataRows,
    });
  }

  const completed = safeResult({
    status: "topic_weight_ranking_isolated_read_complete",
    profileId: input.plan.profileId,
    sourceLiveReadPlanFingerprint: input.plan.liveReadPlanFingerprint,
    storageStatus: storage.status,
    storageVerified: true,
    weights: projection.weights,
    weightCount: projection.weightCount,
    queryAttemptCount: attempts.length,
    queryCompletionCount: completions.length,
    diagnostics: attempts.map((step) => ({ step, completed: true })),
    injectedExecutorUsed: true,
    simulatedReadPerformed: true,
    inspectedDataRows: true,
  });
  return {
    ...completed,
    isolatedReadResultFingerprint: fingerprintTopicWeightRankingIsolatedReadResult(completed),
  };
}
