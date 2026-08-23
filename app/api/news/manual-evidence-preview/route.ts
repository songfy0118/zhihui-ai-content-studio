import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../../../../bridge/evidence-search-plan.mjs";
import { buildManualPublicEvidencePreview } from "../../../../bridge/manual-public-evidence-preview.mjs";

type ManualInput = { leadId?: unknown; sourceName?: unknown; publisherRole?: unknown; title?: unknown; canonicalUrl?: unknown; publishedAt?: unknown };

function validString(value: unknown, minimum: number, maximum: number) {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function validInput(input: ManualInput) {
  return validString(input?.leadId, 1, 80)
    && validString(input?.sourceName, 2, 80)
    && ["original_publisher", "syndicated_or_repost"].includes(String(input?.publisherRole))
    && validString(input?.title, 8, 300)
    && validString(input?.canonicalUrl, 8, 2048)
    && validString(input?.publishedAt, 8, 40);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { selectedIds?: unknown; inputs?: unknown };
  const validSelections = Array.isArray(body.selectedIds) && body.selectedIds.length > 0 && body.selectedIds.length <= 3
    && body.selectedIds.every((id) => validString(id, 1, 80));
  const validInputs = Array.isArray(body.inputs) && body.inputs.length > 0 && body.inputs.length <= 3
    && body.inputs.every(validInput);
  if (!validSelections || !validInputs) {
    return Response.json({
      ...buildManualPublicEvidencePreview(null, []),
      blockers: ["invalid_manual_evidence_request"],
      externalCalls: 0,
    }, { status: 400 });
  }
  const feedPreview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(feedPreview.items);
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, body.selectedIds, NEWS_SOURCE_CATALOG);
  const preview = buildManualPublicEvidencePreview(plan, body.inputs);
  return Response.json({
    ...preview,
    fetchedAt: feedPreview.fetchedAt,
    collection: feedPreview.summary,
    externalCalls: feedPreview.externalCalls,
  }, { status: preview.readyForHumanEvidenceReview ? 200 : 409 });
}
