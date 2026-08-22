import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_ABSOLUTE_DELTA = 0.05;
const REVIEWED_PROPOSAL_KEYS = Object.freeze([
  "currentWeight",
  "delta",
  "id",
  "meanSignal",
  "reviewChecks",
  "reviewDecision",
  "reviewNote",
  "reviewStatus",
  "scope",
  "status",
  "suggestedWeight",
  "uniqueIdeaCount",
]);
const REVIEW_CHECKS = Object.freeze([
  "deltaAndWeightBoundsReviewed",
  "noPredictionOrAutomaticUpdateAcknowledged",
  "sampleCountAndAggregationReviewed",
  "signalAndShrinkageReviewed",
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

function validReviewedProposal(proposal) {
  const approved = proposal?.reviewDecision === "approve_candidate_weight_change";
  const rejected = proposal?.reviewDecision === "reject_candidate_weight_change";
  return (
    exactKeys(proposal, REVIEWED_PROPOSAL_KEYS)
    && ["category", "topic"].includes(proposal?.scope)
    && SAFE_ID.test(proposal?.id ?? "")
    && Number.isFinite(proposal?.currentWeight)
    && proposal.currentWeight >= 0.5
    && proposal.currentWeight <= 1.5
    && Number.isFinite(proposal?.suggestedWeight)
    && proposal.suggestedWeight >= 0.5
    && proposal.suggestedWeight <= 1.5
    && Number.isFinite(proposal?.delta)
    && Math.abs(proposal.delta) <= MAX_ABSOLUTE_DELTA
    && proposal.suggestedWeight === rounded(clamp(proposal.currentWeight + proposal.delta, 0.5, 1.5))
    && Number.isSafeInteger(proposal?.uniqueIdeaCount)
    && proposal.uniqueIdeaCount >= 2
    && Number.isFinite(proposal?.meanSignal)
    && proposal.meanSignal >= 0
    && proposal.meanSignal <= 1
    && proposal?.status === "human_review_required_not_applied"
    && (approved || rejected)
    && typeof proposal?.reviewNote === "string"
    && proposal.reviewNote.length >= 1
    && proposal.reviewNote.length <= 280
    && exactKeys(proposal?.reviewChecks, REVIEW_CHECKS)
    && REVIEW_CHECKS.every((check) => proposal.reviewChecks[check] === true)
    && proposal?.reviewStatus === (approved
      ? "human_approved_candidate_not_applied"
      : "human_rejected_candidate_not_applied")
  );
}

function safeReviewConfirmation(value) {
  if (
    value?.status !== "topic_weight_update_review_confirmation_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.confirmedWeightUpdatePreviewFingerprint ?? "")
    || !HASH.test(value?.topicWeightUpdateReviewFingerprint ?? "")
    || !Array.isArray(value?.reviewedProposals)
    || value.reviewedProposals.length < 1
    || value?.reviewedProposalCount !== value.reviewedProposals.length
    || !Array.isArray(value?.approvedProposals)
    || value?.approvedProposalCount !== value.approvedProposals.length
    || value.approvedProposalCount < 1
    || value?.rejectedProposalCount !== value.reviewedProposals.length - value.approvedProposals.length
    || value?.humanWeightReviewCompleted !== true
    || value?.eligibleForLearningUpdateAuthorization !== true
    || value?.learningUpdateEligible !== false
    || value?.learningUpdateAuthorizationGranted !== false
    || value?.learningWeightsUpdated !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const identities = new Set();
  for (const proposal of value.reviewedProposals) {
    const identity = `${proposal?.scope}:${proposal?.id}`;
    if (!validReviewedProposal(proposal) || identities.has(identity)) return null;
    identities.add(identity);
  }
  const expectedApproved = value.reviewedProposals.filter(({ reviewDecision }) => reviewDecision === "approve_candidate_weight_change");
  if (JSON.stringify(value.approvedProposals) !== JSON.stringify(expectedApproved)) return null;
  const reviewPayload = {
    profileId: value.profileId,
    weightUpdatePreviewFingerprint: value.confirmedWeightUpdatePreviewFingerprint,
    reviewedProposals: value.reviewedProposals,
  };
  return hash(reviewPayload) === value.topicWeightUpdateReviewFingerprint ? expectedApproved : null;
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_update_authorization_preview_blocked",
    blockers: [],
    profileId: null,
    sourceReviewFingerprint: null,
    weightUpdateAuthorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    updateTargets: [],
    targetCount: 0,
    eligibleForExplicitLearningUpdateAuthorization: false,
    learningUpdateAuthorizationGranted: false,
    applicationAdapterImplemented: false,
    applicationPreflightCompleted: false,
    learningUpdateEligible: false,
    learningWeightsUpdated: false,
    configurationWrites: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildTopicWeightUpdateAuthorizationPreview(reviewConfirmation) {
  const approvedProposals = safeReviewConfirmation(reviewConfirmation);
  if (!approvedProposals) {
    return safeResult({ blockers: ["topic_weight_update_review_confirmation_invalid_or_no_approved_candidates"] });
  }

  const updateTargets = approvedProposals.map((proposal) => ({
    scope: proposal.scope,
    id: proposal.id,
    currentWeight: proposal.currentWeight,
    suggestedWeight: proposal.suggestedWeight,
    delta: proposal.delta,
    sourceUniqueIdeaCount: proposal.uniqueIdeaCount,
    sourceMeanSignal: proposal.meanSignal,
    operation: "apply_human_reviewed_weight_after_separate_authorization_and_preflight",
    targetStatus: "preview_only_not_authorized_not_implemented",
    requiresExactReviewFingerprint: true,
    requiresDurableAccountProfileStore: true,
    updateAllowed: false,
  }));
  const fingerprintPayload = {
    profileId: reviewConfirmation.profileId,
    sourceReviewFingerprint: reviewConfirmation.topicWeightUpdateReviewFingerprint,
    updateTargets,
  };
  const weightUpdateAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "topic_weight_update_authorization_preview_ready",
    ...fingerprintPayload,
    weightUpdateAuthorizationPreviewFingerprint,
    requiredConfirmation: `AUTHORIZE REVIEWED TOPIC WEIGHT UPDATE ${weightUpdateAuthorizationPreviewFingerprint}`,
    targetCount: updateTargets.length,
    eligibleForExplicitLearningUpdateAuthorization: true,
  });
}
