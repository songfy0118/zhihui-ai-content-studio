import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../bridge/evidence-gap-queue.mjs";

const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
const clustering = buildTopicClusters(preview.items);
const queue = buildEvidenceGapQueue(clustering);

console.log(JSON.stringify({
  fetchedAt: preview.fetchedAt,
  collection: preview.summary,
  clustering: clustering.summary,
  ...queue,
  leads: queue.leads.map(({ evidence, suggestedQueries, ...lead }) => ({ ...lead, evidenceCount: evidence.length, suggestedQueries })),
  externalCalls: preview.externalCalls,
}, null, 2));
