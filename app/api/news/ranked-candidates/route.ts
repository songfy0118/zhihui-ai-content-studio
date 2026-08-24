import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildTopicWorkflowPreview } from "../../../../bridge/topic-workflow-preview.mjs";

export async function GET() {
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(preview.items, { requireMetadataQuality: true });
  const ranking = buildTopicWorkflowPreview(clustering);
  return Response.json({
    ...ranking,
    fetchedAt: preview.fetchedAt,
    collection: preview.summary,
    clustering: clustering.summary,
    sourceHealth: preview.sourceHealth,
    externalCalls: preview.externalCalls,
    contentFetched: preview.contentFetched,
  }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" },
  });
}
