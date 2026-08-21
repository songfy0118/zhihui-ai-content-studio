import { NEWS_SOURCE_CATALOG } from "../../../../bridge/news-source-catalog.mjs";
import { buildRssNewsPreview } from "../../../../bridge/rss-news-preview.mjs";
import { buildTopicClusters } from "../../../../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue } from "../../../../bridge/evidence-gap-queue.mjs";
import { buildEvidenceSearchPlan } from "../../../../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../../../../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview } from "../../../../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../../../../bridge/source-lock-save-plan.mjs";

type ReviewDecision = { leadId?: unknown; candidateId?: unknown; checks?: unknown };

function validDecision(decision: ReviewDecision) {
  return typeof decision?.leadId === "string" && decision.leadId.length <= 80
    && typeof decision?.candidateId === "string" && decision.candidateId.length <= 100
    && typeof decision?.checks === "object" && decision.checks !== null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { selectedIds?: unknown; decisions?: unknown; confirmedReviewFingerprint?: unknown };
  const validSelections = Array.isArray(body.selectedIds) && body.selectedIds.length > 0 && body.selectedIds.length <= 3 && body.selectedIds.every((id) => typeof id === "string" && id.length <= 80);
  const validDecisions = Array.isArray(body.decisions) && body.decisions.length > 0 && body.decisions.length <= 3 && body.decisions.every(validDecision);
  const validFingerprint = typeof body.confirmedReviewFingerprint === "string" && /^[a-f0-9]{64}$/.test(body.confirmedReviewFingerprint);
  if (!validSelections || !validDecisions || !validFingerprint) {
    return Response.json({ status: "source_lock_save_plan_blocked", blockers: ["invalid_save_plan_request"], authorizationRequired: true, authorizationGranted: false, writeAllowed: false, persisted: false, sourceLocksCreated: 0, factsVerified: false, draftsUnlocked: 0, databaseWrites: false, publishTriggered: false, externalCalls: 0 }, { status: 400 });
  }
  const feedPreview = await buildRssNewsPreview({ sources: NEWS_SOURCE_CATALOG });
  const clustering = buildTopicClusters(feedPreview.items);
  const queue = buildEvidenceGapQueue(clustering);
  const plan = buildEvidenceSearchPlan(queue.leads, body.selectedIds, NEWS_SOURCE_CATALOG);
  const metadataPreview = buildEvidenceMetadataPreview(plan, feedPreview.items);
  const reviewPreview = buildEvidenceReviewPreview(plan, metadataPreview, body.decisions);
  const savePlan = buildSourceLockSavePlan(reviewPreview, { confirmedReviewFingerprint: body.confirmedReviewFingerprint });
  return Response.json({ ...savePlan, fetchedAt: feedPreview.fetchedAt, externalCalls: feedPreview.externalCalls }, { status: savePlan.readyForAuthorizationRequest ? 200 : 409 });
}
