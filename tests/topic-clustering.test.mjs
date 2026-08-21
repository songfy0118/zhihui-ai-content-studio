import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTopicClusters, titleSimilarity, tokenizeNewsTitle } from "../bridge/topic-clustering.mjs";

function item(id, sourceId, title, publishedAt) {
  return { id, sourceId, sourceName: sourceId, title, canonicalUrl: `https://${sourceId}.example/${id}`, publishedAt, category: "ai" };
}

test("tokenizes English words and Chinese bigrams deterministically", () => {
  assert.deepEqual([...tokenizeNewsTitle("The OpenAI agent, in 2026!")], ["openai", "agent", "2026"]);
  assert.ok(tokenizeNewsTitle("谷歌发布全新AI模型").has("谷歌"));
  assert.ok(titleSimilarity("谷歌发布AI模型Gemini新版本", "谷歌发布AI模型Gemini升级版") >= 0.38);
});

test("marks a recent two-source cluster eligible without calling it verified or hot", () => {
  const result = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "OpenAI unveils enterprise agent platform", "2026-08-21T12:00:00Z"),
  ]);
  assert.equal(result.summary.clusterCount, 1);
  assert.equal(result.summary.eligibleCandidates, 1);
  assert.equal(result.clusters[0].sourceCount, 2);
  assert.equal(result.clusters[0].timeWindowVerified, true);
  assert.equal(result.factsVerified, false);
  assert.equal(result.heatScored, false);
});

test("does not make old, undated, single-source or unrelated reports eligible", () => {
  const result = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-01T10:00:00Z"),
    item("b", "source-b", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("c", "source-a", "Chip demand changes cloud spending", null),
    item("d", "source-a", "Federal Reserve publishes meeting calendar", "2026-08-21T09:00:00Z"),
  ]);
  assert.equal(result.summary.eligibleCandidates, 0);
  assert.equal(result.clusters.every((cluster) => cluster.eligibleForHotspotScoring === false), true);
});

test("wires clustering as a read-only route and console action", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/clusters/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /生成跨来源聚类（只读）/);
  assert.match(page, /fetch\("\/api\/news\/clusters"/);
  assert.match(route, /buildTopicClusters/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
