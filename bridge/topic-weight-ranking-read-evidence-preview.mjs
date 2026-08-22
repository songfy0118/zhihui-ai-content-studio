import { createHash } from "node:crypto";

import {
  fingerprintTopicWeightRankingIsolatedReadResult,
} from "./topic-weight-ranking-isolated-read-adapter.mjs";

const HASH = /^[a-f0-9]{64}$/;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_read_evidence_preview_blocked",
    blockers: [],
    evidenceKind: "isolated_simulation_only",
    profileId: null,
    sourceLiveReadPlanFingerprint: null,
    sourceIsolatedReadResultFingerprint: null,
    readEvidencePreviewFingerprint: null,
    schemaEvidence: null,
    queryEvidence: null,
    weightEvidence: [],
    reviewChecklist: [],
    requiredConfirmation: null,
    humanReviewCompleted: false,
    liveD1EvidenceAvailable: false,
    eligibleForRankingActivation: false,
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

function identity({ scope, id } = {}) {
  return `${scope}:${id}`;
}

function validBoundaries(result) {
  return result.executionMode === "isolated_simulation"
    && result.simulatedReadPerformed === true
    && result.liveExecutionImplemented === false
    && result.liveReadPerformed === false
    && result.storageVerified === true
    && result.inspectedDataRows === true
    && result.eligibleForRankingWeightInput === false
    && result.rankingWeightsApplied === false
    && result.learningWeightsUpdated === false
    && result.databaseWrites === false
    && result.configurationWrites === false
    && result.filesystemMutations === false
    && result.externalCalls === false
    && result.permissionExpansionRequested === false
    && result.credentialsRequested === false
    && result.publishTriggered === false
    && result.businessResult === false;
}

function validWeights(plan, result) {
  if (
    !Array.isArray(plan.requestedWeights)
    || !Array.isArray(result.weights)
    || result.weightCount !== plan.requestedWeights.length
    || result.weights.length !== plan.requestedWeights.length
  ) return false;
  return plan.requestedWeights.every((request, index) => {
    const weight = result.weights[index];
    return identity(request) === identity(weight)
      && weight.profileId === plan.profileId
      && weight.integrityStatus === "complete_active_update_receipt_read_only"
      && Number.isFinite(weight.weight)
      && Number.isFinite(weight.previousWeight)
      && Number.isFinite(weight.delta)
      && HASH.test(weight.sourceReviewFingerprint ?? "")
      && HASH.test(weight.authorizationPreviewFingerprint ?? "")
      && typeof weight.updateReceiptId === "string"
      && typeof weight.updatedAt === "string";
  });
}

export function buildTopicWeightRankingReadEvidencePreview({ plan, isolatedReadResult } = {}) {
  const blockers = [];
  if (
    plan?.status !== "topic_weight_ranking_live_read_plan_ready"
    || !HASH.test(plan?.liveReadPlanFingerprint ?? "")
    || !Number.isSafeInteger(plan?.queryCount)
    || plan.queryCount !== 5
  ) blockers.push("topic_weight_ranking_read_plan_invalid");
  if (
    isolatedReadResult?.status !== "topic_weight_ranking_isolated_read_complete"
    || !HASH.test(isolatedReadResult?.isolatedReadResultFingerprint ?? "")
    || isolatedReadResult?.isolatedReadResultFingerprint
      !== fingerprintTopicWeightRankingIsolatedReadResult(isolatedReadResult)
  ) blockers.push("isolated_read_result_invalid_or_tampered");
  if (
    isolatedReadResult?.profileId !== plan?.profileId
    || isolatedReadResult?.sourceLiveReadPlanFingerprint !== plan?.liveReadPlanFingerprint
  ) blockers.push("isolated_read_result_plan_mismatch");
  if (
    isolatedReadResult?.queryAttemptCount !== plan?.queryCount
    || isolatedReadResult?.queryCompletionCount !== plan?.queryCount
    || isolatedReadResult?.storageStatus !== "verified"
  ) blockers.push("isolated_read_evidence_incomplete");
  if (!validBoundaries(isolatedReadResult ?? {})) blockers.push("isolated_read_safety_boundary_invalid");
  if (!validWeights(plan ?? {}, isolatedReadResult ?? {})) blockers.push("isolated_read_weight_evidence_invalid");
  if (blockers.length) return safeResult({ blockers: [...new Set(blockers)] });

  const schemaEvidence = {
    storageStatus: isolatedReadResult.storageStatus,
    storageVerified: isolatedReadResult.storageVerified,
    source: "isolated_simulation",
  };
  const queryEvidence = {
    plannedQueryCount: plan.queryCount,
    attemptedQueryCount: isolatedReadResult.queryAttemptCount,
    completedQueryCount: isolatedReadResult.queryCompletionCount,
    whitelistComplete: true,
    liveD1Queried: false,
  };
  const weightEvidence = isolatedReadResult.weights.map((weight) => ({
    profileId: weight.profileId,
    scope: weight.scope,
    id: weight.id,
    previousWeight: weight.previousWeight,
    weight: weight.weight,
    delta: weight.delta,
    sourceUniqueIdeaCount: weight.sourceUniqueIdeaCount,
    sourceMeanSignal: weight.sourceMeanSignal,
    sourceReviewFingerprint: weight.sourceReviewFingerprint,
    authorizationPreviewFingerprint: weight.authorizationPreviewFingerprint,
    updateReceiptId: weight.updateReceiptId,
    updatedAt: weight.updatedAt,
    integrityStatus: weight.integrityStatus,
  }));
  const fingerprintPayload = {
    evidenceKind: "isolated_simulation_only",
    profileId: plan.profileId,
    sourceLiveReadPlanFingerprint: plan.liveReadPlanFingerprint,
    sourceIsolatedReadResultFingerprint: isolatedReadResult.isolatedReadResultFingerprint,
    schemaEvidence,
    queryEvidence,
    weightEvidence,
  };
  const readEvidencePreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "topic_weight_ranking_read_evidence_preview_ready",
    ...fingerprintPayload,
    readEvidencePreviewFingerprint,
    reviewChecklist: [
      { id: "profile_and_plan_match", required: true, label: "核对账号画像与只读计划指纹" },
      { id: "schema_verified", required: true, label: "核对三表和索引结构完整" },
      { id: "query_whitelist_complete", required: true, label: "核对五条白名单查询全部完成" },
      { id: "receipt_linkage_reviewed", required: true, label: "核对每个权重的收据、差值和来源" },
      { id: "simulation_not_live_acknowledged", required: true, label: "确认本证据仅来自隔离模拟，不是 live D1 结果" },
    ],
    requiredConfirmation: `REVIEW ISOLATED TOPIC WEIGHT EVIDENCE ${readEvidencePreviewFingerprint}`,
  });
}
