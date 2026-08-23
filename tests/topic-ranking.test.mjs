import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { assessProfileCategoryCoverage, DEFAULT_ACCOUNT_PROFILE, rankTopicCandidates, scoreAccountFit } from "../bridge/topic-ranking.mjs";

function item(id, sourceId, title, publishedAt, category = "ai") {
  return { id, sourceId, sourceName: sourceId, title, canonicalUrl: `https://${sourceId}.example/${id}`, publishedAt, category };
}

test("ranks only eligible multi-source clusters with explainable rule scores", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "OpenAI unveils enterprise agent platform", "2026-08-21T12:00:00Z"),
    item("c", "source-c", "Federal Reserve publishes meeting calendar", "2026-08-21T11:00:00Z", "macro_finance"),
  ]);
  const result = rankTopicCandidates(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(result.summary.clustersConsidered, 2);
  assert.equal(result.summary.rankedCandidates, 1);
  assert.equal(result.summary.blockedBeforeScoring, 1);
  assert.equal(result.candidates[0].sourceCount, 2);
  assert.ok(result.candidates[0].trendEvidenceScore > 0);
  assert.ok(result.candidates[0].accountFitScore > 0);
  assert.ok(result.candidates[0].matchedAccountTopics.includes("ai"));
  assert.equal(result.heatScored, true);
});

test("never invents views, viral probability, fact verification or draft eligibility", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "OpenAI unveils enterprise agent platform", "2026-08-21T12:00:00Z"),
  ]);
  const result = rankTopicCandidates(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(result.factsVerified, false);
  assert.equal(result.predictedViewsGenerated, false);
  assert.equal(result.viralProbabilityGenerated, false);
  assert.equal(result.accountMetricsUsed, false);
  assert.equal(result.humanSelectionUnlocked, false);
  assert.equal(result.candidates[0].predictedViews, null);
  assert.equal(result.candidates[0].viralProbability, null);
  assert.equal(result.candidates[0].selectableForDraft, false);
});

test("returns no score when clustering has no eligible cross-source candidate", () => {
  const clustering = buildTopicClusters([item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z")]);
  const result = rankTopicCandidates(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(result.status, "no_eligible_candidates");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.heatScored, false);
});

test("covers enabled media and company source categories without silently scoring them as zero", () => {
  assert.equal(DEFAULT_ACCOUNT_PROFILE.categoryWeights.ai_media, 1);
  assert.equal(DEFAULT_ACCOUNT_PROFILE.categoryWeights.tech_media, 0.4);
  assert.equal(DEFAULT_ACCOUNT_PROFILE.categoryWeights.company_technology, 0.4);

  const qbitaiFit = scoreAccountFit({ category: "ai_media", title: "具身智能进入真实产线", evidence: [] });
  assert.equal(qbitaiFit.breakdown.category, 60);
  assert.equal(qbitaiFit.score, 60);

  const unrelatedCompanyPost = scoreAccountFit({ category: "company_technology", title: "Community garden publishes meeting calendar", evidence: [] });
  assert.equal(unrelatedCompanyPost.score, 24);

  const coverage = assessProfileCategoryCoverage({ clusters: [
    { category: "ai_media" },
    { category: "tech_media" },
    { category: "company_technology" },
  ] });
  assert.deepEqual(coverage, { categoriesPresent: 3, mappedCategories: 3, unmappedCategories: [], complete: true });
});

test("reports unmapped categories instead of hiding taxonomy drift", () => {
  const coverage = assessProfileCategoryCoverage({ clusters: [{ category: "new_category" }] });
  assert.deepEqual(coverage, { categoriesPresent: 1, mappedCategories: 0, unmappedCategories: ["new_category"], complete: false });
});

test("wires ranking as a read-only route and console action", async () => {
  const [page, route, script] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/ranked-candidates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/preview-ranked-candidates.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /计算相对优先级（只读）/);
  assert.match(page, /fetch\("\/api\/news\/ranked-candidates"/);
  assert.match(route, /buildTopicWorkflowPreview/);
  assert.match(script, /buildTopicWorkflowPreview/);
  assert.match(page, /payload\.evidenceGapFallback/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
