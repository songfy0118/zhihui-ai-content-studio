import { createHash } from "node:crypto";

import {
  buildTopicWeightRankingActivationAuthorizationPreview,
} from "./topic-weight-ranking-activation-authorization-preview.mjs";
import { DEFAULT_ACCOUNT_PROFILE } from "./topic-ranking.mjs";
import {
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS,
  ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS,
} from "../db/account-topic-weight-storage-inspector.mjs";

const HASH = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^atwu_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const CONTEXT_KEYS = Object.freeze([
  "binding",
  "inspectedAt",
  "inspectionScope",
  "weightProjectionReadAt",
]);
const WEIGHT_KEYS = Object.freeze([
  "authorizationPreviewFingerprint",
  "delta",
  "id",
  "integrityStatus",
  "previousWeight",
  "profileId",
  "scope",
  "sourceMeanSignal",
  "sourceReviewFingerprint",
  "sourceUniqueIdeaCount",
  "updateReceiptId",
  "updatedAt",
  "weight",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...keys].sort());
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeImpactPreview(value, profileId) {
  if (
    value?.status !== "topic_weight_ranking_impact_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.profileId !== profileId
    || !HASH.test(value?.weightProjectionFingerprint ?? "")
    || !HASH.test(value?.rankingImpactPreviewFingerprint ?? "")
    || !Array.isArray(value?.candidates)
    || value.candidates.length < 1
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
  const fingerprintPayload = {
    profileId: value.profileId,
    weightProjectionFingerprint: value.weightProjectionFingerprint,
    candidates: value.candidates,
  };
  return hash(fingerprintPayload) === value.rankingImpactPreviewFingerprint ? value : null;
}

function safeWeightProjection(value, profile, expectedFingerprint) {
  if (
    value?.status !== "account_topic_weight_projection_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.profileId !== profile.id
    || !Array.isArray(value?.weights)
    || value.weights.length < 1
    || value.weights.length > 20
    || value?.weightCount !== value.weights.length
    || value?.complete !== true
    || value?.inspectedDataRows !== true
    || value?.eligibleForRankingWeightInput !== true
    || value?.rankingWeightsApplied !== false
    || value?.learningWeightsUpdated !== false
    || value?.databaseWrites !== false
    || value?.configurationWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const categoryIds = new Set(Object.keys(profile.categoryWeights ?? {}));
  const topicIds = new Set((profile.topicGroups ?? []).map(({ id }) => id));
  const identities = new Set();
  for (const item of value.weights) {
    const identity = `${item?.scope}:${item?.id}`;
    const mapped = item?.scope === "category"
      ? categoryIds.has(item?.id)
      : item?.scope === "topic" && topicIds.has(item?.id);
    if (
      !exactKeys(item, WEIGHT_KEYS)
      || item?.profileId !== profile.id
      || !mapped
      || !SAFE_ID.test(item?.id ?? "")
      || identities.has(identity)
      || !Number.isFinite(item?.weight)
      || item.weight < 0.5
      || item.weight > 1.5
      || !Number.isFinite(item?.previousWeight)
      || item.previousWeight < 0.5
      || item.previousWeight > 1.5
      || !Number.isFinite(item?.delta)
      || item.delta === 0
      || Math.abs(item.delta) > 0.05
      || item.weight !== rounded(item.previousWeight + item.delta)
      || !Number.isSafeInteger(item?.sourceUniqueIdeaCount)
      || item.sourceUniqueIdeaCount < 2
      || !Number.isFinite(item?.sourceMeanSignal)
      || item.sourceMeanSignal < 0
      || item.sourceMeanSignal > 1
      || !HASH.test(item?.sourceReviewFingerprint ?? "")
      || !HASH.test(item?.authorizationPreviewFingerprint ?? "")
      || !RECEIPT_ID.test(item?.updateReceiptId ?? "")
      || item.updateReceiptId !== `atwu_${item.authorizationPreviewFingerprint}`
      || !strictIso(item?.updatedAt)
      || item?.integrityStatus !== "complete_active_update_receipt_read_only"
    ) return null;
    identities.add(identity);
  }
  return hash(value.weights) === expectedFingerprint ? value : null;
}

function safeStorageInspection(value) {
  const expectedColumnCount = Object.values(ACCOUNT_TOPIC_WEIGHT_EXPECTED_COLUMNS)
    .reduce((total, columns) => total + columns.length, 0);
  return (
    value?.status === "verified"
    && value?.verified === true
    && Array.isArray(value?.blockers)
    && value.blockers.length === 0
    && Array.isArray(value?.missingObjects)
    && value.missingObjects.length === 0
    && Array.isArray(value?.missingColumns)
    && value.missingColumns.length === 0
    && value?.expectedObjectCount === ACCOUNT_TOPIC_WEIGHT_EXPECTED_OBJECTS.length
    && value?.expectedColumnCount === expectedColumnCount
    && value?.inspectedDataRows === false
    && value?.accountWeightsRead === false
    && value?.databaseWrites === false
    && value?.applyPerformed === false
    && value?.learningWeightsUpdated === false
    && value?.externalCalls === false
    && value?.publishTriggered === false
  );
}

function safeEvidenceContext(value, now) {
  if (
    !exactKeys(value, CONTEXT_KEYS)
    || value?.binding !== "DB"
    || value?.inspectionScope !== "live_d1_read_only"
    || !strictIso(value?.inspectedAt)
    || !strictIso(value?.weightProjectionReadAt)
  ) return false;
  const current = new Date(now).getTime();
  if (!Number.isFinite(current)) return false;
  return [value.inspectedAt, value.weightProjectionReadAt].every((timestamp) => {
    const observed = Date.parse(timestamp);
    return observed <= current && current - observed <= MAX_EVIDENCE_AGE_MS;
  });
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_activation_preflight_blocked",
    blockers: [],
    profileId: null,
    sourceAuthorizationPreviewFingerprint: null,
    sourceRankingImpactPreviewFingerprint: null,
    sourceWeightProjectionFingerprint: null,
    activationPreflightFingerprint: null,
    rollbackPlan: null,
    authorizationChainVerified: false,
    rankingImpactVerified: false,
    receiptBackedWeightsVerified: false,
    liveMigrationVerified: false,
    rollbackPlanPrepared: false,
    readyForExplicitActivationAuthorizationRequest: false,
    rankingActivationAuthorizationGranted: false,
    activationAdapterImplemented: false,
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

export function assessTopicWeightRankingActivationPreflight({
  authorizationPreview,
  reviewConfirmation,
  impactPreview,
  weightProjection,
  storageInspection,
  evidenceContext,
  profile = DEFAULT_ACCOUNT_PROFILE,
  now = new Date(),
} = {}) {
  const blockers = [];
  const rebuiltAuthorization = buildTopicWeightRankingActivationAuthorizationPreview(reviewConfirmation);
  const authorizationChainVerified = rebuiltAuthorization.status
    === "topic_weight_ranking_activation_authorization_preview_ready"
    && JSON.stringify(authorizationPreview) === JSON.stringify(rebuiltAuthorization);
  if (!authorizationChainVerified) blockers.push("ranking_activation_authorization_chain_invalid_or_tampered");

  const expectedProfileId = authorizationPreview?.profileId ?? null;
  const safeImpact = safeImpactPreview(impactPreview, expectedProfileId);
  const rankingImpactVerified = Boolean(
    safeImpact
    && safeImpact.rankingImpactPreviewFingerprint
      === authorizationPreview?.confirmedRankingImpactPreviewFingerprint,
  );
  if (!rankingImpactVerified) blockers.push("ranking_impact_preview_invalid_or_fingerprint_mismatch");

  const safeProjection = safeImpact
    ? safeWeightProjection(weightProjection, profile, safeImpact.weightProjectionFingerprint)
    : null;
  const contextVerified = safeEvidenceContext(evidenceContext, now);
  const receiptBackedWeightsVerified = Boolean(
    safeProjection
    && safeProjection.profileId === expectedProfileId
    && contextVerified,
  );
  if (!receiptBackedWeightsVerified) blockers.push("live_receipt_backed_weight_projection_required");

  const liveMigrationVerified = safeStorageInspection(storageInspection) && contextVerified;
  if (!liveMigrationVerified) blockers.push("live_topic_weight_storage_verification_required");

  const rollbackPlan = authorizationChainVerified ? {
    profileId: expectedProfileId,
    strategy: "restore_default_account_profile_in_memory",
    scope: "ranking_profile_resolution_only",
    preservesStoredWeights: true,
    requiresNoDataDeletion: true,
    dryRunRequired: true,
    rollbackExecutable: false,
    rollbackAuthorized: false,
  } : null;
  const rollbackPlanPrepared = rollbackPlan !== null;
  if (!rollbackPlanPrepared) blockers.push("ranking_activation_rollback_plan_unavailable");

  if (blockers.length) {
    return safeResult({
      blockers: [...new Set(blockers)],
      profileId: expectedProfileId,
      rollbackPlan,
      authorizationChainVerified,
      rankingImpactVerified,
      receiptBackedWeightsVerified,
      liveMigrationVerified,
      rollbackPlanPrepared,
    });
  }

  const fingerprintPayload = {
    profileId: expectedProfileId,
    sourceAuthorizationPreviewFingerprint: authorizationPreview.activationAuthorizationPreviewFingerprint,
    sourceRankingImpactPreviewFingerprint: impactPreview.rankingImpactPreviewFingerprint,
    sourceWeightProjectionFingerprint: impactPreview.weightProjectionFingerprint,
    evidenceContext,
    rollbackPlan,
  };
  return safeResult({
    status: "topic_weight_ranking_activation_preflight_ready",
    ...fingerprintPayload,
    activationPreflightFingerprint: hash(fingerprintPayload),
    authorizationChainVerified,
    rankingImpactVerified,
    receiptBackedWeightsVerified,
    liveMigrationVerified,
    rollbackPlanPrepared,
    readyForExplicitActivationAuthorizationRequest: true,
  });
}
