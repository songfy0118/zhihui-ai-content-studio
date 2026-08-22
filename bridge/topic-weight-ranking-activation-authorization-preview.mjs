import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REVIEW_CHECK_KEYS = Object.freeze([
  "candidateIdentityAndOrderReviewed",
  "noPredictionOrAutomaticActivationAcknowledged",
  "scoreAndRankDeltaReviewed",
  "trendEvidenceUnchangedAcknowledged",
]);
const REVIEWED_CANDIDATE_KEYS = Object.freeze([
  "accountFitDelta",
  "baseAccountFitScore",
  "baseRank",
  "baseRelativePriorityScore",
  "category",
  "factsVerified",
  "id",
  "matchedAccountTopics",
  "predictedViews",
  "previewAccountFitScore",
  "previewRank",
  "previewRelativePriorityScore",
  "rankDelta",
  "relativePriorityDelta",
  "reviewChecks",
  "reviewNote",
  "reviewStatus",
  "selectableForDraft",
  "title",
  "trendEvidenceScore",
  "viralProbability",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function rounded(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function boundedScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function validReviewedCandidate(candidate, candidateCount) {
  return (
    exactKeys(candidate, REVIEWED_CANDIDATE_KEYS)
    && SAFE_ID.test(candidate?.id ?? "")
    && typeof candidate?.title === "string"
    && candidate.title.length >= 1
    && candidate.title.length <= 300
    && typeof candidate?.category === "string"
    && candidate.category.length >= 1
    && candidate.category.length <= 100
    && boundedScore(candidate?.trendEvidenceScore)
    && boundedScore(candidate?.baseAccountFitScore)
    && boundedScore(candidate?.previewAccountFitScore)
    && candidate.accountFitDelta === rounded(candidate.previewAccountFitScore - candidate.baseAccountFitScore)
    && boundedScore(candidate?.baseRelativePriorityScore)
    && boundedScore(candidate?.previewRelativePriorityScore)
    && candidate.relativePriorityDelta === rounded(
      candidate.previewRelativePriorityScore - candidate.baseRelativePriorityScore,
    )
    && Number.isSafeInteger(candidate?.baseRank)
    && candidate.baseRank >= 1
    && candidate.baseRank <= candidateCount
    && Number.isSafeInteger(candidate?.previewRank)
    && candidate.previewRank >= 1
    && candidate.previewRank <= candidateCount
    && candidate.rankDelta === candidate.baseRank - candidate.previewRank
    && Array.isArray(candidate?.matchedAccountTopics)
    && candidate.matchedAccountTopics.length <= 20
    && candidate.matchedAccountTopics.every((topic) => typeof topic === "string" && topic.length <= 100)
    && candidate.predictedViews === null
    && candidate.viralProbability === null
    && candidate.factsVerified === false
    && candidate.selectableForDraft === false
    && typeof candidate?.reviewNote === "string"
    && candidate.reviewNote.length >= 1
    && candidate.reviewNote.length <= 280
    && exactKeys(candidate?.reviewChecks, REVIEW_CHECK_KEYS)
    && REVIEW_CHECK_KEYS.every((check) => candidate.reviewChecks[check] === true)
    && candidate?.reviewStatus === "human_reviewed_impact_not_activated"
  );
}

function safeAcceptedReview(value) {
  if (
    value?.status !== "topic_weight_ranking_impact_review_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.confirmedRankingImpactPreviewFingerprint ?? "")
    || !HASH.test(value?.rankingImpactReviewFingerprint ?? "")
    || value?.overallDecision !== "accept_ranking_impact_for_future_authorization"
    || typeof value?.overallReviewNote !== "string"
    || value.overallReviewNote.length < 1
    || value.overallReviewNote.length > 500
    || !Array.isArray(value?.reviewedCandidates)
    || value.reviewedCandidates.length < 1
    || value.reviewedCandidates.length > 50
    || value?.reviewedCandidateCount !== value.reviewedCandidates.length
    || value?.humanRankingImpactReviewCompleted !== true
    || value?.eligibleForRankingActivationAuthorization !== true
    || value?.rankingActivationAuthorizationGranted !== false
    || value?.productionRankingUpdated !== false
    || value?.rankingRouteChanged !== false
    || value?.databaseWrites !== false
    || value?.configurationWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const ids = new Set();
  const baseRanks = new Set();
  const previewRanks = new Set();
  for (const candidate of value.reviewedCandidates) {
    if (
      !validReviewedCandidate(candidate, value.reviewedCandidates.length)
      || ids.has(candidate.id)
      || baseRanks.has(candidate.baseRank)
      || previewRanks.has(candidate.previewRank)
    ) return null;
    ids.add(candidate.id);
    baseRanks.add(candidate.baseRank);
    previewRanks.add(candidate.previewRank);
  }
  const reviewPayload = {
    profileId: value.profileId,
    rankingImpactPreviewFingerprint: value.confirmedRankingImpactPreviewFingerprint,
    reviewedCandidates: value.reviewedCandidates,
    overallDecision: value.overallDecision,
    overallReviewNote: value.overallReviewNote,
  };
  return hash(reviewPayload) === value.rankingImpactReviewFingerprint ? value : null;
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_activation_authorization_preview_blocked",
    blockers: [],
    profileId: null,
    sourceReviewFingerprint: null,
    confirmedRankingImpactPreviewFingerprint: null,
    activationAuthorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    activationTarget: null,
    eligibleForExplicitRankingActivationAuthorization: false,
    rankingActivationAuthorizationGranted: false,
    activationAdapterImplemented: false,
    activationPreflightCompleted: false,
    liveMigrationVerified: false,
    rollbackPlanPrepared: false,
    productionRankingUpdated: false,
    rankingRouteChanged: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation) {
  const review = safeAcceptedReview(reviewConfirmation);
  if (!review) {
    return safeResult({ blockers: ["topic_weight_ranking_impact_review_invalid_or_not_accepted"] });
  }

  const activationTarget = {
    profileId: review.profileId,
    sourceReviewFingerprint: review.rankingImpactReviewFingerprint,
    rankingImpactPreviewFingerprint: review.confirmedRankingImpactPreviewFingerprint,
    operation: "activate_receipt_backed_account_weights_after_separate_authorization_and_preflight",
    targetStatus: "preview_only_not_authorized_not_implemented",
    requiresExactReviewFingerprint: true,
    requiresReceiptBackedWeightProjection: true,
    requiresLiveMigrationVerification: true,
    requiresReversibleRollout: true,
    activationAllowed: false,
  };
  const fingerprintPayload = {
    profileId: review.profileId,
    sourceReviewFingerprint: review.rankingImpactReviewFingerprint,
    confirmedRankingImpactPreviewFingerprint: review.confirmedRankingImpactPreviewFingerprint,
    activationTarget,
  };
  const activationAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "topic_weight_ranking_activation_authorization_preview_ready",
    ...fingerprintPayload,
    activationAuthorizationPreviewFingerprint,
    requiredConfirmation: `AUTHORIZE REVIEWED TOPIC WEIGHT RANKING ACTIVATION ${activationAuthorizationPreviewFingerprint}`,
    eligibleForExplicitRankingActivationAuthorization: true,
  });
}
