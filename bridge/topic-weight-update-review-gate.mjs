import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_ABSOLUTE_DELTA = 0.05;
const REVIEW_DECISIONS = new Set(["approve_candidate_weight_change", "reject_candidate_weight_change"]);
const CHECK_KEYS = Object.freeze([
  "deltaAndWeightBoundsReviewed",
  "noPredictionOrAutomaticUpdateAcknowledged",
  "sampleCountAndAggregationReviewed",
  "signalAndShrinkageReviewed",
]);
const DECISION_KEYS = Object.freeze([
  "checks",
  "currentWeight",
  "decision",
  "delta",
  "id",
  "meanSignal",
  "reviewNote",
  "scope",
  "suggestedWeight",
  "uniqueIdeaCount",
]);
const PROPOSAL_KEYS = Object.freeze([
  "currentWeight",
  "delta",
  "id",
  "meanSignal",
  "status",
  "suggestedWeight",
  "uniqueIdeaCount",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify(keys);
}

function validProposal(value) {
  return (
    exactKeys(value, PROPOSAL_KEYS)
    && SAFE_ID.test(value?.id ?? "")
    && Number.isFinite(value?.currentWeight)
    && value.currentWeight >= 0.5
    && value.currentWeight <= 1.5
    && Number.isFinite(value?.suggestedWeight)
    && value.suggestedWeight >= 0.5
    && value.suggestedWeight <= 1.5
    && Number.isFinite(value?.delta)
    && Math.abs(value.delta) <= MAX_ABSOLUTE_DELTA
    && value.suggestedWeight === rounded(clamp(value.currentWeight + value.delta, 0.5, 1.5))
    && Number.isSafeInteger(value?.uniqueIdeaCount)
    && value.uniqueIdeaCount >= 2
    && Number.isFinite(value?.meanSignal)
    && value.meanSignal >= 0
    && value.meanSignal <= 1
    && value?.status === "human_review_required_not_applied"
  );
}

function safePreview(value) {
  if (
    value?.status !== "topic_weight_update_human_review_pending"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.metricsProjectionFingerprint ?? "")
    || !HASH.test(value?.ideaMetadataFingerprint ?? "")
    || !HASH.test(value?.weightUpdatePreviewFingerprint ?? "")
    || !Array.isArray(value?.ideaOutcomes)
    || value.ideaOutcomes.length < 3
    || value?.uniqueIdeaCount !== value.ideaOutcomes.length
    || !Array.isArray(value?.categoryWeightProposals)
    || !Array.isArray(value?.topicWeightProposals)
    || value?.recommendationCount !== value.categoryWeightProposals.length + value.topicWeightProposals.length
    || value.recommendationCount < 1
    || value?.method?.version !== "bounded-outcome-calibration-v1"
    || value?.method?.aggregation !== "mean_per_idea_then_mean_per_weight"
    || value?.method?.minimumUniqueIdeas !== 3
    || value?.method?.minimumIdeasPerWeight !== 2
    || value?.method?.maximumAbsoluteDelta !== MAX_ABSOLUTE_DELTA
    || value?.accountMetricsUsed !== true
    || value?.predictedViewsGenerated !== false
    || value?.viralProbabilityGenerated !== false
    || value?.eligibleForHumanWeightReview !== true
    || value?.humanWeightReviewCompleted !== false
    || value?.learningUpdateEligible !== false
    || value?.learningUpdateAuthorizationGranted !== false
    || value?.learningWeightsUpdated !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const proposals = [
    ...value.categoryWeightProposals.map((proposal) => ({ scope: "category", proposal })),
    ...value.topicWeightProposals.map((proposal) => ({ scope: "topic", proposal })),
  ];
  const identities = new Set();
  for (const { scope, proposal } of proposals) {
    const identity = `${scope}:${proposal?.id}`;
    if (!validProposal(proposal) || identities.has(identity)) return null;
    identities.add(identity);
  }
  const fingerprintPayload = {
    profileId: value.profileId,
    metricsProjectionFingerprint: value.metricsProjectionFingerprint,
    ideaMetadataFingerprint: value.ideaMetadataFingerprint,
    ideaOutcomes: value.ideaOutcomes,
    categoryWeightProposals: value.categoryWeightProposals,
    topicWeightProposals: value.topicWeightProposals,
  };
  return hash(fingerprintPayload) === value.weightUpdatePreviewFingerprint ? proposals : null;
}

function safeDecisions(value, proposals) {
  if (!Array.isArray(value) || value.length !== proposals.length) return null;
  const reviewedProposals = [];
  for (const [index, expected] of proposals.entries()) {
    const decision = value[index];
    const proposal = expected.proposal;
    if (
      !exactKeys(decision, DECISION_KEYS)
      || decision?.scope !== expected.scope
      || decision?.id !== proposal.id
      || decision?.currentWeight !== proposal.currentWeight
      || decision?.suggestedWeight !== proposal.suggestedWeight
      || decision?.delta !== proposal.delta
      || decision?.uniqueIdeaCount !== proposal.uniqueIdeaCount
      || decision?.meanSignal !== proposal.meanSignal
      || !REVIEW_DECISIONS.has(decision?.decision)
      || typeof decision?.reviewNote !== "string"
      || decision.reviewNote.length < 1
      || decision.reviewNote.length > 280
      || !exactKeys(decision?.checks, CHECK_KEYS)
      || CHECK_KEYS.some((check) => decision.checks[check] !== true)
    ) return null;
    reviewedProposals.push({
      scope: expected.scope,
      ...proposal,
      reviewDecision: decision.decision,
      reviewNote: decision.reviewNote,
      reviewChecks: { ...decision.checks },
      reviewStatus: decision.decision === "approve_candidate_weight_change"
        ? "human_approved_candidate_not_applied"
        : "human_rejected_candidate_not_applied",
    });
  }
  return reviewedProposals;
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_update_review_confirmation_blocked",
    blockers: [],
    profileId: null,
    confirmedWeightUpdatePreviewFingerprint: null,
    topicWeightUpdateReviewFingerprint: null,
    reviewedProposals: [],
    reviewedProposalCount: 0,
    approvedProposals: [],
    approvedProposalCount: 0,
    rejectedProposalCount: 0,
    humanWeightReviewCompleted: false,
    eligibleForLearningUpdateAuthorization: false,
    learningUpdateEligible: false,
    learningUpdateAuthorizationGranted: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function assessTopicWeightUpdateReviewConfirmation({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedWeightUpdatePreviewFingerprint = null,
  decisions = null,
} = {}) {
  const blockers = [];
  const proposals = safePreview(preview);
  if (!proposals) blockers.push("topic_weight_update_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("topic_weight_update_review_not_requested");
  const requiredConfirmation = `REVIEW TOPIC WEIGHT UPDATE ${preview?.weightUpdatePreviewFingerprint}`;
  if (confirmation !== requiredConfirmation) blockers.push("topic_weight_update_review_confirmation_invalid");
  if (confirmedWeightUpdatePreviewFingerprint !== preview?.weightUpdatePreviewFingerprint) {
    blockers.push("topic_weight_update_preview_fingerprint_mismatch");
  }
  const reviewedProposals = proposals ? safeDecisions(decisions, proposals) : null;
  if (!reviewedProposals) blockers.push("topic_weight_update_review_decisions_invalid_or_incomplete");
  if (blockers.length || !reviewedProposals) return safeResult({ blockers: [...new Set(blockers)] });

  const approvedProposals = reviewedProposals.filter(({ reviewDecision }) => reviewDecision === "approve_candidate_weight_change");
  const reviewPayload = {
    profileId: preview.profileId,
    weightUpdatePreviewFingerprint: preview.weightUpdatePreviewFingerprint,
    reviewedProposals,
  };
  return safeResult({
    status: "topic_weight_update_review_confirmation_accepted",
    profileId: preview.profileId,
    confirmedWeightUpdatePreviewFingerprint: preview.weightUpdatePreviewFingerprint,
    topicWeightUpdateReviewFingerprint: hash(reviewPayload),
    reviewedProposals,
    reviewedProposalCount: reviewedProposals.length,
    approvedProposals,
    approvedProposalCount: approvedProposals.length,
    rejectedProposalCount: reviewedProposals.length - approvedProposals.length,
    humanWeightReviewCompleted: true,
    eligibleForLearningUpdateAuthorization: approvedProposals.length > 0,
  });
}
