import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";

export async function GET() {
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(preview.items);
  const queue = buildEvidenceGapQueue(clustering);
  return Response.json({
    ...queue,
    fetchedAt: preview.fetchedAt,
    collection: preview.summary,
    clustering: clustering.summary,
    sourceHealth: preview.sourceHealth,
    externalCalls: preview.externalCalls,
  }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" },
  });
}
