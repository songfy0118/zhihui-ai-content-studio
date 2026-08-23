import { DEFAULT_ACCOUNT_PROFILE, scoreAccountFit } from "./topic-ranking.mjs";

const DEFAULT_WINDOW_HOURS = 24 * 7;

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
  const sourceCounts = new Map();
  for (const candidate of candidates) {
    if (selected.length >= maxLeads) break;
    const sourceCount = sourceCounts.get(candidate.sourceId) ?? 0;
    if (sourceCount >= maxLeadsPerSource) continue;
    selected.push(candidate);
    sourceCounts.set(candidate.sourceId, sourceCount + 1);
  }
  return selected;
}

export function buildEvidenceGapQueue(clustering, { profile = DEFAULT_ACCOUNT_PROFILE, now = new Date(), windowHours = DEFAULT_WINDOW_HOURS, minimumAccountFit = 30, maxLeads = 12, maxLeadsPerSource = 3 } = {}) {
  const nowMs = new Date(now).getTime();
  const candidates = (clustering?.clusters ?? []).flatMap((cluster) => {
    if (cluster.sourceCount !== 1 || cluster.eligibleForHotspotScoring) return [];
    const ageHours = publishedAgeHours(cluster, nowMs);
    if (ageHours === null || ageHours > windowHours) return [];
    const fit = scoreAccountFit(cluster, profile);
    if (fit.score < minimumAccountFit) return [];
    const evidenceQueries = buildEvidenceQueries(cluster.title);
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
    }];
  });

  const orderedCandidates = candidates
    .sort((left, right) => right.accountFitScore - left.accountFitScore || left.ageHours - right.ageHours || left.id.localeCompare(right.id));
  const leads = selectSourceDiverseLeads(orderedCandidates, maxLeads, maxLeadsPerSource);

  return {
    status: leads.length ? "evidence_gaps_ready" : "no_recent_account_fit_leads",
    profile: { id: profile.id, label: profile.label, calibration: "rules_only_no_verified_account_metrics" },
    summary: {
      clustersConsidered: clustering?.clusters?.length ?? 0,
      recentSingleSourceLeads: candidates.length,
      leadsReturned: leads.length,
      independentSourcesStillRequired: leads.length,
      sourcesRepresented: new Set(leads.map((lead) => lead.sourceId)).size,
      maxLeadsPerSource,
      windowHours,
      minimumAccountFit,
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
