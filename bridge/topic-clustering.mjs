import { createHash } from "node:crypto";

const DEFAULT_SIMILARITY_THRESHOLD = 0.38;
const DEFAULT_WINDOW_HOURS = 24 * 7;
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "is", "it", "new", "of", "on", "the", "to", "with", "ai"]);
const CLUSTERING_FRESHNESS_STATUSES = new Set(["within_24_hours", "within_72_hours", "within_7_days"]);

function normalizedText(value = "") {
  return String(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/[’']/g, "").replace(/[^\p{Letter}\p{Number}\p{Script=Han}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function tokenizeNewsTitle(title) {
  const text = normalizedText(title);
  const tokens = new Set(
    (text.match(/[a-z\p{Letter}\p{Number}]{2,}/gu) ?? [])
      .filter((token) => !/[\p{Script=Han}]/u.test(token))
      .filter((token) => !STOP_WORDS.has(token)),
  );
  for (const sequence of text.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    const characters = [...sequence];
    for (let index = 0; index < characters.length - 1; index += 1) tokens.add(characters.slice(index, index + 2).join(""));
  }
  return tokens;
}

export function titleSimilarity(leftTitle, rightTitle) {
  const left = tokenizeNewsTitle(leftTitle);
  const right = tokenizeNewsTitle(rightTitle);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function withinWindow(left, right, windowMs) {
  const leftTime = timestamp(left.publishedAt);
  const rightTime = timestamp(right.publishedAt);
  return leftTime === null || rightTime === null || Math.abs(leftTime - rightTime) <= windowMs;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] ?? "uncategorized";
}

function metadataQualityBlocker(item) {
  if (item?.metadataProvenanceReady !== true) return "provenance_not_ready";
  if (item?.collectionScope !== "rss_metadata_only") return "collection_scope_invalid";
  if (item?.articleBodyFetched !== false) return "article_body_boundary_invalid";
  if (item?.freshnessStatus === "timestamp_missing_or_invalid") return "timestamp_missing_or_invalid";
  if (item?.freshnessStatus === "future_timestamp_requires_review") return "future_timestamp_requires_review";
  if (item?.freshnessStatus === "older_than_7_days") return "older_than_7_days";
  if (!CLUSTERING_FRESHNESS_STATUSES.has(item?.freshnessStatus) || !Number.isFinite(item?.ageHours) || item.ageHours < 0 || item.ageHours > 168) return "freshness_metadata_invalid";
  return null;
}

export function gateTopicClusteringInput(items = [], { required = false } = {}) {
  const reasons = {};
  const acceptedItems = [];
  for (const item of items) {
    const blocker = required ? metadataQualityBlocker(item) : null;
    if (!blocker) acceptedItems.push(item);
    else reasons[blocker] = (reasons[blocker] ?? 0) + 1;
  }
  return {
    required,
    itemsReceived: items.length,
    itemsAccepted: acceptedItems.length,
    itemsExcluded: items.length - acceptedItems.length,
    exclusionReasons: reasons,
    acceptedItems,
    articleBodiesFetched: false,
    factsVerified: false,
    databaseWrites: false,
    publishTriggered: false,
  };
}

function summarizeCluster(cluster, windowMs) {
  const sourceIds = [...new Set(cluster.items.map((item) => item.sourceId))].sort();
  const datedItems = cluster.items.map((item) => timestamp(item.publishedAt)).filter((value) => value !== null);
  const firstTimestamp = datedItems.length ? Math.min(...datedItems) : null;
  const lastTimestamp = datedItems.length ? Math.max(...datedItems) : null;
  const timeWindowVerified = datedItems.length === cluster.items.length && lastTimestamp - firstTimestamp <= windowMs;
  const crossSourceConfirmed = sourceIds.length >= 2;
  const eligibleForHotspotScoring = crossSourceConfirmed && timeWindowVerified;
  const fingerprint = createHash("sha256").update(cluster.items.map((item) => item.id).sort().join("\n")).digest("hex");
  const meanSimilarity = cluster.similarities.length
    ? cluster.similarities.reduce((sum, value) => sum + value, 0) / cluster.similarities.length
    : null;

  return {
    id: `cluster:${fingerprint.slice(0, 16)}`,
    title: cluster.representative.title,
    category: mostCommon(cluster.items.map((item) => item.category)),
    status: eligibleForHotspotScoring ? "multi_source_candidate" : crossSourceConfirmed ? "time_unverified" : "single_source_only",
    itemCount: cluster.items.length,
    sourceCount: sourceIds.length,
    sourceIds,
    firstSeenAt: firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
    lastSeenAt: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
    meanSimilarity: meanSimilarity === null ? null : Number(meanSimilarity.toFixed(4)),
    crossSourceConfirmed,
    timeWindowVerified,
    eligibleForHotspotScoring,
    evidence: cluster.items.map(({ id, sourceId, sourceName, title, canonicalUrl, publishedAt, metadataProvenanceReady, sourceEvidenceUrl, rightsPolicy, collectionScope, articleBodyFetched, freshnessStatus, ageHours }) => ({ id, sourceId, sourceName, title, canonicalUrl, publishedAt, metadataProvenanceReady, sourceEvidenceUrl, rightsPolicy, collectionScope, articleBodyFetched, freshnessStatus, ageHours })),
  };
}

export function buildTopicClusters(items = [], { similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD, windowHours = DEFAULT_WINDOW_HOURS, requireMetadataQuality = false } = {}) {
  const inputQualityGate = gateTopicClusteringInput(items, { required: requireMetadataQuality });
  const windowMs = windowHours * 60 * 60 * 1000;
  const orderedItems = [...inputQualityGate.acceptedItems].sort((left, right) => String(right.publishedAt ?? "").localeCompare(String(left.publishedAt ?? "")) || String(left.id).localeCompare(String(right.id)));
  const workingClusters = [];

  for (const item of orderedItems) {
    let best = null;
    for (const cluster of workingClusters) {
      if (!withinWindow(item, cluster.representative, windowMs)) continue;
      const similarity = titleSimilarity(item.title, cluster.representative.title);
      if (similarity >= similarityThreshold && (!best || similarity > best.similarity)) best = { cluster, similarity };
    }
    if (best) {
      best.cluster.items.push(item);
      best.cluster.similarities.push(best.similarity);
    } else {
      workingClusters.push({ representative: item, items: [item], similarities: [] });
    }
  }

  const clusters = workingClusters
    .map((cluster) => summarizeCluster(cluster, windowMs))
    .sort((left, right) => Number(right.eligibleForHotspotScoring) - Number(left.eligibleForHotspotScoring) || String(right.lastSeenAt ?? "").localeCompare(String(left.lastSeenAt ?? "")));

  return {
    status: orderedItems.length ? "clusters_ready" : "no_items",
    summary: {
      itemsConsidered: orderedItems.length,
      clusterCount: clusters.length,
      crossSourceClusters: clusters.filter((cluster) => cluster.crossSourceConfirmed).length,
      eligibleCandidates: clusters.filter((cluster) => cluster.eligibleForHotspotScoring).length,
      similarityThreshold,
      windowHours,
    },
    inputQualityGate: {
      required: inputQualityGate.required,
      itemsReceived: inputQualityGate.itemsReceived,
      itemsAccepted: inputQualityGate.itemsAccepted,
      itemsExcluded: inputQualityGate.itemsExcluded,
      exclusionReasons: inputQualityGate.exclusionReasons,
      articleBodiesFetched: inputQualityGate.articleBodiesFetched,
      factsVerified: inputQualityGate.factsVerified,
      databaseWrites: inputQualityGate.databaseWrites,
      publishTriggered: inputQualityGate.publishTriggered,
    },
    clusters,
    factsVerified: false,
    heatScored: false,
    databaseWrites: false,
    publishTriggered: false,
  };
}
