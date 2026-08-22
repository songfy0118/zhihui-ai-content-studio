import { createHash } from "node:crypto";

import { DEFAULT_ACCOUNT_PROFILE, rankTopicCandidates } from "./topic-ranking.mjs";

const HASH = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^atwu_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
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

function safeWeightProjection(value, profile) {
  if (
    value?.status !== "account_topic_weight_projection_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.profileId !== profile?.id
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
    const mapped = item?.scope === "category" ? categoryIds.has(item?.id) : item?.scope === "topic" && topicIds.has(item?.id);
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
  return value.weights;
}

function adjustedProfile(profile, weights) {
  const categoryWeights = { ...profile.categoryWeights };
  const topicWeightOverrides = new Map();
  for (const item of weights) {
    if (item.scope === "category") categoryWeights[item.id] = item.weight;
    else topicWeightOverrides.set(item.id, item.weight);
  }
  return {
    id: profile.id,
    label: profile.label,
    categoryWeights,
    topicGroups: profile.topicGroups.map((group) => ({
      ...group,
      weight: topicWeightOverrides.get(group.id) ?? group.weight,
    })),
  };
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_ranking_impact_preview_blocked",
    blockers: [],
    profileId: null,
    weightProjectionFingerprint: null,
    rankingImpactPreviewFingerprint: null,
    overrideCount: 0,
    candidates: [],
    candidateCount: 0,
    accountWeightProjectionUsed: false,
    accountMetricsUsedDirectly: false,
    productionRankingUpdated: false,
    rankingRouteChanged: false,
    predictedViewsGenerated: false,
    viralProbabilityGenerated: false,
    factsVerified: false,
    humanSelectionUnlocked: false,
    databaseWrites: false,
    configurationWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildTopicWeightRankingImpactPreview({
  clustering,
  weightProjection,
  profile = DEFAULT_ACCOUNT_PROFILE,
  now = new Date(),
} = {}) {
  const weights = safeWeightProjection(weightProjection, profile);
  if (!weights) return safeResult({ blockers: ["account_topic_weight_projection_invalid_or_unmapped"] });

  const baseRanking = rankTopicCandidates(clustering, { profile, now });
  const previewRanking = rankTopicCandidates(clustering, { profile: adjustedProfile(profile, weights), now });
  const baseById = new Map(baseRanking.candidates.map((candidate, index) => [candidate.id, { candidate, rank: index + 1 }]));
  const previewById = new Map(previewRanking.candidates.map((candidate, index) => [candidate.id, { candidate, rank: index + 1 }]));
  if (baseById.size !== previewById.size || [...baseById.keys()].some((id) => !previewById.has(id))) {
    return safeResult({ blockers: ["ranking_candidate_set_changed_unexpectedly"] });
  }

  const candidates = baseRanking.candidates.map((candidate) => {
    const base = baseById.get(candidate.id);
    const preview = previewById.get(candidate.id);
    return {
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      trendEvidenceScore: candidate.trendEvidenceScore,
      baseAccountFitScore: candidate.accountFitScore,
      previewAccountFitScore: preview.candidate.accountFitScore,
      accountFitDelta: rounded(preview.candidate.accountFitScore - candidate.accountFitScore, 1),
      baseRelativePriorityScore: candidate.relativePriorityScore,
      previewRelativePriorityScore: preview.candidate.relativePriorityScore,
      relativePriorityDelta: rounded(preview.candidate.relativePriorityScore - candidate.relativePriorityScore, 1),
      baseRank: base.rank,
      previewRank: preview.rank,
      rankDelta: base.rank - preview.rank,
      matchedAccountTopics: preview.candidate.matchedAccountTopics,
      predictedViews: null,
      viralProbability: null,
      factsVerified: false,
      selectableForDraft: false,
    };
  });
  const weightProjectionFingerprint = hash(weights);
  const fingerprintPayload = {
    profileId: profile.id,
    weightProjectionFingerprint,
    candidates,
  };
  return safeResult({
    status: candidates.length ? "topic_weight_ranking_impact_preview_ready" : "topic_weight_ranking_impact_no_eligible_candidates",
    profileId: profile.id,
    weightProjectionFingerprint,
    rankingImpactPreviewFingerprint: hash(fingerprintPayload),
    overrideCount: weights.length,
    candidates,
    candidateCount: candidates.length,
    accountWeightProjectionUsed: true,
  });
}
