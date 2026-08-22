import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";
import { assessTopicWeightRankingImpactReview } from "../bridge/topic-weight-ranking-impact-review-gate.mjs";
import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "../bridge/topic-weight-ranking-activation-authorization-preview.mjs";
import { buildTopicWeightRankingLiveReadPlan } from "../bridge/topic-weight-ranking-live-read-plan.mjs";
import {
  executeTopicWeightRankingIsolatedRead,
  TOPIC_WEIGHT_RANKING_ISOLATED_READ_CONFIRMATION,
} from "../bridge/topic-weight-ranking-isolated-read-adapter.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS,
} from "../db/account-topic-weight-storage-inspector.mjs";

function cluster(id, title, category) {
  return {
    id,
    title,
    category,
    sourceCount: 2,
    itemCount: 2,
    sourceIds: [`${id}-source-a`, `${id}-source-b`],
    firstSeenAt: "2026-08-21T10:00:00.000Z",
    lastSeenAt: "2026-08-21T12:00:00.000Z",
    meanSimilarity: 0.85,
    eligibleForHotspotScoring: true,
    evidence: [
      { id: `${id}-a`, title: `${title} official report`, sourceId: `${id}-source-a` },
      { id: `${id}-b`, title: `${title} independent report`, sourceId: `${id}-source-b` },
    ],
  };
}

function readyPlanInput() {
  const authorizationPreviewFingerprint = "a".repeat(64);
  const impactPreview = buildTopicWeightRankingImpactPreview({
    clustering: {
      clusters: [
        cluster("technology-cluster", "Cloud software developer platform", "technology"),
        cluster("finance-cluster", "Federal Reserve inflation outlook", "macro_finance"),
      ],
    },
    weightProjection: {
      status: "account_topic_weight_projection_ready",
      blockers: [],
      profileId: "zhihui-ai-tech-finance-v1",
      weights: [{
        profileId: "zhihui-ai-tech-finance-v1",
        scope: "category",
        id: "technology",
        weight: 1,
        previousWeight: 0.95,
        delta: 0.05,
        sourceUniqueIdeaCount: 3,
        sourceMeanSignal: 0.8,
        sourceReviewFingerprint: "c".repeat(64),
        authorizationPreviewFingerprint,
        updateReceiptId: `atwu_${authorizationPreviewFingerprint}`,
        updatedAt: "2026-08-22T14:30:00.000Z",
        integrityStatus: "complete_active_update_receipt_read_only",
      }],
      weightCount: 1,
      complete: true,
      inspectedDataRows: true,
      eligibleForRankingWeightInput: true,
      rankingWeightsApplied: false,
      learningWeightsUpdated: false,
      databaseWrites: false,
      configurationWrites: false,
      filesystemMutations: false,
      externalCalls: false,
      publishTriggered: false,
      businessResult: false,
    },
    now: "2026-08-21T13:00:00.000Z",
  });
  const reviewConfirmation = assessTopicWeightRankingImpactReview({
    preview: impactPreview,
    reviewRequested: true,
    confirmation: `REVIEW TOPIC WEIGHT RANKING IMPACT ${impactPreview.rankingImpactPreviewFingerprint}`,
    confirmedRankingImpactPreviewFingerprint: impactPreview.rankingImpactPreviewFingerprint,
    candidateReviews: impactPreview.candidates.map((candidate) => ({
      candidateId: candidate.id,
      title: candidate.title,
      baseRank: candidate.baseRank,
      previewRank: candidate.previewRank,
      accountFitDelta: candidate.accountFitDelta,
      relativePriorityDelta: candidate.relativePriorityDelta,
      reviewNote: "已人工核对候选身份、分数差值和名次变化",
      checks: {
        candidateIdentityAndOrderReviewed: true,
        noPredictionOrAutomaticActivationAcknowledged: true,
        scoreAndRankDeltaReviewed: true,
        trendEvidenceUnchangedAcknowledged: true,
      },
    })),
    overallDecision: "accept_ranking_impact_for_future_authorization",
    overallReviewNote: "排序变化符合账号方向，可进入后续独立启用授权评估",
  });
  const authorizationPreview = buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation);
  const requestedWeights = [
    { scope: "category", id: "technology" },
    { scope: "topic", id: "technology" },
  ];
  const plan = buildTopicWeightRankingLiveReadPlan({
    authorizationPreview,
    reviewConfirmation,
    requestedWeights,
  });
  return { authorizationPreview, reviewConfirmation, requestedWeights, plan };
}

function projectionRows() {
  const authorizationPreviewFingerprint = "a".repeat(64);
  return ["category", "topic"].map((scope) => ({
    profile_id: "zhihui-ai-tech-finance-v1",
    scope,
    weight_key: "technology",
    weight: 1,
    source_update_receipt_id: `atwu_${authorizationPreviewFingerprint}`,
    updated_at: "2026-08-22T14:30:00.000Z",
    source_review_fingerprint: "c".repeat(64),
    authorization_preview_fingerprint: authorizationPreviewFingerprint,
    idempotency_key: `account-topic-weight-update:${authorizationPreviewFingerprint}`,
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
  const executeRead = async (query) => {
    calls.push(query);
    if (query.step === failStep) throw new Error("injected_read_failure");
    if (query.step === "inspect_expected_schema_objects") {
      const objects = partialSchema
        ? ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.slice(1)
        : ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS;
      return { results: objects.map((object) => {
        const [type, name] = object.split(":");
        return { type, name };
      }) };
    }
    if (query.step.startsWith("inspect_columns_")) {
      const table = query.step.slice("inspect_columns_".length);
      return { results: ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS[table].map((name) => ({ name })) };
    }
    return { results: projectionRows() };
  };
  return { calls, executeRead };
}

function readyExecution() {
  const input = readyPlanInput();
  return {
    ...input,
    executionMode: "isolated_simulation",
    executeRequested: true,
    confirmation: `${TOPIC_WEIGHT_RANKING_ISOLATED_READ_CONFIRMATION} ${input.plan.liveReadPlanFingerprint}`,
    authorizedPlanFingerprint: input.plan.liveReadPlanFingerprint,
  };
}

test("executes exactly five whitelisted reads through an isolated simulator", async () => {
  const { calls, executeRead } = simulator();
  const result = await executeTopicWeightRankingIsolatedRead(readyExecution(), { executeRead });

  assert.equal(result.status, "topic_weight_ranking_isolated_read_complete");
  assert.equal(result.storageStatus, "verified");
  assert.equal(result.weightCount, 2);
  assert.equal(result.queryAttemptCount, 5);
  assert.equal(result.queryCompletionCount, 5);
  assert.equal(calls.length, 5);
  assert.deepEqual(result.weights.map(({ scope, id }) => ({ scope, id })), [
    { scope: "category", id: "technology" },
    { scope: "topic", id: "technology" },
  ]);
  assert.ok(calls.every(({ statement }) => /^\s*(?:SELECT|PRAGMA)\b/i.test(statement)));
});

test("blocks tampered plans and every non-isolated environment before injected calls", async () => {
  const tampered = readyExecution();
  tampered.plan.queries[0].statement = "SELECT 1";
  const live = readyExecution();
  live.executionMode = "live_d1";
  const first = simulator();
  const second = simulator();

  const tamperedResult = await executeTopicWeightRankingIsolatedRead(tampered, first);
  const liveResult = await executeTopicWeightRankingIsolatedRead(live, second);
  assert.ok(tamperedResult.blockers.includes("topic_weight_ranking_live_read_plan_invalid_or_tampered"));
  assert.ok(liveResult.blockers.includes("topic_weight_ranking_live_environment_not_authorized"));
  assert.equal(first.calls.length, 0);
  assert.equal(second.calls.length, 0);
});

test("fails closed on partial storage before reading weight rows", async () => {
  const { calls, executeRead } = simulator({ partialSchema: true });
  const result = await executeTopicWeightRankingIsolatedRead(readyExecution(), { executeRead });

  assert.equal(result.status, "topic_weight_ranking_isolated_read_failed_closed");
  assert.deepEqual(result.blockers, ["account_topic_weight_storage_partial"]);
  assert.equal(result.storageStatus, "partial");
  assert.equal(result.queryAttemptCount, 4);
  assert.equal(result.weightCount, 0);
  assert.ok(calls.every(({ step }) => step !== "read_receipt_backed_weight_projection"));
});

test("diagnoses an injected exception without returning partial data", async () => {
  const { calls, executeRead } = simulator({ failStep: "inspect_columns_account_topic_weight_values" });
  const result = await executeTopicWeightRankingIsolatedRead(readyExecution(), { executeRead });

  assert.equal(result.status, "topic_weight_ranking_isolated_read_failed_closed");
  assert.deepEqual(result.blockers, ["isolated_storage_inspection_failed"]);
  assert.equal(result.weightCount, 0);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(calls.length, 4);
});

test("adapter has no live binding, route, credential, write or publish path", async () => {
  const result = await executeTopicWeightRankingIsolatedRead(readyExecution(), simulator());
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-isolated-read-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.liveExecutionImplemented, false);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.eligibleForRankingWeightInput, false);
  assert.equal(result.rankingWeightsApplied, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.permissionExpansionRequested, false);
  assert.equal(result.credentialsRequested, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /process\.env|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-isolated-read-adapter")));
});
