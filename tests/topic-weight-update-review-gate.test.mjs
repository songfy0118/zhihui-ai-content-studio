import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightUpdatePreview } from "../bridge/topic-weight-update-preview.mjs";
import { assessTopicWeightUpdateReviewConfirmation } from "../bridge/topic-weight-update-review-gate.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metric({ ideaId, completionRate = 70 }) {
  return {
    metricId: `metric_${digest(`metric:${ideaId}`)}`,
    ideaId,
    platform: "xiaohongshu",
    contentFingerprint: digest(`content:${ideaId}`),
    sourceEvidenceFingerprint: digest(`source:${ideaId}`),
    sourceKind: "platform_export",
    views: 1_000,
    likes: 30,
    comments: 8,
    shares: 5,
    saves: 12,
    followers: 500,
    completionRate,
    verificationStatus: "strong_source_verified_read_only",
  };
}

function readyPreview() {
  const metrics = [
    metric({ ideaId: "idea-ai-1", completionRate: 82 }),
    metric({ ideaId: "idea-ai-2", completionRate: 70 }),
    metric({ ideaId: "idea-tech-1", completionRate: 61 }),
  ];
  return buildTopicWeightUpdatePreview({
    metricsProjection: {
      status: "platform_text_metrics_projection_ready",
      blockers: [],
      metrics,
      metricCount: metrics.length,
      complete: true,
      realDataOnly: true,
      eligibleForWeightUpdatePreview: true,
      learningUpdateEligible: false,
      learningWeightsUpdated: false,
      inspectedDataRows: true,
      databaseWrites: false,
      filesystemMutations: false,
      externalCalls: false,
      publishTriggered: false,
      businessResult: false,
    },
    ideaMetadata: [
      { ideaId: "idea-ai-1", category: "ai", matchedTopics: ["ai", "technology"] },
      { ideaId: "idea-ai-2", category: "ai", matchedTopics: ["ai"] },
      { ideaId: "idea-tech-1", category: "technology", matchedTopics: ["technology"] },
    ],
  });
}

function decisionsFor(preview, decisionForIndex = (index) => index === 1
  ? "reject_candidate_weight_change"
  : "approve_candidate_weight_change") {
  const proposals = [
    ...preview.categoryWeightProposals.map((proposal) => ({ scope: "category", ...proposal })),
    ...preview.topicWeightProposals.map((proposal) => ({ scope: "topic", ...proposal })),
  ];
  return proposals.map((proposal, index) => ({
    scope: proposal.scope,
    id: proposal.id,
    currentWeight: proposal.currentWeight,
    suggestedWeight: proposal.suggestedWeight,
    delta: proposal.delta,
    uniqueIdeaCount: proposal.uniqueIdeaCount,
    meanSignal: proposal.meanSignal,
    decision: decisionForIndex(index),
    reviewNote: index === 1 ? "该主题样本尚需继续观察" : "样本、信号和变化幅度已人工复核",
    checks: {
      deltaAndWeightBoundsReviewed: true,
      noPredictionOrAutomaticUpdateAcknowledged: true,
      sampleCountAndAggregationReviewed: true,
      signalAndShrinkageReviewed: true,
    },
  }));
}

function acceptedInput(preview = readyPreview()) {
  return {
    preview,
    reviewRequested: true,
    confirmation: `REVIEW TOPIC WEIGHT UPDATE ${preview.weightUpdatePreviewFingerprint}`,
    confirmedWeightUpdatePreviewFingerprint: preview.weightUpdatePreviewFingerprint,
    decisions: decisionsFor(preview),
  };
}

test("accepts exact mixed human decisions deterministically", () => {
  const input = acceptedInput();
  const first = assessTopicWeightUpdateReviewConfirmation(input);
  const repeat = assessTopicWeightUpdateReviewConfirmation(structuredClone(input));

  assert.equal(first.status, "topic_weight_update_review_confirmation_accepted");
  assert.equal(first.topicWeightUpdateReviewFingerprint, repeat.topicWeightUpdateReviewFingerprint);
  assert.equal(first.reviewedProposalCount, 3);
  assert.equal(first.approvedProposalCount, 2);
  assert.equal(first.rejectedProposalCount, 1);
  assert.equal(first.humanWeightReviewCompleted, true);
  assert.equal(first.eligibleForLearningUpdateAuthorization, true);
});

test("binds every reviewed value while keeping update and persistence closed", () => {
  const preview = readyPreview();
  const result = assessTopicWeightUpdateReviewConfirmation(acceptedInput(preview));

  assert.equal(result.profileId, preview.profileId);
  assert.equal(result.confirmedWeightUpdatePreviewFingerprint, preview.weightUpdatePreviewFingerprint);
  assert.ok(result.reviewedProposals.every(({ reviewStatus }) => reviewStatus.endsWith("_candidate_not_applied")));
  assert.equal(result.learningUpdateEligible, false);
  assert.equal(result.learningUpdateAuthorizationGranted, false);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("blocks missing intent, wrong confirmation and a stale preview fingerprint", () => {
  const preview = readyPreview();
  const result = assessTopicWeightUpdateReviewConfirmation({
    preview,
    reviewRequested: false,
    confirmation: "wrong",
    confirmedWeightUpdatePreviewFingerprint: "f".repeat(64),
    decisions: decisionsFor(preview),
  });

  assert.deepEqual(result.blockers, [
    "topic_weight_update_review_not_requested",
    "topic_weight_update_review_confirmation_invalid",
    "topic_weight_update_preview_fingerprint_mismatch",
  ]);
  assert.equal(result.humanWeightReviewCompleted, false);
  assert.equal(result.eligibleForLearningUpdateAuthorization, false);
});

test("blocks incomplete checks, reordered decisions and a tampered proposal", () => {
  const incomplete = acceptedInput();
  incomplete.decisions[0].checks.signalAndShrinkageReviewed = false;
  assert.ok(assessTopicWeightUpdateReviewConfirmation(incomplete).blockers.includes(
    "topic_weight_update_review_decisions_invalid_or_incomplete",
  ));

  const reordered = acceptedInput();
  reordered.decisions.reverse();
  assert.equal(assessTopicWeightUpdateReviewConfirmation(reordered).reviewedProposalCount, 0);

  const tampered = acceptedInput();
  tampered.preview.categoryWeightProposals[0].suggestedWeight += 0.01;
  tampered.decisions = decisionsFor(tampered.preview);
  assert.ok(assessTopicWeightUpdateReviewConfirmation(tampered).blockers.includes(
    "topic_weight_update_preview_invalid_or_tampered",
  ));
});

test("an all-rejected review stays closed and the gate has no route or write path", async () => {
  const preview = readyPreview();
  const result = assessTopicWeightUpdateReviewConfirmation({
    ...acceptedInput(preview),
    decisions: decisionsFor(preview, () => "reject_candidate_weight_change"),
  });
  const [source, rankedRoute, metricsRoute] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-update-review-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.approvedProposalCount, 0);
  assert.equal(result.eligibleForLearningUpdateAuthorization, false);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bgetDb\b|\bdb\s*\.\s*(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.doesNotMatch(rankedRoute, /topic-weight-update-review-gate/);
  assert.doesNotMatch(metricsRoute, /topic-weight-update-review-gate/);
});
