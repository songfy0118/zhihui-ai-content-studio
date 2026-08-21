import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../../../../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../../../../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview } from "../../../../bridge/evidence-review-preview.mjs";

type ReviewDecision = { leadId?: unknown; candidateId?: unknown; checks?: unknown };

function validDecision(decision: ReviewDecision) {
  return typeof decision?.leadId === "string" && decision.leadId.length <= 80
    && typeof decision?.candidateId === "string" && decision.candidateId.length <= 100
    && typeof decision?.checks === "object" && decision.checks !== null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { selectedIds?: unknown; decisions?: unknown };
  const validSelections = Array.isArray(body.selectedIds) && body.selectedIds.length > 0 && body.selectedIds.length <= 3 && body.selectedIds.every((id) => typeof id === "string" && id.length <= 80);
  const validDecisions = Array.isArray(body.decisions) && body.decisions.length > 0 && body.decisions.length <= 3 && body.decisions.every(validDecision);
  if (!validSelections || !validDecisions) {
    return Response.json({ status: "evidence_review_preview_blocked", blockers: ["invalid_review_request"], persisted: false, sourceLockCreated: false, factsVerified: false, draftsUnlocked: 0, databaseWrites: false, publishTriggered: false, externalCalls: 0 }, { status: 400 });
  }
  const feedPreview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(feedPreview.items);
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, body.selectedIds, NEWS_SOURCE_CATALOG);
  const metadataPreview = buildEvidenceMetadataPreview(plan, feedPreview.items);
  const reviewPreview = buildEvidenceReviewPreview(plan, metadataPreview, body.decisions);
  return Response.json({ ...reviewPreview, fetchedAt: feedPreview.fetchedAt, externalCalls: feedPreview.externalCalls }, { status: reviewPreview.readyForAuthorizedSourceLockSave ? 200 : 409 });
}
