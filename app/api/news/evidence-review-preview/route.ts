import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../../../../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../../../../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview } from "../../../../bridge/evidence-review-preview.mjs";
import { buildManualPublicEvidencePreview } from "../../../../bridge/manual-public-evidence-preview.mjs";

type ReviewDecision = { leadId?: unknown; candidateId?: unknown; checks?: unknown };
type ManualInput = { leadId?: unknown; sourceName?: unknown; publisherRole?: unknown; title?: unknown; canonicalUrl?: unknown; publishedAt?: unknown };

function validDecision(decision: ReviewDecision) {
  return typeof decision?.leadId === "string" && decision.leadId.length <= 80
    && typeof decision?.candidateId === "string" && decision.candidateId.length <= 100
    && typeof decision?.checks === "object" && decision.checks !== null;
}

function validString(value: unknown, minimum: number, maximum: number) {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function validManualInput(input: ManualInput) {
  return validString(input?.leadId, 1, 80)
    && validString(input?.sourceName, 2, 80)
    && ["original_publisher", "syndicated_or_repost"].includes(String(input?.publisherRole))
    && validString(input?.title, 8, 300)
    && validString(input?.canonicalUrl, 8, 2048)
    && validString(input?.publishedAt, 8, 40);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { selectedIds?: unknown; decisions?: unknown; manualInputs?: unknown };
  const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
  const manualInputs = Array.isArray(body.manualInputs) ? body.manualInputs : [];
  const validSelections = selectedIds.length > 0 && selectedIds.length <= 3 && selectedIds.every((id) => typeof id === "string" && id.length <= 80);
  const validDecisions = Array.isArray(body.decisions) && body.decisions.length > 0 && body.decisions.length <= 3 && body.decisions.every(validDecision);
  const manualEvidenceUsed = manualInputs.length > 0;
  const validManualInputs = !manualEvidenceUsed || (selectedIds.length === 1 && manualInputs.length === 1 && manualInputs.every(validManualInput));
  if (!validSelections || !validDecisions || !validManualInputs) {
    return Response.json({
      ...buildEvidenceReviewPreview(null, null, []),
      blockers: ["invalid_review_request"],
      manualEvidenceUsed: false,
      externalCalls: 0,
    }, { status: 400 });
  }
  const feedPreview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(feedPreview.items, { requireMetadataQuality: true });
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, selectedIds, NEWS_SOURCE_CATALOG);
  const metadataPreview = manualEvidenceUsed
    ? buildManualPublicEvidencePreview(plan, manualInputs)
    : buildEvidenceMetadataPreview(plan, feedPreview.items, { requireQualityLineage: true });
  const reviewPreview = buildEvidenceReviewPreview(plan, metadataPreview, body.decisions);
  return Response.json({ ...reviewPreview, manualEvidenceUsed, fetchedAt: feedPreview.fetchedAt, externalCalls: feedPreview.externalCalls }, { status: reviewPreview.humanEvidenceReviewComplete ? 200 : 409 });
}
