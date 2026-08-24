import { createHash } from "node:crypto";

import { gateTopicClusteringInput, titleSimilarity, tokenizeNewsTitle } from "./topic-clustering.mjs";

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

function buildCandidateQualityBoundary(item) {
  const qualityGate = gateTopicClusteringInput([item], { required: true });
  const qualityBound = qualityGate.itemsAccepted === 1;
  const qualityEvidenceFingerprint = qualityBound
    ? createHash("sha256").update([
      item.id,
      item.sourceId,
      item.canonicalUrl,
      item.publishedAt,
      item.sourceEvidenceUrl,
      item.rightsPolicy,
      item.collectionScope,
      item.freshnessStatus,
      item.ageHours,
    ].join("\n")).digest("hex")
    : null;
  return {
    qualityBound,
    blocker: Object.keys(qualityGate.exclusionReasons)[0] ?? null,
    metadataProvenanceReady: item?.metadataProvenanceReady === true,
    collectionScope: item?.collectionScope === "rss_metadata_only" ? "rss_metadata_only" : null,
    articleBodiesFetched: item?.articleBodyFetched === true,
    freshnessStatus: item?.freshnessStatus ?? null,
    sourceEvidenceUrl: item?.sourceEvidenceUrl ?? null,
    qualityEvidenceFingerprint,
  };
}

export function buildEvidenceMetadataPreview(plan, items = [], {
  minimumSimilarity = DEFAULT_MINIMUM_SIMILARITY,
  minimumSharedTerms = DEFAULT_MINIMUM_SHARED_TERMS,
  windowHours = DEFAULT_WINDOW_HOURS,
  maxCandidatesPerTarget = DEFAULT_MAX_CANDIDATES,
  requireQualityLineage = false,
} = {}) {
  if (!plan?.readyForHumanResearchReview || !plan.planFingerprint) {
    return {
      status: "metadata_preview_blocked",
      blockers: ["search_plan_not_ready"],
      planFingerprint: plan?.planFingerprint ?? null,
      summary: { targetsReviewed: 0, itemsConsidered: 0, candidatesReturned: 0, candidatesWithQualityEvidence: 0 },
      targets: [],
      searchScope: "public_rss_metadata_only",
      feedMetadataMatched: false,
      qualityBoundary: {
        required: requireQualityLineage,
        sourceTargetsQualityBound: false,
        allReturnedCandidatesQualityBound: false,
        previewQualityFingerprint: null,
        articleBodiesFetched: false,
        factsVerified: false,
        databaseWrites: false,
        publishTriggered: false,
      },
      articleBodiesFetched: false,
      factsVerified: false,
      sourceLocksCreated: 0,
      draftsUnlocked: 0,
      databaseWrites: false,
      publishTriggered: false,
    };
  }

  const unboundTargets = plan.targets.filter((target) => target.qualityLineageBound !== true || !target.sourceQualityEvidenceFingerprint);
  if (requireQualityLineage && unboundTargets.length) {
    return {
      status: "metadata_preview_blocked",
      blockers: unboundTargets.map((target) => `source_quality_lineage_not_bound:${target.leadId}`),
      planFingerprint: plan.planFingerprint,
      summary: { targetsReviewed: 0, itemsConsidered: 0, candidatesReturned: 0, candidatesWithQualityEvidence: 0 },
      targets: [],
      searchScope: "public_rss_metadata_only",
      feedMetadataMatched: false,
      qualityBoundary: {
        required: true,
        sourceTargetsQualityBound: false,
        allReturnedCandidatesQualityBound: false,
        previewQualityFingerprint: null,
        articleBodiesFetched: false,
        factsVerified: false,
        databaseWrites: false,
        publishTriggered: false,
      },
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
      const qualityBoundary = buildCandidateQualityBoundary(item);
      if (requireQualityLineage && !qualityBoundary.qualityBound) return [];
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
        qualityBoundary,
        candidateQualityEvidenceFingerprint: qualityBoundary.qualityEvidenceFingerprint,
      }];
    }).sort((left, right) => right.titleSimilarity - left.titleSimilarity || String(right.publishedAt).localeCompare(String(left.publishedAt)) || left.id.localeCompare(right.id)).slice(0, maxCandidatesPerTarget);

    return {
      leadId: target.leadId,
      title: target.title,
      originalSourceId: target.originalSourceId,
      sourceQualityEvidenceFingerprint: target.sourceQualityEvidenceFingerprint,
      originalEvidence: target.originalEvidence?.[0] ?? null,
      originalHost: normalizedHost(target.originalEvidence?.[0]?.canonicalUrl),
      candidates,
      candidateCount: candidates.length,
      sourceLockReady: false,
      factsVerified: false,
    };
  });
  const candidateCount = targets.reduce((sum, target) => sum + target.candidateCount, 0);
  const candidatesWithQualityEvidence = targets.reduce((sum, target) => sum + target.candidates.filter((candidate) => candidate.qualityBoundary.qualityBound).length, 0);
  const allReturnedCandidatesQualityBound = candidateCount > 0 && candidatesWithQualityEvidence === candidateCount;
  const previewQualityFingerprint = allReturnedCandidatesQualityBound
    ? createHash("sha256").update(JSON.stringify({
      planFingerprint: plan.planFingerprint,
      candidates: targets.flatMap((target) => target.candidates.map((candidate) => ({
        leadId: target.leadId,
        sourceQualityEvidenceFingerprint: target.sourceQualityEvidenceFingerprint,
        candidateQualityEvidenceFingerprint: candidate.candidateQualityEvidenceFingerprint,
      }))).sort((left, right) => left.leadId.localeCompare(right.leadId) || left.candidateQualityEvidenceFingerprint.localeCompare(right.candidateQualityEvidenceFingerprint)),
    })).digest("hex")
    : null;

  return {
    status: candidateCount ? "metadata_candidates_found" : "no_metadata_candidates",
    blockers: [],
    planFingerprint: plan.planFingerprint,
    summary: { targetsReviewed: targets.length, itemsConsidered: items.length, candidatesReturned: candidateCount, candidatesWithQualityEvidence },
    targets,
    searchScope: "public_rss_metadata_only",
    thresholds: { minimumSimilarity, minimumSharedTerms, windowHours, maxCandidatesPerTarget },
    feedMetadataMatched: true,
    qualityBoundary: {
      required: requireQualityLineage,
      sourceTargetsQualityBound: unboundTargets.length === 0,
      allReturnedCandidatesQualityBound,
      previewQualityFingerprint,
      articleBodiesFetched: false,
      factsVerified: false,
      databaseWrites: false,
      publishTriggered: false,
    },
    articleBodiesFetched: false,
    humanReviewRequired: true,
    factsVerified: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}
