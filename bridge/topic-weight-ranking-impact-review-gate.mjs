import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OVERALL_DECISIONS = new Set([
  "accept_ranking_impact_for_future_authorization",
  "reject_ranking_impact",
]);
const CHECK_KEYS = Object.freeze([
  "candidateIdentityAndOrderReviewed",
  "noPredictionOrAutomaticActivationAcknowledged",
  "scoreAndRankDeltaReviewed",
  "trendEvidenceUnchangedAcknowledged",
]);
const CANDIDATE_KEYS = Object.freeze([
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
  "selectableForDraft",
  "title",
  "trendEvidenceScore",
  "viralProbability",
]);
const REVIEW_KEYS = Object.freeze([
  "accountFitDelta",
  "baseRank",
  "candidateId",
  "checks",
  "previewRank",
  "relativePriorityDelta",
  "reviewNote",
  "title",
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

function validCandidate(candidate, candidateCount) {
  return (
    exactKeys(candidate, CANDIDATE_KEYS)
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
  );
}

function safePreview(value) {
  if (
    value?.status !== "topic_weight_ranking_impact_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.weightProjectionFingerprint ?? "")
    || !HASH.test(value?.rankingImpactPreviewFingerprint ?? "")
    || !Number.isSafeInteger(value?.overrideCount)
    || value.overrideCount < 1
    || value.overrideCount > 20
    || !Array.isArray(value?.candidates)
    || value.candidates.length < 1
    || value.candidates.length > 50
    || value?.candidateCount !== value.candidates.length
    || value?.accountWeightProjectionUsed !== true
    || value?.accountMetricsUsedDirectly !== false
    || value?.productionRankingUpdated !== false
    || value?.rankingRouteChanged !== false
    || value?.predictedViewsGenerated !== false
    || value?.viralProbabilityGenerated !== false
    || value?.factsVerified !== false
    || value?.humanSelectionUnlocked !== false
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
  for (const candidate of value.candidates) {
    if (
      !validCandidate(candidate, value.candidates.length)
      || ids.has(candidate.id)
      || baseRanks.has(candidate.baseRank)
      || previewRanks.has(candidate.previewRank)
    ) return null;
    ids.add(candidate.id);
    baseRanks.add(candidate.baseRank);
    previewRanks.add(candidate.previewRank);
  }
  const fingerprintPayload = {
    profileId: value.profileId,
    weightProjectionFingerprint: value.weightProjectionFingerprint,
    candidates: value.candidates,
  };
  return hash(fingerprintPayload) === value.rankingImpactPreviewFingerprint ? value.candidates : null;
}

function safeCandidateReviews(value, candidates) {
  if (!Array.isArray(value) || value.length !== candidates.length) return null;
  const reviewedCandidates = [];
  for (const [index, candidate] of candidates.entries()) {
    const review = value[index];
    if (
      !exactKeys(review, REVIEW_KEYS)
      || review?.candidateId !== candidate.id
      || review?.title !== candidate.title
      || review?.baseRank !== candidate.baseRank
      || review?.previewRank !== candidate.previewRank
      || review?.accountFitDelta !== candidate.accountFitDelta
      || review?.relativePriorityDelta !== candidate.relativePriorityDelta
      || typeof review?.reviewNote !== "string"
      || review.reviewNote.length < 1
      || review.reviewNote.length > 280
      || !exactKeys(review?.checks, CHECK_KEYS)
      || CHECK_KEYS.some((check) => review.checks[check] !== true)
    ) return null;
    reviewedCandidates.push({
      ...candidate,
      reviewNote: review.reviewNote,
      reviewChecks: { ...review.checks },
      reviewStatus: "human_reviewed_impact_not_activated",
    });
  }
  return reviewedCandidates;
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_impact_review_blocked",
    blockers: [],
    profileId: null,
    confirmedRankingImpactPreviewFingerprint: null,
    rankingImpactReviewFingerprint: null,
    overallDecision: null,
    overallReviewNote: null,
    reviewedCandidates: [],
    reviewedCandidateCount: 0,
    humanRankingImpactReviewCompleted: false,
    eligibleForRankingActivationAuthorization: false,
    rankingActivationAuthorizationGranted: false,
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

export function assessTopicWeightRankingImpactReview({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedRankingImpactPreviewFingerprint = null,
  candidateReviews = null,
  overallDecision = null,
  overallReviewNote = null,
} = {}) {
  const blockers = [];
  const candidates = safePreview(preview);
  if (!candidates) blockers.push("topic_weight_ranking_impact_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("topic_weight_ranking_impact_review_not_requested");
  const requiredConfirmation = `REVIEW TOPIC WEIGHT RANKING IMPACT ${preview?.rankingImpactPreviewFingerprint}`;
  if (confirmation !== requiredConfirmation) blockers.push("topic_weight_ranking_impact_review_confirmation_invalid");
  if (confirmedRankingImpactPreviewFingerprint !== preview?.rankingImpactPreviewFingerprint) {
    blockers.push("topic_weight_ranking_impact_preview_fingerprint_mismatch");
  }
  const reviewedCandidates = candidates ? safeCandidateReviews(candidateReviews, candidates) : null;
  if (!reviewedCandidates) blockers.push("topic_weight_ranking_impact_candidate_reviews_invalid_or_incomplete");
  if (!OVERALL_DECISIONS.has(overallDecision)) blockers.push("topic_weight_ranking_impact_overall_decision_invalid");
  if (typeof overallReviewNote !== "string" || overallReviewNote.length < 1 || overallReviewNote.length > 500) {
    blockers.push("topic_weight_ranking_impact_overall_note_invalid");
  }
  if (blockers.length || !reviewedCandidates) return safeResult({ blockers: [...new Set(blockers)] });

  const reviewPayload = {
    profileId: preview.profileId,
    rankingImpactPreviewFingerprint: preview.rankingImpactPreviewFingerprint,
    reviewedCandidates,
    overallDecision,
    overallReviewNote,
  };
  return safeResult({
    status: "topic_weight_ranking_impact_review_accepted",
    profileId: preview.profileId,
    confirmedRankingImpactPreviewFingerprint: preview.rankingImpactPreviewFingerprint,
    rankingImpactReviewFingerprint: hash(reviewPayload),
    overallDecision,
    overallReviewNote,
    reviewedCandidates,
    reviewedCandidateCount: reviewedCandidates.length,
    humanRankingImpactReviewCompleted: true,
    eligibleForRankingActivationAuthorization: overallDecision === "accept_ranking_impact_for_future_authorization",
  });
}
