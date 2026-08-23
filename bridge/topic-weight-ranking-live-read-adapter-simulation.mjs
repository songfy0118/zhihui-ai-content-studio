import { createHash } from "node:crypto";

import { readAccountTopicWeightProjection } from "../db/account-topic-weight-reader.mjs";
import { inspectAccountTopicWeightStorage } from "../db/account-topic-weight-storage-inspector.mjs";
import {
  buildInjectedTopicWeightReadD1,
} from "./topic-weight-ranking-isolated-read-adapter.mjs";
import {
  preflightTopicWeightRankingLiveReadExecution,
} from "./topic-weight-ranking-live-read-execution-preflight.mjs";

export const TOPIC_WEIGHT_RANKING_AUTHORIZED_READ_SIMULATION_CONFIRMATION =
  "SIMULATE AUTHORIZED TOPIC WEIGHT READ";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_live_read_adapter_simulation_blocked",
    blockers: [],
    diagnostics: [],
    evidenceKind: "injected_adapter_simulation_only",
    profileId: null,
    sourceExecutionContractFingerprint: null,
    adapterSimulationResultFingerprint: null,
    storageStatus: null,
    storageVerified: false,
    weights: [],
    weightCount: 0,
    queryAttemptCount: 0,
    queryCompletionCount: 0,
    preflightRechecked: false,
    injectedExecutorRequired: true,
    injectedExecutorUsed: false,
    simulatedReadPerformed: false,
    authorizationConsumed: false,
    authorizationPersisted: false,
    liveReadAdapterImplemented: false,
    liveReadPerformed: false,
    liveD1Queried: false,
    inspectedDataRows: false,
    resultPersistenceAllowed: false,
    eligibleForRankingWeightInput: false,
    eligibleForRankingActivation: false,
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
    ...fields,
  };
}

function fingerprintPayload(result) {
  return {
    evidenceKind: result.evidenceKind,
    profileId: result.profileId,
    sourceExecutionContractFingerprint: result.sourceExecutionContractFingerprint,
    storageStatus: result.storageStatus,
    storageVerified: result.storageVerified,
    weights: result.weights,
    weightCount: result.weightCount,
    queryAttemptCount: result.queryAttemptCount,
    queryCompletionCount: result.queryCompletionCount,
    simulatedReadPerformed: result.simulatedReadPerformed,
    liveD1Queried: result.liveD1Queried,
  };
}

export function fingerprintTopicWeightRankingLiveReadAdapterSimulation(result) {
  return hash(fingerprintPayload(result));
}

function assessGate(input, executeRead) {
  const blockers = [];
  const rebuiltPreflight = preflightTopicWeightRankingLiveReadExecution({
    authorization: input.authorization,
    preflightRequested: true,
    checkedAt: input.preflight?.checkedAt,
    observedExecutionCount: 0,
  });
  if (
    input.preflight?.status !== "topic_weight_ranking_live_read_execution_preflight_ready"
    || !exactJson(input.preflight, rebuiltPreflight)
    || input.preflight.eligibleForSingleReadAdapterHandoff !== true
    || input.preflight.readyForSingleLiveReadInvocation !== false
  ) blockers.push("topic_weight_ranking_live_read_execution_preflight_invalid_or_tampered");
  if (input.executionMode !== "injected_adapter_simulation_only") {
    blockers.push("topic_weight_ranking_live_environment_not_authorized");
  }
  if (input.executeRequested !== true) blockers.push("authorized_read_adapter_simulation_not_requested");
  if (
    input.confirmation
    !== `${TOPIC_WEIGHT_RANKING_AUTHORIZED_READ_SIMULATION_CONFIRMATION} ${input.authorization?.executionContract?.contractFingerprint}`
  ) blockers.push("authorized_read_adapter_simulation_confirmation_invalid");
  if (
    input.authorizedExecutionContractFingerprint
    !== input.authorization?.executionContract?.contractFingerprint
  ) blockers.push("authorized_read_execution_contract_fingerprint_mismatch");
  if (typeof executeRead !== "function") blockers.push("authorized_read_injected_executor_required");
  return [...new Set(blockers)];
}

function failedResult(fields = {}) {
  return safeResult({
    status: "topic_weight_ranking_live_read_adapter_simulation_failed_closed",
    ...fields,
  });
}

export async function simulateTopicWeightRankingAuthorizedRead(input = {}, { executeRead } = {}) {
  const blockers = assessGate(input, executeRead);
  if (blockers.length) return safeResult({ blockers });

  const contract = input.authorization.executionContract;
  const attempts = [];
  const completions = [];
  const d1 = buildInjectedTopicWeightReadD1(
    contract.queryWhitelist,
    executeRead,
    attempts,
    completions,
  );
  let storage;
  try {
    storage = await inspectAccountTopicWeightStorage(d1);
  } catch {
    return failedResult({
      blockers: ["authorized_read_simulated_storage_inspection_failed"],
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      sourceExecutionContractFingerprint: contract.contractFingerprint,
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      preflightRechecked: true,
      injectedExecutorUsed: attempts.length > 0,
      simulatedReadPerformed: attempts.length > 0,
    });
  }
  if (!storage.verified) {
    return failedResult({
      blockers: storage.blockers,
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      sourceExecutionContractFingerprint: contract.contractFingerprint,
      storageStatus: storage.status,
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      preflightRechecked: true,
      injectedExecutorUsed: true,
      simulatedReadPerformed: true,
    });
  }

  const projection = await readAccountTopicWeightProjection(d1, {
    profileId: contract.profileId,
    weights: contract.requestedWeights,
  });
  if (
    projection.status !== "account_topic_weight_projection_ready"
    || attempts.length !== contract.queryWhitelist.length
    || completions.length !== contract.queryWhitelist.length
  ) {
    return failedResult({
      blockers: projection.blockers.length
        ? projection.blockers
        : ["authorized_read_adapter_simulation_query_set_incomplete"],
      diagnostics: attempts.map((step) => ({ step, completed: completions.includes(step) })),
      profileId: contract.profileId,
      sourceExecutionContractFingerprint: contract.contractFingerprint,
      storageStatus: storage.status,
      storageVerified: true,
      queryAttemptCount: attempts.length,
      queryCompletionCount: completions.length,
      preflightRechecked: true,
      injectedExecutorUsed: true,
      simulatedReadPerformed: true,
      inspectedDataRows: projection.inspectedDataRows,
    });
  }

  const completed = safeResult({
    status: "topic_weight_ranking_live_read_adapter_simulation_complete",
    profileId: contract.profileId,
    sourceExecutionContractFingerprint: contract.contractFingerprint,
    storageStatus: storage.status,
    storageVerified: true,
    weights: projection.weights,
    weightCount: projection.weightCount,
    queryAttemptCount: attempts.length,
    queryCompletionCount: completions.length,
    diagnostics: attempts.map((step) => ({ step, completed: true })),
    preflightRechecked: true,
    injectedExecutorUsed: true,
    simulatedReadPerformed: true,
    inspectedDataRows: true,
  });
  return {
    ...completed,
    adapterSimulationResultFingerprint:
      fingerprintTopicWeightRankingLiveReadAdapterSimulation(completed),
  };
}
