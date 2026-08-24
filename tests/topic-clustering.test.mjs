import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTopicClusters, gateTopicClusteringInput, titleSimilarity, tokenizeNewsTitle } from "../bridge/topic-clustering.mjs";

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

test("quality gate admits only registered, body-free RSS metadata from the last seven days", () => {
  const qualityItem = (id, freshnessStatus, ageHours, overrides = {}) => ({
    ...item(id, `source-${id}`, "OpenAI launches enterprise agent platform", `2026-08-${21- Math.floor(ageHours / 24)}T10:00:00Z`),
    metadataProvenanceReady: true,
    collectionScope: "rss_metadata_only",
    articleBodyFetched: false,
    freshnessStatus,
    ageHours,
    ...overrides,
  });
  const input = [
    qualityItem("fresh", "within_24_hours", 2),
    qualityItem("recent", "within_7_days", 120),
    qualityItem("old", "older_than_7_days", 240),
    qualityItem("missing", "timestamp_missing_or_invalid", null),
    qualityItem("future", "future_timestamp_requires_review", -3),
    qualityItem("unknown", "within_24_hours", 2, { metadataProvenanceReady: false }),
  ];
  const gate = gateTopicClusteringInput(input, { required: true });
  const result = buildTopicClusters(input, { requireMetadataQuality: true });

  assert.equal(gate.itemsReceived, 6);
  assert.equal(gate.itemsAccepted, 2);
  assert.equal(gate.itemsExcluded, 4);
  assert.deepEqual(gate.exclusionReasons, {
    older_than_7_days: 1,
    timestamp_missing_or_invalid: 1,
    future_timestamp_requires_review: 1,
    provenance_not_ready: 1,
  });
  assert.equal(result.summary.itemsConsidered, 2);
  assert.equal(result.inputQualityGate.required, true);
  assert.equal(result.inputQualityGate.itemsExcluded, 4);
  assert.equal(result.inputQualityGate.articleBodiesFetched, false);
  assert.equal(result.factsVerified, false);
});

test("wires clustering as a read-only route and console action", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/clusters/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /生成跨来源聚类（只读）/);
  assert.match(page, /fetch\("\/api\/news\/clusters"/);
  assert.match(route, /buildTopicClusters/);
  assert.match(route, /requireMetadataQuality:\s*true/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
