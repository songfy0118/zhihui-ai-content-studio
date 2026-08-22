import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightUpdatePreview } from "../bridge/topic-weight-update-preview.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metric({ ideaId, platform = "xiaohongshu", sequence = 1, views = 1_000, likes = 35, comments = 10, shares = 8, saves = 12, completionRate = 72 }) {
  const identity = `${ideaId}:${platform}:${sequence}`;
  return {
    metricId: `metric_${digest(identity)}`,
    ideaId,
    platform,
    contentFingerprint: digest(`content:${ideaId}`),
    sourceEvidenceFingerprint: digest(`source:${identity}`),
    sourceKind: "platform_export",
    views,
    likes,
    comments,
    shares,
    saves,
    followers: 500,
    completionRate,
    verificationStatus: "strong_source_verified_read_only",
  };
}

function projection(metrics) {
  return {
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
  };
}

const metadata = Object.freeze([
  { ideaId: "idea-ai-1", category: "ai", matchedTopics: ["ai", "technology"] },
  { ideaId: "idea-ai-2", category: "ai", matchedTopics: ["ai"] },
  { ideaId: "idea-tech-1", category: "technology", matchedTopics: ["technology"] },
]);

test("builds deterministic bounded proposals from at least three verified ideas", () => {
  const metricsProjection = projection([
    metric({ ideaId: "idea-ai-1", completionRate: 80 }),
    metric({ ideaId: "idea-ai-2", completionRate: 68, likes: 22 }),
    metric({ ideaId: "idea-tech-1", completionRate: 60, likes: 18 }),
  ]);

  const first = buildTopicWeightUpdatePreview({ metricsProjection, ideaMetadata: metadata });
  const second = buildTopicWeightUpdatePreview({ metricsProjection, ideaMetadata: metadata });

  assert.deepEqual(first, second);
  assert.equal(first.status, "topic_weight_update_human_review_pending");
  assert.equal(first.uniqueIdeaCount, 3);
  assert.equal(first.recommendationCount, 3);
  assert.deepEqual(first.categoryWeightProposals.map(({ id }) => id), ["ai"]);
  assert.deepEqual(first.topicWeightProposals.map(({ id }) => id), ["ai", "technology"]);
  assert.ok(first.weightUpdatePreviewFingerprint);
  for (const candidate of [...first.categoryWeightProposals, ...first.topicWeightProposals]) {
    assert.ok(Math.abs(candidate.delta) <= 0.05);
    assert.ok(candidate.suggestedWeight >= 0.5 && candidate.suggestedWeight <= 1.5);
    assert.equal(candidate.status, "human_review_required_not_applied");
  }
});

test("aggregates dual-platform snapshots per idea and keeps every mutation gate closed", () => {
  const result = buildTopicWeightUpdatePreview({
    metricsProjection: projection([
      metric({ ideaId: "idea-ai-1", platform: "xiaohongshu", completionRate: 82 }),
      metric({ ideaId: "idea-ai-1", platform: "douyin", sequence: 2, completionRate: 58 }),
      metric({ ideaId: "idea-ai-2", completionRate: 70 }),
      metric({ ideaId: "idea-tech-1", completionRate: 62 }),
    ]),
    ideaMetadata: metadata,
  });

  assert.equal(result.uniqueIdeaCount, 3);
  assert.equal(result.ideaOutcomes.find(({ ideaId }) => ideaId === "idea-ai-1").snapshotCount, 2);
  assert.equal(result.accountMetricsUsed, true);
  assert.equal(result.eligibleForHumanWeightReview, true);
  assert.equal(result.predictedViewsGenerated, false);
  assert.equal(result.viralProbabilityGenerated, false);
  assert.equal(result.humanWeightReviewCompleted, false);
  assert.equal(result.learningUpdateEligible, false);
  assert.equal(result.learningUpdateAuthorizationGranted, false);
  assert.equal(result.learningWeightsUpdated, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("does not recommend weights before three unique verified ideas exist", () => {
  const result = buildTopicWeightUpdatePreview({
    metricsProjection: projection([
      metric({ ideaId: "idea-ai-1" }),
      metric({ ideaId: "idea-ai-2" }),
    ]),
    ideaMetadata: metadata.slice(0, 2),
  });

  assert.equal(result.status, "topic_weight_update_insufficient_verified_outcomes");
  assert.equal(result.uniqueIdeaCount, 2);
  assert.deepEqual(result.categoryWeightProposals, []);
  assert.deepEqual(result.topicWeightProposals, []);
  assert.equal(result.recommendationCount, 0);
  assert.equal(result.eligibleForHumanWeightReview, false);
});

test("blocks tampered projections and incomplete editorial metadata", () => {
  const base = projection([
    metric({ ideaId: "idea-ai-1" }),
    metric({ ideaId: "idea-ai-2" }),
    metric({ ideaId: "idea-tech-1" }),
  ]);
  const tampered = buildTopicWeightUpdatePreview({
    metricsProjection: { ...base, learningWeightsUpdated: true },
    ideaMetadata: metadata,
  });
  const unmapped = buildTopicWeightUpdatePreview({
    metricsProjection: base,
    ideaMetadata: metadata.slice(0, 2),
  });

  assert.deepEqual(tampered.blockers, ["verified_metrics_projection_invalid_or_tampered", "idea_metadata_invalid_incomplete_or_unmapped"]);
  assert.deepEqual(unmapped.blockers, ["idea_metadata_invalid_incomplete_or_unmapped"]);
  for (const result of [tampered, unmapped]) {
    assert.equal(result.status, "topic_weight_update_preview_blocked");
    assert.equal(result.accountMetricsUsed, false);
    assert.equal(result.recommendationCount, 0);
    assert.equal(result.learningWeightsUpdated, false);
  }
});

test("preview stays disconnected from routes, storage, network and publishing", async () => {
  const [source, rankedRoute, metricsRoute] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-update-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/metrics/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bgetDb\b|\bdb\s*\.\s*(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.doesNotMatch(rankedRoute, /topic-weight-update-preview/);
  assert.doesNotMatch(metricsRoute, /topic-weight-update-preview/);
});
