const DEFAULT_WINDOW_HOURS = 24 * 7;

export const DEFAULT_ACCOUNT_PROFILE = Object.freeze({
  id: "zhihui-ai-tech-finance-v1",
  label: "知绘工厂 · AI / 科技 / 金融",
  categoryWeights: Object.freeze({ ai: 1, ai_media: 1, technology: 0.95, tech_media: 0.4, company_technology: 0.4, finance_regulation: 0.9, macro_finance: 0.9, jobs_macro: 0.85, robotics: 0.85 }),
  topicGroups: Object.freeze([
    Object.freeze({ id: "ai", weight: 1, terms: Object.freeze(["ai", "artificial intelligence", "openai", "chatgpt", "agent", "model", "人工智能", "大模型", "智能体"]) }),
    Object.freeze({ id: "technology", weight: 0.9, terms: Object.freeze(["technology", "software", "chip", "cloud", "developer", "科技", "软件", "芯片", "云计算", "程序员"]) }),
    Object.freeze({ id: "finance", weight: 0.9, terms: Object.freeze(["finance", "market", "sec", "federal reserve", "rate", "inflation", "金融", "市场", "美联储", "利率", "通胀"]) }),
    Object.freeze({ id: "work", weight: 0.8, terms: Object.freeze(["job", "jobs", "work", "career", "hiring", "layoff", "就业", "职场", "招聘", "裁员"]) }),
  ]),
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value) {
  return Number(clamp(value).toFixed(1));
}

function recencyScore(cluster, nowMs, windowHours) {
  const latest = Date.parse(cluster.lastSeenAt ?? "");
  if (!Number.isFinite(latest)) return 0;
  const ageHours = Math.max(0, (nowMs - latest) / 3_600_000);
  return 25 * clamp(1 - ageHours / windowHours, 0, 1);
}

function accountFit(cluster, profile) {
  const categoryWeight = Number(profile.categoryWeights?.[cluster.category] ?? 0);
  const searchable = [cluster.title, ...(cluster.evidence ?? []).map((item) => item.title)].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  const matchedGroups = profile.topicGroups.filter((group) => group.terms.some((term) => searchable.includes(term.toLocaleLowerCase("en-US"))));
  const topicWeight = matchedGroups.reduce((sum, group) => sum + group.weight, 0);
  const topicWeightCap = Math.max(1, ...profile.topicGroups.map((group) => group.weight));
  return {
    category: rounded(categoryWeight * 60),
    topicTerms: rounded((Math.min(topicWeight, topicWeightCap) / topicWeightCap) * 40),
    matchedGroups: matchedGroups.map((group) => group.id),
  };
}

export function scoreAccountFit(cluster, profile = DEFAULT_ACCOUNT_PROFILE) {
  const fit = accountFit(cluster, profile);
  return {
    score: rounded(fit.category + fit.topicTerms),
    breakdown: { category: fit.category, topicTerms: fit.topicTerms },
    matchedTopics: fit.matchedGroups,
  };
}

export function assessProfileCategoryCoverage(clustering, profile = DEFAULT_ACCOUNT_PROFILE) {
  const categories = [...new Set((clustering?.clusters ?? []).map((cluster) => cluster.category).filter(Boolean))].sort();
  const unmappedCategories = categories.filter((category) => !Object.hasOwn(profile.categoryWeights ?? {}, category));
  return {
    categoriesPresent: categories.length,
    mappedCategories: categories.length - unmappedCategories.length,
    unmappedCategories,
    complete: unmappedCategories.length === 0,
  };
}

function scoreEligibleCluster(cluster, { profile, nowMs, windowHours }) {
  const evidence = {
    sourceDiversity: rounded((Math.min(cluster.sourceCount, 4) / 4) * 35),
    reportVolume: rounded((Math.min(cluster.itemCount, 5) / 5) * 20),
    recency: rounded(recencyScore(cluster, nowMs, windowHours)),
    titleCoherence: rounded((cluster.meanSimilarity ?? 0) * 20),
  };
  const trendEvidenceScore = rounded(Object.values(evidence).reduce((sum, value) => sum + value, 0));
  const fit = scoreAccountFit(cluster, profile);
  const accountFitScore = fit.score;
  const relativePriorityScore = rounded(trendEvidenceScore * 0.6 + accountFitScore * 0.4);

  return {
    id: cluster.id,
    title: cluster.title,
    category: cluster.category,
    sourceCount: cluster.sourceCount,
    itemCount: cluster.itemCount,
    sourceIds: cluster.sourceIds,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    trendEvidenceScore,
    accountFitScore,
    relativePriorityScore,
    scoreBreakdown: { ...evidence, accountCategory: fit.breakdown.category, accountTerms: fit.breakdown.topicTerms },
    matchedAccountTopics: fit.matchedTopics,
    scoreVersion: "rules-v1",
    predictedViews: null,
    viralProbability: null,
    factsVerified: false,
    selectableForDraft: false,
    nextGate: "human_source_and_fact_review",
    evidence: cluster.evidence,
  };
}

export function rankTopicCandidates(clustering, { profile = DEFAULT_ACCOUNT_PROFILE, now = new Date(), windowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const eligibleClusters = (clustering?.clusters ?? []).filter((cluster) => cluster.eligibleForHotspotScoring === true);
  const candidates = eligibleClusters
    .map((cluster) => scoreEligibleCluster(cluster, { profile, nowMs: new Date(now).getTime(), windowHours }))
    .sort((left, right) => right.relativePriorityScore - left.relativePriorityScore || left.id.localeCompare(right.id));

  return {
    status: candidates.length ? "ranked_candidates_ready" : "no_eligible_candidates",
    profile: { id: profile.id, label: profile.label, calibration: "rules_only_no_verified_account_metrics", categoryCoverage: assessProfileCategoryCoverage(clustering, profile) },
    summary: {
      clustersConsidered: clustering?.clusters?.length ?? 0,
      eligibleClusters: eligibleClusters.length,
      rankedCandidates: candidates.length,
      blockedBeforeScoring: (clustering?.clusters?.length ?? 0) - eligibleClusters.length,
    },
    candidates,
    scoreKind: "relative_evidence_and_account_fit",
    heatScored: candidates.length > 0,
    factsVerified: false,
    predictedViewsGenerated: false,
    viralProbabilityGenerated: false,
    accountMetricsUsed: false,
    humanSelectionUnlocked: false,
    databaseWrites: false,
    publishTriggered: false,
  };
}
