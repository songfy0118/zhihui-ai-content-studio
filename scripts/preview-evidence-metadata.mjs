import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";

const selectedIds = process.argv.slice(2);
if (!selectedIds.length) {
  const plan = buildEvidenceSearchPlan([], [], NEWS_SOURCE_CATALOG);
  console.log(JSON.stringify({ ...buildEvidenceMetadataPreview(plan, []), externalCalls: 0 }, null, 2));
} else {
  const feedPreview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(feedPreview.items, { requireMetadataQuality: true });
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, selectedIds, NEWS_SOURCE_CATALOG);
  console.log(JSON.stringify({ ...buildEvidenceMetadataPreview(plan, feedPreview.items), externalCalls: feedPreview.externalCalls }, null, 2));
}
