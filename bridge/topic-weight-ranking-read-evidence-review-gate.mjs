import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OVERALL_DECISIONS = new Set([
  "accept_isolated_read_evidence_review",
  "reject_isolated_read_evidence_review",
]);
const WEIGHT_DECISIONS = new Set([
  "evidence_consistent",
  "evidence_rejected",
]);
const CHECK_KEYS = Object.freeze([
  "profileAndPlanMatchReviewed",
  "queryWhitelistCompletionReviewed",
  "receiptLinkageReviewed",
  "schemaEvidenceReviewed",
  "simulationNotLiveAcknowledged",
]);
const WEIGHT_REVIEW_KEYS = Object.freeze([
  "decision",
  "delta",
  "id",
  "previousWeight",
  "reviewNote",
  "scope",
  "updateReceiptId",
  "weight",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function safePreview(value) {
  if (
    value?.status !== "topic_weight_ranking_read_evidence_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.evidenceKind !== "isolated_simulation_only"
    || !SAFE_ID.test(value?.profileId ?? "")
    || !HASH.test(value?.sourceLiveReadPlanFingerprint ?? "")
    || !HASH.test(value?.sourceIsolatedReadResultFingerprint ?? "")
    || !HASH.test(value?.readEvidencePreviewFingerprint ?? "")
    || value?.schemaEvidence?.storageStatus !== "verified"
    || value?.schemaEvidence?.storageVerified !== true
    || value?.schemaEvidence?.source !== "isolated_simulation"
    || value?.queryEvidence?.plannedQueryCount !== 5
    || value?.queryEvidence?.attemptedQueryCount !== 5
    || value?.queryEvidence?.completedQueryCount !== 5
    || value?.queryEvidence?.whitelistComplete !== true
    || value?.queryEvidence?.liveD1Queried !== false
    || !Array.isArray(value?.weightEvidence)
    || value.weightEvidence.length < 1
    || value.weightEvidence.length > 20
    || !Array.isArray(value?.reviewChecklist)
    || value.reviewChecklist.length !== 5
    || value.reviewChecklist.some((item) => item?.required !== true)
    || value?.requiredConfirmation !== `REVIEW ISOLATED TOPIC WEIGHT EVIDENCE ${value.readEvidencePreviewFingerprint}`
    || value?.humanReviewCompleted !== false
    || value?.liveD1EvidenceAvailable !== false
    || value?.eligibleForRankingActivation !== false
    || value?.rankingWeightsApplied !== false
    || value?.learningWeightsUpdated !== false
    || value?.databaseWrites !== false
    || value?.configurationWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.permissionExpansionRequested !== false
    || value?.credentialsRequested !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const identities = new Set();
  for (const weight of value.weightEvidence) {
    const weightIdentity = `${weight?.scope}:${weight?.id}`;
    if (
      weight?.profileId !== value.profileId
      || !["category", "topic"].includes(weight?.scope)
      || !SAFE_ID.test(weight?.id ?? "")
      || identities.has(weightIdentity)
      || !Number.isFinite(weight?.previousWeight)
      || !Number.isFinite(weight?.weight)
      || !Number.isFinite(weight?.delta)
      || !HASH.test(weight?.sourceReviewFingerprint ?? "")
      || !HASH.test(weight?.authorizationPreviewFingerprint ?? "")
      || typeof weight?.updateReceiptId !== "string"
      || weight?.integrityStatus !== "complete_active_update_receipt_read_only"
    ) return null;
    identities.add(weightIdentity);
  }
  const fingerprintPayload = {
    evidenceKind: value.evidenceKind,
    profileId: value.profileId,
    sourceLiveReadPlanFingerprint: value.sourceLiveReadPlanFingerprint,
    sourceIsolatedReadResultFingerprint: value.sourceIsolatedReadResultFingerprint,
    schemaEvidence: value.schemaEvidence,
    queryEvidence: value.queryEvidence,
    weightEvidence: value.weightEvidence,
  };
  return hash(fingerprintPayload) === value.readEvidencePreviewFingerprint
    ? value.weightEvidence
    : null;
}

function safeWeightReviews(value, weightEvidence) {
  if (!Array.isArray(value) || value.length !== weightEvidence.length) return null;
  const reviewedWeights = [];
  for (const [index, weight] of weightEvidence.entries()) {
    const review = value[index];
    if (
      !exactKeys(review, WEIGHT_REVIEW_KEYS)
      || review?.scope !== weight.scope
      || review?.id !== weight.id
      || review?.previousWeight !== weight.previousWeight
      || review?.weight !== weight.weight
      || review?.delta !== weight.delta
      || review?.updateReceiptId !== weight.updateReceiptId
      || !WEIGHT_DECISIONS.has(review?.decision)
      || typeof review?.reviewNote !== "string"
      || review.reviewNote.length < 1
      || review.reviewNote.length > 280
    ) return null;
    reviewedWeights.push({
      ...weight,
      reviewDecision: review.decision,
      reviewNote: review.reviewNote,
      reviewStatus: review.decision === "evidence_consistent"
        ? "human_reviewed_isolated_evidence_not_activated"
        : "human_rejected_isolated_evidence_not_activated",
    });
  }
  return reviewedWeights;
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_read_evidence_review_blocked",
    blockers: [],
    evidenceKind: "isolated_simulation_only",
    profileId: null,
    confirmedReadEvidencePreviewFingerprint: null,
    readEvidenceReviewFingerprint: null,
    reviewedWeights: [],
    reviewedWeightCount: 0,
    overallDecision: null,
    overallReviewNote: null,
    humanReviewCompleted: false,
    isolatedEvidenceAccepted: false,
    liveD1EvidenceAvailable: false,
    eligibleForLiveD1AuthorizationRequest: false,
    liveD1ReadAuthorizationGranted: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    reviewPersisted: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    permissionExpansionRequested: false,
    credentialsRequested: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function assessTopicWeightRankingReadEvidenceReview({
  preview,
  reviewRequested = false,
  confirmation = null,
  confirmedReadEvidencePreviewFingerprint = null,
  checks = null,
  weightReviews = null,
  overallDecision = null,
  overallReviewNote = null,
} = {}) {
  const blockers = [];
  const weightEvidence = safePreview(preview);
  if (!weightEvidence) blockers.push("topic_weight_ranking_read_evidence_preview_invalid_or_tampered");
  if (reviewRequested !== true) blockers.push("topic_weight_ranking_read_evidence_review_not_requested");
  if (confirmation !== preview?.requiredConfirmation) {
    blockers.push("topic_weight_ranking_read_evidence_review_confirmation_invalid");
  }
  if (confirmedReadEvidencePreviewFingerprint !== preview?.readEvidencePreviewFingerprint) {
    blockers.push("topic_weight_ranking_read_evidence_preview_fingerprint_mismatch");
  }
  if (!exactKeys(checks, CHECK_KEYS) || CHECK_KEYS.some((check) => checks[check] !== true)) {
    blockers.push("topic_weight_ranking_read_evidence_checks_invalid_or_incomplete");
  }
  const reviewedWeights = weightEvidence ? safeWeightReviews(weightReviews, weightEvidence) : null;
  if (!reviewedWeights) blockers.push("topic_weight_ranking_read_evidence_weight_reviews_invalid_or_incomplete");
  if (!OVERALL_DECISIONS.has(overallDecision)) {
    blockers.push("topic_weight_ranking_read_evidence_overall_decision_invalid");
  }
  if (typeof overallReviewNote !== "string" || overallReviewNote.length < 1 || overallReviewNote.length > 500) {
    blockers.push("topic_weight_ranking_read_evidence_overall_note_invalid");
  }
  if (
    overallDecision === "accept_isolated_read_evidence_review"
    && reviewedWeights?.some(({ reviewDecision }) => reviewDecision !== "evidence_consistent")
  ) blockers.push("topic_weight_ranking_read_evidence_acceptance_conflicts_with_weight_rejection");
  if (blockers.length || !reviewedWeights) return safeResult({ blockers: [...new Set(blockers)] });

  const reviewPayload = {
    evidenceKind: preview.evidenceKind,
    profileId: preview.profileId,
    readEvidencePreviewFingerprint: preview.readEvidencePreviewFingerprint,
    checks,
    reviewedWeights,
    overallDecision,
    overallReviewNote,
  };
  return safeResult({
    status: "topic_weight_ranking_read_evidence_review_recorded",
    profileId: preview.profileId,
    confirmedReadEvidencePreviewFingerprint: preview.readEvidencePreviewFingerprint,
    readEvidenceReviewFingerprint: hash(reviewPayload),
    reviewedWeights,
    reviewedWeightCount: reviewedWeights.length,
    overallDecision,
    overallReviewNote,
    humanReviewCompleted: true,
    isolatedEvidenceAccepted: overallDecision === "accept_isolated_read_evidence_review",
  });
}
