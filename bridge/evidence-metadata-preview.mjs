import { titleSimilarity, tokenizeNewsTitle } from "./topic-clustering.mjs";

const DEFAULT_MINIMUM_SIMILARITY = 0.12;
const DEFAULT_MINIMUM_SHARED_TERMS = 2;
const DEFAULT_WINDOW_HOURS = 24 * 7;
const DEFAULT_MAX_CANDIDATES = 3;

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sharedTerms(leftTitle, rightTitle) {
  const left = tokenizeNewsTitle(leftTitle);
  const right = tokenizeNewsTitle(rightTitle);
  return [...left].filter((term) => right.has(term)).sort();
}

export function buildEvidenceMetadataPreview(plan, items = [], {
  minimumSimilarity = DEFAULT_MINIMUM_SIMILARITY,
  minimumSharedTerms = DEFAULT_MINIMUM_SHARED_TERMS,
  windowHours = DEFAULT_WINDOW_HOURS,
  maxCandidatesPerTarget = DEFAULT_MAX_CANDIDATES,
} = {}) {
  if (!plan?.readyForHumanResearchReview || !plan.planFingerprint) {
    return {
      status: "metadata_preview_blocked",
      blockers: ["search_plan_not_ready"],
      planFingerprint: plan?.planFingerprint ?? null,
      summary: { targetsReviewed: 0, itemsConsidered: 0, candidatesReturned: 0 },
      targets: [],
      searchScope: "public_rss_metadata_only",
      feedMetadataMatched: false,
      articleBodiesFetched: false,
      factsVerified: false,
      sourceLocksCreated: 0,
      draftsUnlocked: 0,
      databaseWrites: false,
      publishTriggered: false,
    };
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const targets = plan.targets.map((target) => {
    const allowedSourceIds = new Set(target.allowedSources.filter((source) => source.sourceType === "rss" && source.feedUrl).map((source) => source.id));
    const targetTime = timestamp(target.sourcePublishedAt);
    const candidates = items.flatMap((item) => {
      if (!allowedSourceIds.has(item.sourceId) || item.sourceId === target.originalSourceId) return [];
      const itemTime = timestamp(item.publishedAt);
      if (targetTime === null || itemTime === null || Math.abs(targetTime - itemTime) > windowMs) return [];
      const terms = sharedTerms(target.title, item.title);
      const similarity = titleSimilarity(target.title, item.title);
      if (terms.length < minimumSharedTerms || similarity < minimumSimilarity) return [];
      return [{
        id: item.id,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        publishedAt: item.publishedAt,
        candidateHost: normalizedHost(item.canonicalUrl),
        publishedDeltaHours: Number(((itemTime - targetTime) / 3_600_000).toFixed(1)),
        titleSimilarity: Number(similarity.toFixed(4)),
        sharedTerms: terms,
        reviewStatus: "human_review_required",
      }];
    }).sort((left, right) => right.titleSimilarity - left.titleSimilarity || String(right.publishedAt).localeCompare(String(left.publishedAt)) || left.id.localeCompare(right.id)).slice(0, maxCandidatesPerTarget);

    return {
      leadId: target.leadId,
      title: target.title,
      originalSourceId: target.originalSourceId,
      originalEvidence: target.originalEvidence?.[0] ?? null,
      originalHost: normalizedHost(target.originalEvidence?.[0]?.canonicalUrl),
      candidates,
      candidateCount: candidates.length,
      sourceLockReady: false,
      factsVerified: false,
    };
  });
  const candidateCount = targets.reduce((sum, target) => sum + target.candidateCount, 0);

  return {
    status: candidateCount ? "metadata_candidates_found" : "no_metadata_candidates",
    blockers: [],
    planFingerprint: plan.planFingerprint,
    summary: { targetsReviewed: targets.length, itemsConsidered: items.length, candidatesReturned: candidateCount },
    targets,
    searchScope: "public_rss_metadata_only",
    thresholds: { minimumSimilarity, minimumSharedTerms, windowHours, maxCandidatesPerTarget },
    feedMetadataMatched: true,
    articleBodiesFetched: false,
    humanReviewRequired: true,
    factsVerified: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
