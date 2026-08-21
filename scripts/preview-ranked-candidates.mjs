import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { rankTopicCandidates } from "../bridge/topic-ranking.mjs";

const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
const clustering = buildTopicClusters(preview.items);
const ranking = rankTopicCandidates(clustering);

console.log(JSON.stringify({
  fetchedAt: preview.fetchedAt,
  collection: preview.summary,
  sourceHealth: preview.sourceHealth,
  ...ranking,
  candidates: ranking.candidates.map(({ evidence, ...candidate }) => ({ ...candidate, evidenceCount: evidence.length })),
  externalCalls: preview.externalCalls,
}, null, 2));
