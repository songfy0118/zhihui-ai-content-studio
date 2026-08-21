import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../bridge/rss-news-preview.mjs";

const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
const report = {
  ...preview,
  items: preview.items.map(({ sourceId, sourceName, title, canonicalUrl, publishedAt }) => ({ sourceId, sourceName, title, canonicalUrl, publishedAt })),
};

console.log(JSON.stringify(report, null, 2));
