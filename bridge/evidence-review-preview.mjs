import { createHash } from "node:crypto";

export const EVIDENCE_REVIEW_CHECKS = Object.freeze([
  "same_event_confirmed",
  "source_independence_confirmed",
  "publisher_relationship_checked",
  "syndication_or_citation_chain_checked",
  "dates_consistent",
  "no_material_conflict_found",
]);

function host(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildEvidenceReviewPreview(plan, metadataPreview, decisions = [], { downstreamSaveSupported = true, downstreamBlocker = null } = {}) {
  const blockers = [];
  if (!plan?.readyForHumanResearchReview || !plan.planFingerprint) blockers.push("search_plan_not_ready");
  if (!metadataPreview || metadataPreview.planFingerprint !== plan?.planFingerprint) blockers.push("metadata_preview_not_current");
  if (!Array.isArray(decisions) || !decisions.length) blockers.push("review_decisions_empty");
  const decisionMap = new Map();
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (!decision?.leadId || decisionMap.has(decision.leadId)) {
      blockers.push(`review_decision_invalid:${decision?.leadId ?? "missing"}`);
      continue;
    }
    decisionMap.set(decision.leadId, decision);
  }

  const reviewedTargets = (plan?.targets ?? []).map((target) => {
    const decision = decisionMap.get(target.leadId);
    const previewTarget = metadataPreview?.targets?.find((candidateTarget) => candidateTarget.leadId === target.leadId);
    const candidate = previewTarget?.candidates?.find((item) => item.id === decision?.candidateId);
    const targetBlockers = [];
    if (!decision) targetBlockers.push("decision_missing");
    if (decision && !candidate) targetBlockers.push("candidate_not_current");
    const originalEvidence = target.originalEvidence?.[0] ?? null;
    if (!originalEvidence?.canonicalUrl) targetBlockers.push("original_evidence_missing");
    const originalHost = host(originalEvidence?.canonicalUrl);
    const candidateHost = host(candidate?.canonicalUrl);
    if (candidate && (!originalHost || !candidateHost || originalHost === candidateHost)) targetBlockers.push("independent_host_not_confirmed");
    const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, decision?.checks?.[check] === true]));
    for (const check of EVIDENCE_REVIEW_CHECKS) {
      if (!checks[check]) targetBlockers.push(`human_check_missing:${check}`);
    }
    return {
      leadId: target.leadId,
      title: target.title,
      originalEvidence,
      candidate: candidate ?? null,
      checks,
      independenceAssessment: {
        automaticScope: "exact_normalized_host_only",
        originalHost,
        candidateHost,
        exactHostDifferent: Boolean(originalHost && candidateHost && originalHost !== candidateHost),
        publisherRelationshipChecked: checks.publisher_relationship_checked,
        syndicationOrCitationChainChecked: checks.syndication_or_citation_chain_checked,
      },
      blockers: targetBlockers,
      eligibleForSourceLockProposal: targetBlockers.length === 0,
    };
  });
  blockers.push(...reviewedTargets.flatMap((target) => target.blockers.map((blocker) => `${target.leadId}:${blocker}`)));
  const reviewComplete = blockers.length === 0 && reviewedTargets.length > 0;
  const reviewFingerprint = reviewComplete ? createHash("sha256").update(JSON.stringify({
    planFingerprint: plan.planFingerprint,
    targets: reviewedTargets.map((target) => ({ leadId: target.leadId, original: target.originalEvidence.canonicalUrl, candidate: target.candidate.canonicalUrl, checks: target.checks })),
  })).digest("hex") : null;

  return {
    status: reviewComplete ? "evidence_review_preview_ready" : "evidence_review_preview_blocked",
    humanEvidenceReviewComplete: reviewComplete,
    readyForAuthorizedSourceLockSave: reviewComplete && downstreamSaveSupported,
    blockers,
    downstreamBlockers: reviewComplete && !downstreamSaveSupported ? [downstreamBlocker ?? "downstream_save_not_supported"] : [],
    planFingerprint: plan?.planFingerprint ?? null,
    reviewFingerprint,
    summary: {
      targetsRequired: plan?.targets?.length ?? 0,
      targetsReviewed: reviewedTargets.filter((target) => target.candidate).length,
      targetsEligible: reviewedTargets.filter((target) => target.eligibleForSourceLockProposal).length,
    },
    reviewedTargets,
    semanticReview: reviewComplete ? "human_confirmed_in_preview" : "incomplete",
    persisted: false,
    sourceLockCreated: false,
    factsVerified: false,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
