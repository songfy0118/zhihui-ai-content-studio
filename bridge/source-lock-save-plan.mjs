import { createHash } from "node:crypto";

function sourceRecord(evidence) {
  if (!evidence?.sourceId || !evidence?.canonicalUrl) return null;
  return {
    evidenceId: evidence.id,
    sourceId: evidence.sourceId,
    sourceName: evidence.sourceName,
    title: evidence.title,
    canonicalUrl: evidence.canonicalUrl,
    publishedAt: evidence.publishedAt,
  };
}

export function buildSourceLockSavePlan(reviewPreview, { confirmedReviewFingerprint = null } = {}) {
  const blockers = [];
  if (!reviewPreview?.readyForAuthorizedSourceLockSave || reviewPreview.status !== "evidence_review_preview_ready") blockers.push("evidence_review_not_ready");
  if (!reviewPreview?.reviewFingerprint) blockers.push("review_fingerprint_missing");
  if (!confirmedReviewFingerprint) blockers.push("review_fingerprint_confirmation_required");
  if (confirmedReviewFingerprint && confirmedReviewFingerprint !== reviewPreview?.reviewFingerprint) blockers.push("review_fingerprint_mismatch");
  const plannedLocks = (reviewPreview?.reviewedTargets ?? []).flatMap((target) => {
    const original = sourceRecord(target.originalEvidence);
    const candidate = sourceRecord(target.candidate);
    if (!target.eligibleForSourceLockProposal || !original || !candidate) {
      blockers.push(`review_target_not_eligible:${target.leadId}`);
      return [];
    }
    return [{
      leadId: target.leadId,
      title: target.title,
      reviewFingerprint: reviewPreview.reviewFingerprint,
      sources: [original, candidate],
      claimCount: 0,
      factsVerified: false,
      status: "planned_not_saved",
    }];
  });
  if (!plannedLocks.length) blockers.push("no_source_locks_planned");
  const ready = blockers.length === 0;
  const savePlanFingerprint = ready ? createHash("sha256").update(JSON.stringify({ reviewFingerprint: reviewPreview.reviewFingerprint, locks: plannedLocks })).digest("hex") : null;

  return {
    status: ready ? "source_lock_save_plan_ready" : "source_lock_save_plan_blocked",
    readyForAuthorizationRequest: ready,
    blockers,
    reviewFingerprint: reviewPreview?.reviewFingerprint ?? null,
    savePlanFingerprint,
    plannedRecordCount: plannedLocks.length,
    plannedLocks,
    authorizationRequired: true,
    authorizationGranted: false,
    singleUseAuthorizationRequired: true,
    writeAllowed: false,
    persisted: false,
    sourceLocksCreated: 0,
    factsVerified: false,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
