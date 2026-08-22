import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";
import { assessTopicWeightRankingImpactReview } from "../bridge/topic-weight-ranking-impact-review-gate.mjs";

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

function readyPreview() {
  const authorizationPreviewFingerprint = "a".repeat(64);
  return buildTopicWeightRankingImpactPreview({
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
}

function reviewsFor(preview) {
  return preview.candidates.map((candidate) => ({
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
  }));
}

function acceptedInput(preview = readyPreview()) {
  return {
    preview,
    reviewRequested: true,
    confirmation: `REVIEW TOPIC WEIGHT RANKING IMPACT ${preview.rankingImpactPreviewFingerprint}`,
    confirmedRankingImpactPreviewFingerprint: preview.rankingImpactPreviewFingerprint,
    candidateReviews: reviewsFor(preview),
    overallDecision: "accept_ranking_impact_for_future_authorization",
    overallReviewNote: "排序变化符合账号方向，可进入后续独立启用授权评估",
  };
}

test("accepts an exact human review deterministically without activating ranking", () => {
  const input = acceptedInput();
  const first = assessTopicWeightRankingImpactReview(input);
  const repeat = assessTopicWeightRankingImpactReview(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_impact_review_accepted");
  assert.equal(first.rankingImpactReviewFingerprint, repeat.rankingImpactReviewFingerprint);
  assert.equal(first.reviewedCandidateCount, 2);
  assert.equal(first.humanRankingImpactReviewCompleted, true);
  assert.equal(first.eligibleForRankingActivationAuthorization, true);
  assert.equal(first.rankingActivationAuthorizationGranted, false);
  assert.equal(first.productionRankingUpdated, false);
  assert.equal(first.rankingRouteChanged, false);
});

test("binds every score and rank value while keeping writes and publication closed", () => {
  const preview = readyPreview();
  const result = assessTopicWeightRankingImpactReview(acceptedInput(preview));

  assert.equal(result.profileId, preview.profileId);
  assert.equal(result.confirmedRankingImpactPreviewFingerprint, preview.rankingImpactPreviewFingerprint);
  assert.ok(result.reviewedCandidates.every((candidate, index) => (
    candidate.id === preview.candidates[index].id
    && candidate.baseRank === preview.candidates[index].baseRank
    && candidate.previewRank === preview.candidates[index].previewRank
    && candidate.reviewStatus === "human_reviewed_impact_not_activated"
  )));
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("blocks missing intent, stale fingerprint and incomplete candidate checks", () => {
  const preview = readyPreview();
  const candidateReviews = reviewsFor(preview);
  candidateReviews[0].checks.scoreAndRankDeltaReviewed = false;
  const result = assessTopicWeightRankingImpactReview({
    ...acceptedInput(preview),
    reviewRequested: false,
    confirmation: "wrong",
    confirmedRankingImpactPreviewFingerprint: "f".repeat(64),
    candidateReviews,
  });

  assert.deepEqual(result.blockers, [
    "topic_weight_ranking_impact_review_not_requested",
    "topic_weight_ranking_impact_review_confirmation_invalid",
    "topic_weight_ranking_impact_preview_fingerprint_mismatch",
    "topic_weight_ranking_impact_candidate_reviews_invalid_or_incomplete",
  ]);
  assert.equal(result.humanRankingImpactReviewCompleted, false);
  assert.equal(result.eligibleForRankingActivationAuthorization, false);
});

test("rejects tampered preview values and reordered reviews", () => {
  const tampered = acceptedInput();
  tampered.preview.candidates[0].previewRank = 2;
  tampered.candidateReviews = reviewsFor(tampered.preview);
  assert.ok(assessTopicWeightRankingImpactReview(tampered).blockers.includes(
    "topic_weight_ranking_impact_preview_invalid_or_tampered",
  ));

  const reordered = acceptedInput();
  reordered.candidateReviews.reverse();
  assert.ok(assessTopicWeightRankingImpactReview(reordered).blockers.includes(
    "topic_weight_ranking_impact_candidate_reviews_invalid_or_incomplete",
  ));
});

test("an explicit rejection remains closed and the gate has no route or write path", async () => {
  const input = acceptedInput();
  input.overallDecision = "reject_ranking_impact";
  input.overallReviewNote = "样本仍少，暂不进入启用授权";
  const result = assessTopicWeightRankingImpactReview(input);
  const [source, rankedRoute, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-impact-review-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.humanRankingImpactReviewCompleted, true);
  assert.equal(result.eligibleForRankingActivationAuthorization, false);
  assert.doesNotMatch(source, /\bgetDb\b|\bfetch\s*\(|writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.doesNotMatch(
    source,
    /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|INDEX)|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX)|REPLACE\s+INTO)\b/i,
  );
  assert.ok([rankedRoute, page].every((content) => !content.includes("topic-weight-ranking-impact-review-gate")));
});
