import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";

const selectedIds = process.argv.slice(2);
if (!selectedIds.length) {
  console.log(JSON.stringify({ ...buildEvidenceSearchPlan([], [], NEWS_SOURCE_CATALOG), externalCalls: 0 }, null, 2));
} else {
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(preview.items);
  const queue = buildEvidenceGapQueue(clustering);
  console.log(JSON.stringify({ ...buildEvidenceSearchPlan(queue.leads, selectedIds, NEWS_SOURCE_CATALOG), externalCalls: preview.externalCalls }, null, 2));
}
