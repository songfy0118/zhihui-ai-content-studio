import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../../../../bridge/evidence-search-plan.mjs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { selectedIds?: unknown };
  if (!Array.isArray(body.selectedIds) || body.selectedIds.length === 0 || body.selectedIds.length > 3 || body.selectedIds.some((id) => typeof id !== "string" || id.length > 80)) {
    const plan = buildEvidenceSearchPlan([], Array.isArray(body.selectedIds) ? body.selectedIds : [], NEWS_SOURCE_CATALOG);
    return Response.json({ ...plan, externalCalls: 0 }, { status: 400 });
  }
  const preview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(preview.items);
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, body.selectedIds, NEWS_SOURCE_CATALOG);
  return Response.json({
    ...plan,
    fetchedAt: preview.fetchedAt,
    collection: preview.summary,
    queue: queue.summary,
    externalCalls: preview.externalCalls,
  }, { status: plan.readyForHumanResearchReview ? 200 : 409 });
}
