import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightUpdateAuthorizationPreview } from "../bridge/topic-weight-update-authorization-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const reviewChecks = Object.freeze({
  deltaAndWeightBoundsReviewed: true,
  noPredictionOrAutomaticUpdateAcknowledged: true,
  sampleCountAndAggregationReviewed: true,
  signalAndShrinkageReviewed: true,
});

function reviewedProposal(scope, id, decision) {
  const approved = decision === "approve_candidate_weight_change";
  return {
    scope,
    id,
    currentWeight: scope === "category" ? 1 : 0.9,
    suggestedWeight: scope === "category" ? 1.012 : 0.908,
    delta: scope === "category" ? 0.012 : 0.008,
    uniqueIdeaCount: 2,
    meanSignal: scope === "category" ? 0.8 : 0.7,
    status: "human_review_required_not_applied",
    reviewDecision: decision,
    reviewNote: approved ? "批准进入独立授权准备" : "继续收集该主题样本",
    reviewChecks: { ...reviewChecks },
    reviewStatus: approved
      ? "human_approved_candidate_not_applied"
      : "human_rejected_candidate_not_applied",
  };
}

function readyConfirmation({ allRejected = false } = {}) {
  const reviewedProposals = [
    reviewedProposal("category", "ai", allRejected ? "reject_candidate_weight_change" : "approve_candidate_weight_change"),
    reviewedProposal("topic", "technology", "reject_candidate_weight_change"),
  ];
  const approvedProposals = reviewedProposals.filter(({ reviewDecision }) => reviewDecision === "approve_candidate_weight_change");
  const reviewPayload = {
    profileId: "zhihui-ai-tech-finance-v1",
    weightUpdatePreviewFingerprint: "a".repeat(64),
    reviewedProposals,
  };
  return {
    status: "topic_weight_update_review_confirmation_accepted",
    blockers: [],
    profileId: reviewPayload.profileId,
    confirmedWeightUpdatePreviewFingerprint: reviewPayload.weightUpdatePreviewFingerprint,
    topicWeightUpdateReviewFingerprint: hash(reviewPayload),
    reviewedProposals,
    reviewedProposalCount: reviewedProposals.length,
    approvedProposals,
    approvedProposalCount: approvedProposals.length,
    rejectedProposalCount: reviewedProposals.length - approvedProposals.length,
    humanWeightReviewCompleted: true,
    eligibleForLearningUpdateAuthorization: approvedProposals.length > 0,
    learningUpdateEligible: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

test("builds a deterministic authorization preview for approved candidates only", () => {
  const confirmation = readyConfirmation();
  const first = buildTopicWeightUpdateAuthorizationPreview(confirmation);
  const repeat = buildTopicWeightUpdateAuthorizationPreview(structuredClone(confirmation));

  assert.equal(first.status, "topic_weight_update_authorization_preview_ready");
  assert.equal(first.weightUpdateAuthorizationPreviewFingerprint, repeat.weightUpdateAuthorizationPreviewFingerprint);
  assert.equal(first.targetCount, 1);
  assert.equal(first.updateTargets[0].id, "ai");
  assert.equal(first.requiredConfirmation, `AUTHORIZE REVIEWED TOPIC WEIGHT UPDATE ${first.weightUpdateAuthorizationPreviewFingerprint}`);
  assert.equal(first.eligibleForExplicitLearningUpdateAuthorization, true);
});

test("preserves reviewed values while making implementation and writes explicitly unavailable", () => {
  const confirmation = readyConfirmation();
  const result = buildTopicWeightUpdateAuthorizationPreview(confirmation);
  const approved = confirmation.approvedProposals[0];
  const target = result.updateTargets[0];

  assert.equal(target.scope, approved.scope);
  assert.equal(target.currentWeight, approved.currentWeight);
  assert.equal(target.suggestedWeight, approved.suggestedWeight);
  assert.equal(target.delta, approved.delta);
  assert.equal(target.requiresExactReviewFingerprint, true);
  assert.equal(target.requiresDurableAccountProfileStore, true);
  assert.equal(target.updateAllowed, false);
  assert.equal(result.learningUpdateAuthorizationGranted, false);
  assert.equal(result.applicationAdapterImplemented, false);
  assert.equal(result.applicationPreflightCompleted, false);
  assert.equal(result.learningUpdateEligible, false);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.databaseWrites, false);
});

test("blocks an all-rejected review before offering authorization", () => {
  const result = buildTopicWeightUpdateAuthorizationPreview(readyConfirmation({ allRejected: true }));

  assert.equal(result.status, "topic_weight_update_authorization_preview_blocked");
  assert.deepEqual(result.blockers, ["topic_weight_update_review_confirmation_invalid_or_no_approved_candidates"]);
  assert.equal(result.targetCount, 0);
  assert.equal(result.eligibleForExplicitLearningUpdateAuthorization, false);
});

test("blocks a stale fingerprint, tampered proposal and false review boundary", () => {
  const stale = readyConfirmation();
  stale.topicWeightUpdateReviewFingerprint = "f".repeat(64);
  assert.equal(buildTopicWeightUpdateAuthorizationPreview(stale).targetCount, 0);

  const tampered = readyConfirmation();
  tampered.reviewedProposals[0].suggestedWeight += 0.01;
  tampered.approvedProposals[0].suggestedWeight += 0.01;
  assert.equal(buildTopicWeightUpdateAuthorizationPreview(tampered).targetCount, 0);

  const falseBoundary = readyConfirmation();
  falseBoundary.learningWeightsUpdated = true;
  assert.equal(buildTopicWeightUpdateAuthorizationPreview(falseBoundary).status,
    "topic_weight_update_authorization_preview_blocked");
});

test("preview has no configuration, database, route, network or publish action", async () => {
  const result = buildTopicWeightUpdateAuthorizationPreview(readyConfirmation());
  const [source, rankedRoute, metricsRoute] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-update-authorization-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.configurationWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bgetDb\b|\bdb\s*\.\s*(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.doesNotMatch(rankedRoute, /topic-weight-update-authorization-preview/);
  assert.doesNotMatch(metricsRoute, /topic-weight-update-authorization-preview/);
});
