import { createHash } from "node:crypto";

import {
  fingerprintTopicWeightRankingLiveReadPlan,
} from "./topic-weight-ranking-live-read-plan.mjs";
import {
  fingerprintTopicWeightRankingReadEvidenceReview,
} from "./topic-weight-ranking-read-evidence-review-gate.mjs";

const HASH = /^[a-f0-9]{64}$/;
const MUTATING_SQL = /\b(?:ALTER|CREATE|DELETE|DROP|INSERT|REPLACE|TRUNCATE|UPDATE)\b/i;
const REVIEW_CHECK_KEYS = Object.freeze([
  "profileAndPlanMatchReviewed",
  "queryWhitelistCompletionReviewed",
  "receiptLinkageReviewed",
  "schemaEvidenceReviewed",
  "simulationNotLiveAcknowledged",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function validAcceptedReview(review) {
  return review?.status === "topic_weight_ranking_read_evidence_review_recorded"
    && review?.evidenceKind === "isolated_simulation_only"
    && HASH.test(review?.readEvidenceReviewFingerprint ?? "")
    && review.readEvidenceReviewFingerprint === fingerprintTopicWeightRankingReadEvidenceReview(review)
    && HASH.test(review?.sourceLiveReadPlanFingerprint ?? "")
    && HASH.test(review?.confirmedReadEvidencePreviewFingerprint ?? "")
    && exactKeys(review?.reviewChecks, REVIEW_CHECK_KEYS)
    && REVIEW_CHECK_KEYS.every((key) => review.reviewChecks[key] === true)
    && Array.isArray(review?.reviewedWeights)
    && review.reviewedWeights.length >= 1
    && review.reviewedWeightCount === review.reviewedWeights.length
    && review.reviewedWeights.every((weight) => (
      weight?.reviewDecision === "evidence_consistent"
      && weight?.reviewStatus === "human_reviewed_isolated_evidence_not_activated"
    ))
    && review?.overallDecision === "accept_isolated_read_evidence_review"
    && review?.humanReviewCompleted === true
    && review?.isolatedEvidenceAccepted === true
    && review?.liveD1EvidenceAvailable === false
    && review?.eligibleForLiveD1AuthorizationRequest === false
    && review?.liveD1ReadAuthorizationGranted === false
    && review?.eligibleForRankingActivation === false
    && review?.rankingActivationAuthorizationGranted === false
    && review?.rankingWeightsApplied === false
    && review?.learningWeightsUpdated === false
    && review?.reviewPersisted === false
    && review?.databaseWrites === false
    && review?.configurationWrites === false
    && review?.filesystemMutations === false
    && review?.externalCalls === false
    && review?.permissionExpansionRequested === false
    && review?.credentialsRequested === false
    && review?.publishTriggered === false
    && review?.businessResult === false;
}

function validPlan(plan, review) {
  if (
    plan?.status !== "topic_weight_ranking_live_read_plan_ready"
    || !HASH.test(plan?.liveReadPlanFingerprint ?? "")
    || plan.liveReadPlanFingerprint !== fingerprintTopicWeightRankingLiveReadPlan(plan)
    || plan.liveReadPlanFingerprint !== review?.sourceLiveReadPlanFingerprint
    || plan.profileId !== review?.profileId
    || plan.requestedBinding !== "DB"
    || plan.inspectionScope !== "live_d1_read_only"
    || plan.readOnlyStatementsOnly !== true
    || plan.queryCount !== 5
    || !Array.isArray(plan.queries)
    || plan.queries.length !== 5
    || plan.queries.filter(({ inspectsDataRows }) => inspectsDataRows === true).length !== 1
    || plan.executionImplemented !== false
    || plan.liveReadPerformed !== false
    || plan.databaseWrites !== false
    || plan.configurationWrites !== false
    || plan.filesystemMutations !== false
    || plan.externalCalls !== false
    || plan.permissionExpansionRequested !== false
    || plan.credentialsRequested !== false
    || plan.publishTriggered !== false
    || plan.businessResult !== false
  ) return false;
  if (plan.queries.some(({ statement, params }) => (
    !/^\s*(?:SELECT|PRAGMA)\b/i.test(statement)
    || MUTATING_SQL.test(statement)
    || !Array.isArray(params)
    || params.some((value) => typeof value !== "string")
  ))) return false;
  const reviewedIdentities = review.reviewedWeights.map(({ scope, id }) => `${scope}:${id}`);
  const requestedIdentities = plan.requestedWeights?.map(({ scope, id }) => `${scope}:${id}`);
  return JSON.stringify(requestedIdentities) === JSON.stringify(reviewedIdentities);
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_live_read_authorization_preview_blocked",
    blockers: [],
    profileId: null,
    sourceLiveReadPlanFingerprint: null,
    sourceReadEvidenceReviewFingerprint: null,
    liveReadAuthorizationPreviewFingerprint: null,
    authorizationScope: null,
    zeroWriteGuarantees: null,
    requiredUserConfirmation: null,
    authorizationRequired: true,
    authorizationGranted: false,
    authorizationReceiptCreated: false,
    authorizationValidityMinutes: 15,
    maximumExecutionCount: 1,
    existingBindingRequired: true,
    credentialsRequested: false,
    permissionExpansionRequested: false,
    liveReadImplemented: false,
    liveReadPerformed: false,
    resultPersistenceAllowed: false,
    eligibleForRankingActivation: false,
    rankingActivationAuthorizationGranted: false,
    rankingWeightsApplied: false,
    learningWeightsUpdated: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildTopicWeightRankingLiveReadAuthorizationPreview({ plan, readEvidenceReview } = {}) {
  const blockers = [];
  if (!validAcceptedReview(readEvidenceReview)) {
    blockers.push("accepted_isolated_read_evidence_review_invalid_or_tampered");
  }
  if (!validPlan(plan, readEvidenceReview)) {
    blockers.push("topic_weight_ranking_live_read_plan_invalid_or_tampered");
  }
  if (blockers.length) return safeResult({ blockers });

  const authorizationScope = {
    targetBinding: "DB",
    accessMode: "read_only",
    purpose: "inspect_account_topic_weight_schema_and_receipt_backed_values",
    queryWhitelist: plan.queries.map(({ step, statement, params, inspectsDataRows }) => ({
      step,
      statement,
      params: [...params],
      inspectsDataRows,
    })),
    queryCount: plan.queryCount,
    requestedWeights: plan.requestedWeights.map((weight) => ({ ...weight })),
    oneTimeExecution: true,
    validityMinutes: 15,
    resultPersistence: "none",
    rankingMutation: "forbidden",
  };
  const zeroWriteGuarantees = {
    selectOrPragmaOnly: true,
    databaseWritesForbidden: true,
    configurationWritesForbidden: true,
    resultPersistenceForbidden: true,
    rankingChangesForbidden: true,
    platformActionsForbidden: true,
  };
  const fingerprintPayload = {
    profileId: plan.profileId,
    sourceLiveReadPlanFingerprint: plan.liveReadPlanFingerprint,
    sourceReadEvidenceReviewFingerprint: readEvidenceReview.readEvidenceReviewFingerprint,
    authorizationScope,
    zeroWriteGuarantees,
  };
  const liveReadAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "topic_weight_ranking_live_read_authorization_preview_ready",
    ...fingerprintPayload,
    liveReadAuthorizationPreviewFingerprint,
    requiredUserConfirmation:
      `AUTHORIZE ONE LIVE D1 TOPIC WEIGHT READ ${liveReadAuthorizationPreviewFingerprint}`,
  });
}
