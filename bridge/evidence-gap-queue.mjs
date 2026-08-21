import { DEFAULT_ACCOUNT_PROFILE, scoreAccountFit } from "./topic-ranking.mjs";

const DEFAULT_WINDOW_HOURS = 24 * 7;

function publishedAgeHours(cluster, nowMs) {
  const publishedAt = Date.parse(cluster.lastSeenAt ?? "");
  if (!Number.isFinite(publishedAt) || publishedAt > nowMs + 6 * 3_600_000) return null;
  return Math.max(0, (nowMs - publishedAt) / 3_600_000);
}

export function buildEvidenceGapQueue(clustering, { profile = DEFAULT_ACCOUNT_PROFILE, now = new Date(), windowHours = DEFAULT_WINDOW_HOURS, minimumAccountFit = 30, maxLeads = 12 } = {}) {
  const nowMs = new Date(now).getTime();
  const candidates = (clustering?.clusters ?? []).flatMap((cluster) => {
    if (cluster.sourceCount !== 1 || cluster.eligibleForHotspotScoring) return [];
    const ageHours = publishedAgeHours(cluster, nowMs);
    if (ageHours === null || ageHours > windowHours) return [];
    const fit = scoreAccountFit(cluster, profile);
    if (fit.score < minimumAccountFit) return [];
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
      suggestedQueries: [`"${cluster.title}"`, `${cluster.title} independent confirmation`],
      shortlistableForEvidenceSearch: true,
      factsVerified: false,
      sourceLockReady: false,
      selectableForDraft: false,
      evidence: cluster.evidence,
    }];
  });

  const leads = candidates
    .sort((left, right) => right.accountFitScore - left.accountFitScore || left.ageHours - right.ageHours || left.id.localeCompare(right.id))
    .slice(0, maxLeads);

  return {
    status: leads.length ? "evidence_gaps_ready" : "no_recent_account_fit_leads",
    profile: { id: profile.id, label: profile.label, calibration: "rules_only_no_verified_account_metrics" },
    summary: {
      clustersConsidered: clustering?.clusters?.length ?? 0,
      recentSingleSourceLeads: candidates.length,
      leadsReturned: leads.length,
      independentSourcesStillRequired: leads.length,
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
