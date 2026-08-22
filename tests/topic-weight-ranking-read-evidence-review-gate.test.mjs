import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessTopicWeightRankingReadEvidenceReview,
} from "../bridge/topic-weight-ranking-read-evidence-review-gate.mjs";
import {
  fingerprintTopicWeightRankingIsolatedReadResult,
} from "../bridge/topic-weight-ranking-isolated-read-adapter.mjs";
import {
  buildTopicWeightRankingReadEvidencePreview,
} from "../bridge/topic-weight-ranking-read-evidence-preview.mjs";

function plan() {
  return {
    status: "topic_weight_ranking_live_read_plan_ready",
    profileId: "zhihui-ai-tech-finance-v1",
    liveReadPlanFingerprint: "b".repeat(64),
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
    queryCount: 5,
  };
}

function weight(scope) {
  return {
    profileId: "zhihui-ai-tech-finance-v1",
    scope,
    id: "technology",
    weight: 1,
    previousWeight: 0.95,
    delta: 0.05,
    sourceUniqueIdeaCount: 3,
    sourceMeanSignal: 0.8,
    sourceReviewFingerprint: "c".repeat(64),
    authorizationPreviewFingerprint: "a".repeat(64),
    updateReceiptId: `atwu_${"a".repeat(64)}`,
    updatedAt: "2026-08-22T14:30:00.000Z",
    integrityStatus: "complete_active_update_receipt_read_only",
  };
}

function isolatedResult() {
  const result = {
    status: "topic_weight_ranking_isolated_read_complete",
    profileId: "zhihui-ai-tech-finance-v1",
    sourceLiveReadPlanFingerprint: "b".repeat(64),
    storageStatus: "verified",
    storageVerified: true,
    weights: [weight("category"), weight("topic")],
    weightCount: 2,
    queryAttemptCount: 5,
    queryCompletionCount: 5,
    executionMode: "isolated_simulation",
    simulatedReadPerformed: true,
    liveExecutionImplemented: false,
    liveReadPerformed: false,
    inspectedDataRows: true,
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
  };
  return {
    ...result,
    isolatedReadResultFingerprint: fingerprintTopicWeightRankingIsolatedReadResult(result),
  };
}

function preview() {
  return buildTopicWeightRankingReadEvidencePreview({
    plan: plan(),
    isolatedReadResult: isolatedResult(),
  });
}

function weightReviews(value) {
  return value.weightEvidence.map((item) => ({
    scope: item.scope,
    id: item.id,
    previousWeight: item.previousWeight,
    weight: item.weight,
    delta: item.delta,
    updateReceiptId: item.updateReceiptId,
    decision: "evidence_consistent",
    reviewNote: "已核对收据关联、权重差值和来源摘要",
  }));
}

function acceptedInput(value = preview()) {
  return {
    preview: value,
    reviewRequested: true,
    confirmation: value.requiredConfirmation,
    confirmedReadEvidencePreviewFingerprint: value.readEvidencePreviewFingerprint,
    checks: {
      profileAndPlanMatchReviewed: true,
      queryWhitelistCompletionReviewed: true,
      receiptLinkageReviewed: true,
      schemaEvidenceReviewed: true,
      simulationNotLiveAcknowledged: true,
    },
    weightReviews: weightReviews(value),
    overallDecision: "accept_isolated_read_evidence_review",
    overallReviewNote: "隔离模拟证据结构完整，仅确认已人工核对，不代表 live D1 结果",
  };
}

test("records an exact human review deterministically without live authorization", () => {
  const input = acceptedInput();
  const first = assessTopicWeightRankingReadEvidenceReview(input);
  const repeat = assessTopicWeightRankingReadEvidenceReview(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_read_evidence_review_recorded");
  assert.equal(first.readEvidenceReviewFingerprint, repeat.readEvidenceReviewFingerprint);
  assert.equal(first.reviewedWeightCount, 2);
  assert.equal(first.humanReviewCompleted, true);
  assert.equal(first.isolatedEvidenceAccepted, true);
  assert.equal(first.eligibleForLiveD1AuthorizationRequest, false);
  assert.equal(first.liveD1ReadAuthorizationGranted, false);
  assert.equal(first.eligibleForRankingActivation, false);
  assert.equal(first.rankingActivationAuthorizationGranted, false);
});

test("binds every reviewed weight and all five human checks", () => {
  const value = preview();
  const result = assessTopicWeightRankingReadEvidenceReview(acceptedInput(value));

  assert.equal(result.confirmedReadEvidencePreviewFingerprint, value.readEvidencePreviewFingerprint);
  assert.deepEqual(result.reviewedWeights.map(({ scope, id, reviewStatus }) => ({ scope, id, reviewStatus })), [
    { scope: "category", id: "technology", reviewStatus: "human_reviewed_isolated_evidence_not_activated" },
    { scope: "topic", id: "technology", reviewStatus: "human_reviewed_isolated_evidence_not_activated" },
  ]);
  assert.equal(result.reviewPersisted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
});

test("blocks missing intent, stale fingerprint and incomplete checks", () => {
  const input = acceptedInput();
  input.reviewRequested = false;
  input.confirmation = "wrong";
  input.confirmedReadEvidencePreviewFingerprint = "f".repeat(64);
  input.checks.simulationNotLiveAcknowledged = false;
  const result = assessTopicWeightRankingReadEvidenceReview(input);

  assert.deepEqual(result.blockers, [
    "topic_weight_ranking_read_evidence_review_not_requested",
    "topic_weight_ranking_read_evidence_review_confirmation_invalid",
    "topic_weight_ranking_read_evidence_preview_fingerprint_mismatch",
    "topic_weight_ranking_read_evidence_checks_invalid_or_incomplete",
  ]);
  assert.equal(result.humanReviewCompleted, false);
  assert.equal(result.isolatedEvidenceAccepted, false);
});

test("rejects tampered or reordered weight evidence and conflicting acceptance", () => {
  const tampered = acceptedInput();
  tampered.preview.weightEvidence[0].weight = 1.1;
  tampered.weightReviews = weightReviews(tampered.preview);
  assert.ok(assessTopicWeightRankingReadEvidenceReview(tampered).blockers.includes(
    "topic_weight_ranking_read_evidence_preview_invalid_or_tampered",
  ));

  const reordered = acceptedInput();
  reordered.weightReviews.reverse();
  assert.ok(assessTopicWeightRankingReadEvidenceReview(reordered).blockers.includes(
    "topic_weight_ranking_read_evidence_weight_reviews_invalid_or_incomplete",
  ));

  const conflicting = acceptedInput();
  conflicting.weightReviews[0].decision = "evidence_rejected";
  assert.ok(assessTopicWeightRankingReadEvidenceReview(conflicting).blockers.includes(
    "topic_weight_ranking_read_evidence_acceptance_conflicts_with_weight_rejection",
  ));
});

test("an explicit rejection remains non-persisted and disconnected from routes", async () => {
  const input = acceptedInput();
  input.overallDecision = "reject_isolated_read_evidence_review";
  input.overallReviewNote = "模拟数据不足以支持下一步，保留关闭状态";
  input.weightReviews[0].decision = "evidence_rejected";
  const result = assessTopicWeightRankingReadEvidenceReview(input);
  const [source, route, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-read-evidence-review-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.status, "topic_weight_ranking_read_evidence_review_recorded");
  assert.equal(result.humanReviewCompleted, true);
  assert.equal(result.isolatedEvidenceAccepted, false);
  assert.equal(result.liveD1EvidenceAvailable, false);
  assert.equal(result.eligibleForRankingActivation, false);
  assert.equal(result.rankingWeightsApplied, false);
  assert.equal(result.reviewPersisted, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /process\.env|\.prepare\s*\(|\bfetch\s*\(|writeFile|appendFile|mkdir|api[_-]?key|token|password|secret/i);
  assert.ok([route, page].every((content) => !content.includes("topic-weight-ranking-read-evidence-review-gate")));
});
