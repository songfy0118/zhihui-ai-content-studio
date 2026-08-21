import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../bridge/topic-clustering.mjs";

const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
const clustering = buildTopicClusters(preview.items);
console.log(JSON.stringify({
  fetchedAt: preview.fetchedAt,
  collection: preview.summary,
  sourceHealth: preview.sourceHealth,
  ...clustering,
  clusters: clustering.clusters.map(({ id, title, status, itemCount, sourceCount, sourceIds, firstSeenAt, lastSeenAt, meanSimilarity, eligibleForHotspotScoring }) => ({ id, title, status, itemCount, sourceCount, sourceIds, firstSeenAt, lastSeenAt, meanSimilarity, eligibleForHotspotScoring })),
  externalCalls: preview.externalCalls,
  databaseWrites: false,
  publishTriggered: false,
}, null, 2));
