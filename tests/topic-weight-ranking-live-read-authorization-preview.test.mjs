import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fingerprintTopicWeightRankingLiveReadPlan,
} from "../bridge/topic-weight-ranking-live-read-plan.mjs";
import {
  fingerprintTopicWeightRankingReadEvidenceReview,
} from "../bridge/topic-weight-ranking-read-evidence-review-gate.mjs";
import {
  buildTopicWeightRankingLiveReadAuthorizationPreview,
} from "../bridge/topic-weight-ranking-live-read-authorization-preview.mjs";

function query(step, statement, params = [], inspectsDataRows = false) {
  return { step, statement, params, inspectsDataRows };
}

function plan() {
  const value = {
    status: "topic_weight_ranking_live_read_plan_ready",
    blockers: [],
    profileId: "zhihui-ai-tech-finance-v1",
    sourceAuthorizationPreviewFingerprint: "a".repeat(64),
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
    requestedWeightCount: 2,
    queries: [
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
    queryCount: 5,
    requestedBinding: "DB",
    inspectionScope: "live_d1_read_only",
    readOnlyStatementsOnly: true,
    requiresExistingD1Binding: true,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    executionImplemented: false,
    liveReadPerformed: false,
    inspectedDataRows: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
  return {
    ...value,
    liveReadPlanFingerprint: fingerprintTopicWeightRankingLiveReadPlan(value),
  };
}

function reviewedWeight(scope) {
  return {
    profileId: "zhihui-ai-tech-finance-v1",
    scope,
    id: "technology",
    previousWeight: 0.95,
    weight: 1,
    delta: 0.05,
    sourceUniqueIdeaCount: 3,
    sourceMeanSignal: 0.8,
    sourceReviewFingerprint: "c".repeat(64),
    authorizationPreviewFingerprint: "a".repeat(64),
    updateReceiptId: `atwu_${"a".repeat(64)}`,
    updatedAt: "2026-08-22T14:30:00.000Z",
    integrityStatus: "complete_active_update_receipt_read_only",
    reviewDecision: "evidence_consistent",
    reviewNote: "已核对收据关联、权重差值和来源摘要",
    reviewStatus: "human_reviewed_isolated_evidence_not_activated",
  };
}

function acceptedReview(readPlan = plan()) {
  const value = {
    status: "topic_weight_ranking_read_evidence_review_recorded",
    blockers: [],
    evidenceKind: "isolated_simulation_only",
    profileId: "zhihui-ai-tech-finance-v1",
    sourceLiveReadPlanFingerprint: readPlan.liveReadPlanFingerprint,
    confirmedReadEvidencePreviewFingerprint: "d".repeat(64),
    reviewChecks: {
      profileAndPlanMatchReviewed: true,
      queryWhitelistCompletionReviewed: true,
      receiptLinkageReviewed: true,
      schemaEvidenceReviewed: true,
      simulationNotLiveAcknowledged: true,
    },
    reviewedWeights: [reviewedWeight("category"), reviewedWeight("topic")],
    reviewedWeightCount: 2,
    overallDecision: "accept_isolated_read_evidence_review",
    overallReviewNote: "隔离模拟证据结构完整，仅确认已人工核对，不代表 live D1 结果",
    humanReviewCompleted: true,
    isolatedEvidenceAccepted: true,
    liveD1EvidenceAvailable: false,
    eligibleForLiveD1AuthorizationRequest: false,
    liveD1ReadAuthorizationGranted: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    reviewPersisted: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    publishTriggered: false,
    businessResult: false,
  };
  return {
    ...value,
    readEvidenceReviewFingerprint: fingerprintTopicWeightRankingReadEvidenceReview(value),
  };
}

test("builds a deterministic one-time live read authorization preview", () => {
  const readPlan = plan();
  const input = { plan: readPlan, readEvidenceReview: acceptedReview(readPlan) };
  const first = buildTopicWeightRankingLiveReadAuthorizationPreview(input);
  const repeat = buildTopicWeightRankingLiveReadAuthorizationPreview(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_live_read_authorization_preview_ready");
  assert.equal(first.liveReadAuthorizationPreviewFingerprint, repeat.liveReadAuthorizationPreviewFingerprint);
  assert.equal(first.authorizationScope.queryCount, 5);
  assert.equal(first.authorizationScope.oneTimeExecution, true);
  assert.equal(first.authorizationValidityMinutes, 15);
  assert.equal(first.maximumExecutionCount, 1);
  assert.equal(first.requiredUserConfirmation, `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${first.liveReadAuthorizationPreviewFingerprint}`);
});

test("binds five read-only statements, exact params and no persistence", () => {
  const readPlan = plan();
  const preview = buildTopicWeightRankingLiveReadAuthorizationPreview({
    plan: readPlan,
    readEvidenceReview: acceptedReview(readPlan),
  });

  assert.deepEqual(preview.authorizationScope.queryWhitelist, readPlan.queries);
  assert.ok(preview.authorizationScope.queryWhitelist.every(({ statement }) => /^\s*(?:SELECT|PRAGMA)\b/i.test(statement)));
  assert.equal(preview.authorizationScope.targetBinding, "DB");
  assert.equal(preview.authorizationScope.accessMode, "read_only");
  assert.equal(preview.authorizationScope.resultPersistence, "none");
  assert.equal(preview.authorizationScope.rankingMutation, "forbidden");
  assert.equal(preview.zeroWriteGuarantees.databaseWritesForbidden, true);
  assert.equal(preview.zeroWriteGuarantees.configurationWritesForbidden, true);
});

test("blocks rejected or tampered reviews and mutated SQL", () => {
  const rejectedPlan = plan();
  const rejected = acceptedReview(rejectedPlan);
  rejected.overallDecision = "reject_isolated_read_evidence_review";
  rejected.isolatedEvidenceAccepted = false;
  rejected.readEvidenceReviewFingerprint = fingerprintTopicWeightRankingReadEvidenceReview(rejected);
  assert.ok(buildTopicWeightRankingLiveReadAuthorizationPreview({
    plan: rejectedPlan,
    readEvidenceReview: rejected,
  }).blockers.includes("accepted_isolated_read_evidence_review_invalid_or_tampered"));

  const tamperedPlan = plan();
  const review = acceptedReview(tamperedPlan);
  tamperedPlan.queries[0].statement = "DELETE FROM account_topic_weight_values";
  assert.ok(buildTopicWeightRankingLiveReadAuthorizationPreview({
    plan: tamperedPlan,
    readEvidenceReview: review,
  }).blockers.includes("topic_weight_ranking_live_read_plan_invalid_or_tampered"));
});

test("preview requests no credentials or permission expansion and grants nothing", () => {
  const readPlan = plan();
  const preview = buildTopicWeightRankingLiveReadAuthorizationPreview({
    plan: readPlan,
    readEvidenceReview: acceptedReview(readPlan),
  });

  assert.equal(preview.authorizationRequired, true);
  assert.equal(preview.authorizationGranted, false);
  assert.equal(preview.authorizationReceiptCreated, false);
  assert.equal(preview.existingBindingRequired, true);
  assert.equal(preview.credentialsRequested, false);
  assert.equal(preview.permissionExpansionRequested, false);
  assert.equal(preview.liveReadImplemented, false);
  assert.equal(preview.liveReadPerformed, false);
  assert.equal(preview.resultPersistenceAllowed, false);
  assert.equal(preview.eligibleForRankingActivation, false);
});

test("preview remains disconnected from D1, routes, ranking writes and publication", async () => {
  const readPlan = plan();
  const preview = buildTopicWeightRankingLiveReadAuthorizationPreview({
    plan: readPlan,
    readEvidenceReview: acceptedReview(readPlan),
  });
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-live-read-authorization-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(preview.rankingActivationAuthorizationGranted, false);
  assert.equal(preview.rankingWeightsApplied, false);
  assert.equal(preview.learningWeightsUpdated, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.configurationWrites, false);
  assert.equal(preview.filesystemMutations, false);
  assert.equal(preview.externalCalls, false);
  assert.equal(preview.publishTriggered, false);
  assert.equal(preview.businessResult, false);
  assert.doesNotMatch(source, /process\.env|\.prepare\s*\(|\bfetch\s*\(|writeFile|appendFile|mkdir|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-live-read-authorization-preview")));
});
