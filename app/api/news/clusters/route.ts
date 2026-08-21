import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";

export async function GET() {
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(preview.items);
  return Response.json({
    ...clustering,
    fetchedAt: preview.fetchedAt,
    collection: preview.summary,
    sourceHealth: preview.sourceHealth,
    externalCalls: preview.externalCalls,
    contentFetched: preview.contentFetched,
  }, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300",
    },
  });
}
