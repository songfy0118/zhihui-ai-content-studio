import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";
import { assessTopicWeightRankingImpactReview } from "../bridge/topic-weight-ranking-impact-review-gate.mjs";
import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "../bridge/topic-weight-ranking-activation-authorization-preview.mjs";
import { buildTopicWeightRankingLiveReadPlan } from "../bridge/topic-weight-ranking-live-read-plan.mjs";

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

function readyChain() {
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
  return {
    reviewConfirmation,
    authorizationPreview: buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation),
  };
}

function readyInput() {
  return {
    ...readyChain(),
    requestedWeights: [
      { scope: "category", id: "technology" },
      { scope: "topic", id: "technology" },
    ],
  };
}

test("builds a deterministic five-query read-only live D1 plan", () => {
  const input = readyInput();
  const first = buildTopicWeightRankingLiveReadPlan(input);
  const repeat = buildTopicWeightRankingLiveReadPlan(structuredClone(input));

  assert.equal(first.status, "topic_weight_ranking_live_read_plan_ready");
  assert.equal(first.liveReadPlanFingerprint, repeat.liveReadPlanFingerprint);
  assert.equal(first.queryCount, 5);
  assert.equal(first.requestedWeightCount, 2);
  assert.equal(first.readOnlyStatementsOnly, true);
  assert.ok(first.queries.every(({ statement }) => /^\s*(?:SELECT|PRAGMA)\b/i.test(statement)));
  assert.equal(first.queries.filter(({ inspectsDataRows }) => inspectsDataRows).length, 1);
});

test("binds only profile and weight keys as bounded query parameters", () => {
  const result = buildTopicWeightRankingLiveReadPlan(readyInput());
  const projectionQuery = result.queries.at(-1);

  assert.deepEqual(projectionQuery.params, [
    "zhihui-ai-tech-finance-v1",
    "category",
    "technology",
    "topic",
    "technology",
  ]);
  assert.equal(result.requestedBinding, "DB");
  assert.equal(result.inspectionScope, "live_d1_read_only");
  assert.equal(result.requiresExistingD1Binding, true);
  assert.equal(result.permissionExpansionRequested, false);
  assert.equal(result.credentialsRequested, false);
});

test("blocks duplicate, unmapped and malformed requests before planning SQL", () => {
  const duplicate = readyInput();
  duplicate.requestedWeights = [duplicate.requestedWeights[0], duplicate.requestedWeights[0]];
  const unmapped = readyInput();
  unmapped.requestedWeights = [{ scope: "topic", id: "unknown" }];
  const malformed = readyInput();
  malformed.requestedWeights = [{ scope: "category", id: "technology", extra: true }];

  for (const input of [duplicate, unmapped, malformed]) {
    const result = buildTopicWeightRankingLiveReadPlan(input);
    assert.deepEqual(result.blockers, ["ranking_live_read_weight_requests_invalid_or_unmapped"]);
    assert.equal(result.queryCount, 0);
    assert.deepEqual(result.queries, []);
  }
});

test("blocks a tampered authorization chain and profile mismatch", () => {
  const tampered = readyInput();
  tampered.authorizationPreview.activationTarget.activationAllowed = true;
  const mismatched = readyInput();
  mismatched.authorizationPreview.profileId = "another-profile";

  assert.ok(buildTopicWeightRankingLiveReadPlan(tampered).blockers.includes(
    "ranking_activation_authorization_preview_invalid_or_tampered",
  ));
  assert.ok(buildTopicWeightRankingLiveReadPlan(mismatched).blockers.includes(
    "ranking_live_read_profile_mismatch",
  ));
});

test("plan has no live read, route, write, credential or publication action", async () => {
  const result = buildTopicWeightRankingLiveReadPlan(readyInput());
  const [source, rankedRoute, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-live-read-plan.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(result.executionImplemented, false);
  assert.equal(result.liveReadPerformed, false);
  assert.equal(result.inspectedDataRows, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.configurationWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /\bgetDb\b|\.prepare\s*\(|\.all\s*\(|\bfetch\s*\(/);
  assert.doesNotMatch(source, /process\.env|api[_-]?key|token|password|secret/i);
  assert.ok([rankedRoute, page].every((content) => !content.includes("topic-weight-ranking-live-read-plan")));
});
