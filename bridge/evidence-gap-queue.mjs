import { createHash } from "node:crypto";

import { DEFAULT_ACCOUNT_PROFILE, scoreAccountFit } from "./topic-ranking.mjs";

const DEFAULT_WINDOW_HOURS = 24 * 7;
const QUALITY_FRESHNESS_STATUSES = new Set(["within_24_hours", "within_72_hours", "within_7_days"]);

function publishedAgeHours(cluster, nowMs) {
  const publishedAt = Date.parse(cluster.lastSeenAt ?? "");
  if (!Number.isFinite(publishedAt) || publishedAt > nowMs + 6 * 3_600_000) return null;
  return Math.max(0, (nowMs - publishedAt) / 3_600_000);
}

export function buildEvidenceQueries(title = "") {
  const normalizedTitle = String(title).normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalizedTitle) return { queryLanguage: "und", queries: [] };
  const queryLanguage = /\p{Script=Han}/u.test(normalizedTitle) ? "zh-CN" : "en";
  return {
    queryLanguage,
    queries: [
      `"${normalizedTitle}"`,
      queryLanguage === "zh-CN"
        ? `${normalizedTitle} 独立报道 核实`
        : `${normalizedTitle} independent coverage verification`,
    ],
  };
}

export function selectSourceDiverseLeads(candidates = [], maxLeads = 12, maxLeadsPerSource = 3) {
  const selected = [];
  const selectedIds = new Set();
  const sourceCounts = new Map();

  const trySelect = (candidate) => {
    if (!candidate || selected.length >= maxLeads || selectedIds.has(candidate.id)) return;
    const sourceCount = sourceCounts.get(candidate.sourceId) ?? 0;
    if (sourceCount >= maxLeadsPerSource) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
    sourceCounts.set(candidate.sourceId, sourceCount + 1);
  };

  const languages = [...new Set(candidates.map((candidate) => candidate.queryLanguage).filter((language) => language && language !== "und"))];
  for (const language of languages) {
    trySelect(candidates.find((candidate) => candidate.queryLanguage === language));
  }
  for (const candidate of candidates) {
    trySelect(candidate);
  }

  const order = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  return selected.sort((left, right) => order.get(left.id) - order.get(right.id));
}

function buildLeadQualityBoundary(cluster, qualityGateRequired) {
  const evidence = cluster.evidence ?? [];
  const qualityBound = qualityGateRequired === true
    && evidence.length > 0
    && evidence.every((item) => item.metadataProvenanceReady === true)
    && evidence.every((item) => item.collectionScope === "rss_metadata_only")
    && evidence.every((item) => item.articleBodyFetched === false)
    && evidence.every((item) => QUALITY_FRESHNESS_STATUSES.has(item.freshnessStatus))
    && evidence.every((item) => Number.isFinite(item.ageHours) && item.ageHours >= 0 && item.ageHours <= 168);
  const qualityEvidenceFingerprint = qualityBound
    ? createHash("sha256").update(evidence.map((item) => [
      item.id,
      item.sourceId,
      item.canonicalUrl,
      item.publishedAt,
      item.sourceEvidenceUrl,
      item.rightsPolicy,
      item.collectionScope,
      item.freshnessStatus,
      item.ageHours,
    ].join("\n")).sort().join("\n---\n")).digest("hex")
    : null;
  return {
    inheritedFromRequiredClusteringGate: qualityGateRequired === true,
    qualityBound,
    evidenceItems: evidence.length,
    metadataProvenanceReady: evidence.length > 0 && evidence.every((item) => item.metadataProvenanceReady === true),
    collectionScope: evidence.length > 0 && evidence.every((item) => item.collectionScope === "rss_metadata_only") ? "rss_metadata_only" : null,
    articleBodiesFetched: evidence.some((item) => item.articleBodyFetched === true),
    sourceEvidenceUrls: [...new Set(evidence.map((item) => item.sourceEvidenceUrl).filter(Boolean))].sort(),
    qualityEvidenceFingerprint,
  };
}

export function buildEvidenceGapQueue(clustering, { profile = DEFAULT_ACCOUNT_PROFILE, now = new Date(), windowHours = DEFAULT_WINDOW_HOURS, minimumAccountFit = 30, maxLeads = 12, maxLeadsPerSource = 3 } = {}) {
  const nowMs = new Date(now).getTime();
  const qualityGateRequired = clustering?.inputQualityGate?.required === true;
  const candidates = (clustering?.clusters ?? []).flatMap((cluster) => {
    if (cluster.sourceCount !== 1 || cluster.eligibleForHotspotScoring) return [];
    const ageHours = publishedAgeHours(cluster, nowMs);
    if (ageHours === null || ageHours > windowHours) return [];
    const fit = scoreAccountFit(cluster, profile);
    if (fit.score < minimumAccountFit) return [];
    const evidenceQueries = buildEvidenceQueries(cluster.title);
    const qualityBoundary = buildLeadQualityBoundary(cluster, qualityGateRequired);
    if (qualityGateRequired && !qualityBoundary.qualityBound) return [];
    return [{
      id: cluster.id,
      title: cluster.title,
      category: cluster.category,
      sourceId: cluster.sourceIds[0],
      publishedAt: cluster.lastSeenAt,
      ageHours: Number(ageHours.toFixed(1)),
      accountFitScore: fit.score,
      matchedAccountTopics: fit.matchedTopics,
      status: "needs_independent_source",
      missingIndependentSources: 1,
      queryLanguage: evidenceQueries.queryLanguage,
      suggestedQueries: evidenceQueries.queries,
      shortlistableForEvidenceSearch: true,
      factsVerified: false,
      sourceLockReady: false,
      selectableForDraft: false,
      evidence: cluster.evidence,
      qualityBoundary,
      qualityEvidenceFingerprint: qualityBoundary.qualityEvidenceFingerprint,
    }];
  });

  const orderedCandidates = candidates
    .sort((left, right) => right.accountFitScore - left.accountFitScore || left.ageHours - right.ageHours || left.id.localeCompare(right.id));
  const leads = selectSourceDiverseLeads(orderedCandidates, maxLeads, maxLeadsPerSource);
  const allReturnedLeadsQualityBound = leads.length > 0 && leads.every((lead) => lead.qualityBoundary.qualityBound);
  const shortlistQualityFingerprint = allReturnedLeadsQualityBound
    ? createHash("sha256").update(leads.map((lead) => lead.qualityEvidenceFingerprint).sort().join("\n")).digest("hex")
    : null;

  return {
    status: leads.length ? "evidence_gaps_ready" : "no_recent_account_fit_leads",
    profile: { id: profile.id, label: profile.label, calibration: "rules_only_no_verified_account_metrics" },
    summary: {
      clustersConsidered: clustering?.clusters?.length ?? 0,
      recentSingleSourceLeads: candidates.length,
      leadsReturned: leads.length,
      independentSourcesStillRequired: leads.length,
      sourcesRepresented: new Set(leads.map((lead) => lead.sourceId)).size,
      languagesRepresented: [...new Set(leads.map((lead) => lead.queryLanguage).filter((language) => language && language !== "und"))].sort(),
      maxLeadsPerSource,
      windowHours,
      minimumAccountFit,
      leadsWithQualityEvidence: leads.filter((lead) => lead.qualityBoundary.qualityBound).length,
    },
    qualityBoundary: {
      clusteringQualityGateRequired: qualityGateRequired,
      clusteringItemsReceived: clustering?.inputQualityGate?.itemsReceived ?? null,
      clusteringItemsAccepted: clustering?.inputQualityGate?.itemsAccepted ?? null,
      clusteringItemsExcluded: clustering?.inputQualityGate?.itemsExcluded ?? null,
      allReturnedLeadsQualityBound,
      shortlistQualityFingerprint,
      articleBodiesFetched: false,
      factsVerified: false,
      databaseWrites: false,
      publishTriggered: false,
    },
    leads,
    humanShortlistPersisted: false,
    evidenceSearchTriggered: false,
    factsVerified: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
