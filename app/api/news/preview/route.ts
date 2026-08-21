import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";

export async function GET() {
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  return Response.json(preview, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300",
    },
  });
}
