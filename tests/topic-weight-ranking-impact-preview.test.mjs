import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTopicWeightRankingImpactPreview } from "../bridge/topic-weight-ranking-impact-preview.mjs";

function cluster(id, title, category, lastSeenAt, evidenceTitles) {
  return {
    id,
    title,
    category,
    sourceCount: 2,
    itemCount: 2,
    sourceIds: [`${id}-source-a`, `${id}-source-b`],
    firstSeenAt: "2026-08-21T10:00:00.000Z",
    lastSeenAt,
    meanSimilarity: 0.85,
    eligibleForHotspotScoring: true,
    evidence: evidenceTitles.map((evidenceTitle, index) => ({
      id: `${id}-${index}`,
      title: evidenceTitle,
      sourceId: `${id}-source-${index}`,
    })),
  };
}

function weight(scope, id, previousWeight, delta, fingerprintCharacter) {
  const authorizationPreviewFingerprint = fingerprintCharacter.repeat(64);
  return {
    profileId: "zhihui-ai-tech-finance-v1",
    scope,
    id,
    weight: Number((previousWeight + delta).toFixed(4)),
    previousWeight,
    delta,
    sourceUniqueIdeaCount: 3,
    sourceMeanSignal: 0.8,
    sourceReviewFingerprint: (fingerprintCharacter === "a" ? "c" : "d").repeat(64),
    authorizationPreviewFingerprint,
    updateReceiptId: `atwu_${authorizationPreviewFingerprint}`,
    updatedAt: "2026-08-22T14:30:00.000Z",
    integrityStatus: "complete_active_update_receipt_read_only",
  };
}

function readyProjection() {
  const weights = [
    weight("category", "technology", 0.95, 0.05, "a"),
    weight("topic", "technology", 0.9, 0.05, "b"),
  ];
  return {
    status: "account_topic_weight_projection_ready",
    blockers: [],
    profileId: "zhihui-ai-tech-finance-v1",
    weights,
    weightCount: weights.length,
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
  };
}

function clustering() {
  return {
    clusters: [
      cluster("technology-cluster", "Cloud software developer platform", "technology", "2026-08-21T12:00:00.000Z", [
        "Technology cloud software developer update",
        "Cloud platform technology release",
      ]),
      cluster("finance-cluster", "Federal Reserve inflation outlook", "macro_finance", "2026-08-21T12:30:00.000Z", [
        "Federal Reserve market outlook",
        "Finance inflation rate report",
      ]),
    ],
  };
}

test("previews deterministic score impact while preserving trend evidence", () => {
  const first = buildTopicWeightRankingImpactPreview({
    clustering: clustering(),
    weightProjection: readyProjection(),
    now: "2026-08-21T13:00:00.000Z",
  });
  const repeat = buildTopicWeightRankingImpactPreview({
    clustering: structuredClone(clustering()),
    weightProjection: structuredClone(readyProjection()),
    now: "2026-08-21T13:00:00.000Z",
  });
  const technology = first.candidates.find(({ id }) => id === "technology-cluster");
  const finance = first.candidates.find(({ id }) => id === "finance-cluster");

  assert.equal(first.status, "topic_weight_ranking_impact_preview_ready");
  assert.equal(first.rankingImpactPreviewFingerprint, repeat.rankingImpactPreviewFingerprint);
  assert.equal(first.overrideCount, 2);
  assert.ok(technology.previewAccountFitScore > technology.baseAccountFitScore);
  assert.ok(technology.previewRelativePriorityScore > technology.baseRelativePriorityScore);
  assert.equal(finance.previewAccountFitScore, finance.baseAccountFitScore);
  assert.equal(technology.trendEvidenceScore, repeat.candidates.find(({ id }) => id === technology.id).trendEvidenceScore);
  assert.equal(first.productionRankingUpdated, false);
  assert.equal(first.rankingRouteChanged, false);
});

test("blocks unmapped, tampered and incomplete weight projections", () => {
  const unmapped = readyProjection();
  unmapped.weights[0].id = "unknown-category";
  const tampered = readyProjection();
  tampered.weights[0].weight += 0.01;
  const incomplete = readyProjection();
  incomplete.complete = false;

  for (const projection of [unmapped, tampered, incomplete]) {
    const result = buildTopicWeightRankingImpactPreview({ clustering: clustering(), weightProjection: projection });
    assert.deepEqual(result.blockers, ["account_topic_weight_projection_invalid_or_unmapped"]);
    assert.equal(result.candidateCount, 0);
  }
});

test("returns an honest empty preview when no cluster is eligible", () => {
  const input = clustering();
  input.clusters.forEach((candidate) => { candidate.eligibleForHotspotScoring = false; });
  const result = buildTopicWeightRankingImpactPreview({ clustering: input, weightProjection: readyProjection() });

  assert.equal(result.status, "topic_weight_ranking_impact_no_eligible_candidates");
  assert.equal(result.candidateCount, 0);
  assert.equal(result.accountWeightProjectionUsed, true);
  assert.equal(result.productionRankingUpdated, false);
});

test("never invents reach, viral probability, fact status or selection readiness", () => {
  const result = buildTopicWeightRankingImpactPreview({
    clustering: clustering(),
    weightProjection: readyProjection(),
    now: "2026-08-21T13:00:00.000Z",
  });

  assert.equal(result.predictedViewsGenerated, false);
  assert.equal(result.viralProbabilityGenerated, false);
  assert.equal(result.factsVerified, false);
  assert.equal(result.humanSelectionUnlocked, false);
  assert.ok(result.candidates.every((candidate) => candidate.predictedViews === null
    && candidate.viralProbability === null
    && candidate.factsVerified === false
    && candidate.selectableForDraft === false));
});

test("stays a pure preview disconnected from routes, storage and publication", async () => {
  const [source, rankedRoute, page] = await Promise.all([
    readFile(new URL("../bridge/topic-weight-ranking-impact-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /\bgetDb\b|\bfetch\s*\(|writeFile|appendFile|mkdir|rmSync|unlink/);
  assert.doesNotMatch(
    source,
    /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|INDEX)|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX)|REPLACE\s+INTO)\b/i,
  );
  assert.ok([rankedRoute, page].every((content) => !content.includes("topic-weight-ranking-impact-preview")));
});
