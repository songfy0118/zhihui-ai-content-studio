import { NEWS_SOURCE_CATALOG, NEWS_SOURCE_CATALOG_VERSION, summarizeNewsSourceCatalog, validateNewsSourceCatalog } from "../../../../bridge/news-source-catalog.mjs";

export async function GET() {
  const validation = validateNewsSourceCatalog();

  return Response.json({
    version: NEWS_SOURCE_CATALOG_VERSION,
    status: validation.valid ? "catalog_ready" : "catalog_blocked",
    summary: summarizeNewsSourceCatalog(),
    sources: NEWS_SOURCE_CATALOG,
    policy: {
      enabledSourcesRequireLogin: false,
      fullArticleRedistributionAllowed: false,
      attributionRequired: true,
      wechatAutomaticCollection: false,
      humanReviewRequired: true,
    },
    blockers: validation.blockers,
    contentFetched: false,
    externalCalls: false,
    databaseWrites: false,
    publishTriggered: false,
  }, { status: validation.valid ? 200 : 503 });
}
