import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";
import { assessTopicWeightRankingImpactReview } from "../bridge/topic-weight-ranking-impact-review-gate.mjs";
import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "../bridge/topic-weight-ranking-activation-authorization-preview.mjs";

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

function readyImpactPreview() {
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

function candidateReviews(preview) {
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

function readyReview({ rejected = false } = {}) {
  const preview = readyImpactPreview();
  return assessTopicWeightRankingImpactReview({
    preview,
    reviewRequested: true,
    confirmation: `REVIEW TOPIC WEIGHT RANKING IMPACT ${preview.rankingImpactPreviewFingerprint}`,
    confirmedRankingImpactPreviewFingerprint: preview.rankingImpactPreviewFingerprint,
    candidateReviews: candidateReviews(preview),
    overallDecision: rejected
      ? "reject_ranking_impact"
      : "accept_ranking_impact_for_future_authorization",
    overallReviewNote: rejected
      ? "样本仍少，暂不进入启用授权"
      : "排序变化符合账号方向，可进入后续独立启用授权评估",
  });
}

test("builds a deterministic non-executing activation authorization preview", () => {
  const review = readyReview();
  const first = buildTopicWeightRankingActivationAuthorizationPreview(review);
  const repeat = buildTopicWeightRankingActivationAuthorizationPreview(structuredClone(review));

  assert.equal(first.status, "topic_weight_ranking_activation_authorization_preview_ready");
  assert.equal(first.activationAuthorizationPreviewFingerprint, repeat.activationAuthorizationPreviewFingerprint);
  assert.equal(first.profileId, review.profileId);
  assert.equal(first.sourceReviewFingerprint, review.rankingImpactReviewFingerprint);
  assert.equal(first.confirmedRankingImpactPreviewFingerprint, review.confirmedRankingImpactPreviewFingerprint);
  assert.equal(first.requiredConfirmation,
    `AUTHORIZE REVIEWED TOPIC WEIGHT RANKING ACTIVATION ${first.activationAuthorizationPreviewFingerprint}`);
  assert.equal(first.eligibleForExplicitRankingActivationAuthorization, true);
});

test("requires migration verification and rollback while leaving activation unavailable", () => {
  const result = buildTopicWeightRankingActivationAuthorizationPreview(readyReview());

  assert.equal(result.activationTarget.requiresExactReviewFingerprint, true);
  assert.equal(result.activationTarget.requiresReceiptBackedWeightProjection, true);
  assert.equal(result.activationTarget.requiresLiveMigrationVerification, true);
  assert.equal(result.activationTarget.requiresReversibleRollout, true);
  assert.equal(result.activationTarget.activationAllowed, false);
  assert.equal(result.rankingActivationAuthorizationGranted, false);
  assert.equal(result.activationAdapterImplemented, false);
  assert.equal(result.activationPreflightCompleted, false);
  assert.equal(result.liveMigrationVerified, false);
  assert.equal(result.rollbackPlanPrepared, false);
  assert.equal(result.productionRankingUpdated, false);
  assert.equal(result.rankingRouteChanged, false);
});

test("blocks a rejected review before offering authorization", () => {
  const result = buildTopicWeightRankingActivationAuthorizationPreview(readyReview({ rejected: true }));

  assert.equal(result.status, "topic_weight_ranking_activation_authorization_preview_blocked");
  assert.deepEqual(result.blockers, ["topic_weight_ranking_impact_review_invalid_or_not_accepted"]);
  assert.equal(result.activationTarget, null);
  assert.equal(result.eligibleForExplicitRankingActivationAuthorization, false);
});

test("blocks stale review fingerprints, tampered candidates and false boundaries", () => {
  const stale = readyReview();
  stale.rankingImpactReviewFingerprint = "f".repeat(64);
  assert.equal(buildTopicWeightRankingActivationAuthorizationPreview(stale).activationTarget, null);

  const tampered = readyReview();
  tampered.reviewedCandidates[0].previewRank = 2;
  assert.equal(buildTopicWeightRankingActivationAuthorizationPreview(tampered).activationTarget, null);

  const falseBoundary = readyReview();
  falseBoundary.productionRankingUpdated = true;
  assert.equal(buildTopicWeightRankingActivationAuthorizationPreview(falseBoundary).status,
    "topic_weight_ranking_activation_authorization_preview_blocked");
});

test("preview has no configuration, database, route, network or publish action", async () => {
  const result = buildTopicWeightRankingActivationAuthorizationPreview(readyReview());
  const [source, rankedRoute, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-activation-authorization-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.configurationWrites, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bgetDb\b|\bdb\s*\.\s*(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.ok([rankedRoute, page].every((content) => (
    !content.includes("topic-weight-ranking-activation-authorization-preview")
  )));
});
