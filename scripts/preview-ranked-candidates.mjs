import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildTopicWorkflowPreview } from "../bridge/topic-workflow-preview.mjs";

const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
const clustering = buildTopicClusters(preview.items);
const ranking = buildTopicWorkflowPreview(clustering);
const evidenceGapFallback = ranking.evidenceGapFallback
  ? { ...ranking.evidenceGapFallback, leads: ranking.evidenceGapFallback.leads.map(({ evidence, ...lead }) => ({ ...lead, evidenceCount: evidence.length })) }
  : null;

console.log(JSON.stringify({
  fetchedAt: preview.fetchedAt,
  collection: preview.summary,
  sourceHealth: preview.sourceHealth,
  ...ranking,
  candidates: ranking.candidates.map(({ evidence, ...candidate }) => ({ ...candidate, evidenceCount: evidence.length })),
  evidenceGapFallback,
  externalCalls: preview.externalCalls,
}, null, 2));
