import { createHash } from "node:crypto";

import { DEFAULT_ACCOUNT_PROFILE } from "./topic-ranking.mjs";

const HASH = /^[a-f0-9]{64}$/;
const METRIC_ID = /^metric_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MIN_UNIQUE_IDEAS = 3;
const MIN_IDEAS_PER_WEIGHT = 2;
const MAX_ABSOLUTE_DELTA = 0.05;
const METADATA_KEYS = Object.freeze(["category", "ideaId", "matchedTopics"]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeProjection(value) {
  if (
    value?.status !== "platform_text_metrics_projection_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !Array.isArray(value?.metrics)
    || value.metrics.length < 1
    || value.metrics.length > 20
    || value?.metricCount !== value.metrics.length
    || value?.complete !== true
    || value?.realDataOnly !== true
    || value?.eligibleForWeightUpdatePreview !== true
    || value?.learningUpdateEligible !== false
    || value?.learningWeightsUpdated !== false
    || value?.inspectedDataRows !== true
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const metricIds = new Set();
  for (const metric of value.metrics) {
    if (
      !METRIC_ID.test(metric?.metricId ?? "")
      || metricIds.has(metric.metricId)
      || !SAFE_ID.test(metric?.ideaId ?? "")
      || !["xiaohongshu", "douyin"].includes(metric?.platform)
      || !HASH.test(metric?.contentFingerprint ?? "")
      || !HASH.test(metric?.sourceEvidenceFingerprint ?? "")
      || !["platform_api", "platform_export"].includes(metric?.sourceKind)
      || !Number.isSafeInteger(metric?.views)
      || metric.views < 0
      || ["likes", "comments", "shares", "saves", "followers"].some((counter) => !Number.isSafeInteger(metric?.[counter]) || metric[counter] < 0 || metric[counter] > metric.views)
      || !Number.isFinite(metric?.completionRate)
      || metric.completionRate < 0
      || metric.completionRate > 100
      || metric?.verificationStatus !== "strong_source_verified_read_only"
    ) return null;
    metricIds.add(metric.metricId);
  }
  return value.metrics;
}

function safeMetadata(value, metrics, profile) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const categories = new Set(Object.keys(profile.categoryWeights));
  const topicOrder = profile.topicGroups.map(({ id }) => id);
  const topics = new Set(topicOrder);
  const metadata = new Map();
  for (const item of value) {
    if (
      JSON.stringify(Object.keys(item ?? {}).sort()) !== JSON.stringify(METADATA_KEYS)
      || !SAFE_ID.test(item?.ideaId ?? "")
      || metadata.has(item.ideaId)
      || !categories.has(item?.category)
      || !Array.isArray(item?.matchedTopics)
      || item.matchedTopics.length < 1
      || new Set(item.matchedTopics).size !== item.matchedTopics.length
      || item.matchedTopics.some((topic) => !topics.has(topic))
      || JSON.stringify([...item.matchedTopics].sort((left, right) => topicOrder.indexOf(left) - topicOrder.indexOf(right))) !== JSON.stringify(item.matchedTopics)
    ) return null;
    metadata.set(item.ideaId, { ideaId: item.ideaId, category: item.category, matchedTopics: [...item.matchedTopics] });
  }
  const metricIdeas = new Set(metrics.map(({ ideaId }) => ideaId));
  if (metadata.size !== metricIdeas.size || [...metricIdeas].some((ideaId) => !metadata.has(ideaId))) return null;
  return metadata;
}

function outcomeSignal(metric) {
  const engagementRate = (metric.likes + metric.comments + metric.shares + metric.saves) / Math.max(metric.views, 1);
  const completionSignal = metric.completionRate / 100;
  const engagementSignal = clamp(engagementRate / 0.1, 0, 1);
  return {
    completionSignal: rounded(completionSignal),
    engagementRate: rounded(engagementRate),
    engagementSignal: rounded(engagementSignal),
    combinedSignal: rounded(completionSignal * 0.6 + engagementSignal * 0.4),
  };
}

function proposal(id, currentWeight, outcomes) {
  const meanSignal = outcomes.reduce((sum, outcome) => sum + outcome.meanSignal, 0) / outcomes.length;
  const shrinkage = Math.min(outcomes.length / 5, 1);
  const delta = clamp((meanSignal - 0.5) * 0.1 * shrinkage, -MAX_ABSOLUTE_DELTA, MAX_ABSOLUTE_DELTA);
  return {
    id,
    currentWeight,
    suggestedWeight: rounded(clamp(currentWeight + delta, 0.5, 1.5)),
    delta: rounded(delta),
    uniqueIdeaCount: outcomes.length,
    meanSignal: rounded(meanSignal),
    status: "human_review_required_not_applied",
  };
}

function proposalsFor(outcomes, values, currentWeight) {
  return [...values].flatMap((id) => {
    const matching = outcomes.filter((outcome) => outcome.values.includes(id));
    return matching.length >= MIN_IDEAS_PER_WEIGHT ? [proposal(id, currentWeight(id), matching)] : [];
  });
}

function safeResult(fields = {}) {
  return {
    status: "topic_weight_update_preview_blocked",
    blockers: [],
    metricsProjectionFingerprint: null,
    ideaMetadataFingerprint: null,
    weightUpdatePreviewFingerprint: null,
    ideaOutcomes: [],
    uniqueIdeaCount: 0,
    categoryWeightProposals: [],
    topicWeightProposals: [],
    recommendationCount: 0,
    method: {
      version: "bounded-outcome-calibration-v1",
      signal: "0.6 * completion_rate + 0.4 * capped_engagement_rate_at_10_percent",
      aggregation: "mean_per_idea_then_mean_per_weight",
      minimumUniqueIdeas: MIN_UNIQUE_IDEAS,
      minimumIdeasPerWeight: MIN_IDEAS_PER_WEIGHT,
      maximumAbsoluteDelta: MAX_ABSOLUTE_DELTA,
    },
    accountMetricsUsed: false,
    predictedViewsGenerated: false,
    viralProbabilityGenerated: false,
    eligibleForHumanWeightReview: false,
    humanWeightReviewCompleted: false,
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

export function buildTopicWeightUpdatePreview({
  metricsProjection,
  ideaMetadata = [],
  profile = DEFAULT_ACCOUNT_PROFILE,
} = {}) {
  const blockers = [];
  const metrics = safeProjection(metricsProjection);
  if (!metrics) blockers.push("verified_metrics_projection_invalid_or_tampered");
  const metadata = metrics ? safeMetadata(ideaMetadata, metrics, profile) : null;
  if (!metadata) blockers.push("idea_metadata_invalid_incomplete_or_unmapped");
  if (blockers.length || !metrics || !metadata) return safeResult({ blockers: [...new Set(blockers)] });

  const metricsProjectionFingerprint = hash(metrics);
  const normalizedMetadata = [...metadata.values()];
  const ideaMetadataFingerprint = hash(normalizedMetadata);
  const grouped = Map.groupBy(metrics, ({ ideaId }) => ideaId);
  const ideaOutcomes = normalizedMetadata.map((item) => {
    const signals = grouped.get(item.ideaId).map(outcomeSignal);
    const meanSignal = rounded(signals.reduce((sum, signal) => sum + signal.combinedSignal, 0) / signals.length);
    return {
      ideaId: item.ideaId,
      category: item.category,
      matchedTopics: item.matchedTopics,
      snapshotCount: signals.length,
      meanSignal,
      platformSignals: grouped.get(item.ideaId).map((metric, index) => ({ platform: metric.platform, ...signals[index] })),
    };
  });
  const enoughOutcomes = ideaOutcomes.length >= MIN_UNIQUE_IDEAS;
  const categoryWeightProposals = enoughOutcomes
    ? proposalsFor(
      ideaOutcomes.map((outcome) => ({ ...outcome, values: [outcome.category] })),
      new Set(ideaOutcomes.map(({ category }) => category)),
      (id) => Number(profile.categoryWeights[id]),
    )
    : [];
  const topicWeightProposals = enoughOutcomes
    ? proposalsFor(
      ideaOutcomes.map((outcome) => ({ ...outcome, values: outcome.matchedTopics })),
      new Set(ideaOutcomes.flatMap(({ matchedTopics }) => matchedTopics)),
      (id) => Number(profile.topicGroups.find((group) => group.id === id).weight),
    )
    : [];
  const fingerprintPayload = {
    profileId: profile.id,
    metricsProjectionFingerprint,
    ideaMetadataFingerprint,
    ideaOutcomes,
    categoryWeightProposals,
    topicWeightProposals,
  };
  const weightUpdatePreviewFingerprint = hash(fingerprintPayload);
  const recommendationCount = categoryWeightProposals.length + topicWeightProposals.length;
  return safeResult({
    status: enoughOutcomes ? "topic_weight_update_human_review_pending" : "topic_weight_update_insufficient_verified_outcomes",
    metricsProjectionFingerprint,
    ideaMetadataFingerprint,
    weightUpdatePreviewFingerprint,
    ideaOutcomes,
    uniqueIdeaCount: ideaOutcomes.length,
    categoryWeightProposals,
    topicWeightProposals,
    recommendationCount,
    accountMetricsUsed: true,
    eligibleForHumanWeightReview: enoughOutcomes && recommendationCount > 0,
  });
}
