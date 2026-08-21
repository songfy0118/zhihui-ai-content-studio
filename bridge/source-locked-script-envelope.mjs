import { createHash } from "node:crypto";

import { inspectFactSource, validateFactReview } from "./fact-review-policy.mjs";

const SUPPORTED_TARGETS = new Set(["douyin", "tiktok", "xiaohongshu"]);
const CONSTRAINTS = Object.freeze([
  "no_uncited_factual_claims",
  "preserve_uncertainty",
  "source_notes_required",
  "human_review_required",
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSourceLockedScriptEnvelope({ idea = {}, factReview = {}, targets = [] } = {}) {
  const factValidation = validateFactReview(factReview);
  const title = normalizeText(idea.title);
  const angle = normalizeText(idea.angle);
  const normalizedTargets = Array.isArray(targets)
    ? [...new Set(targets.map((target) => normalizeText(target).toLowerCase()).filter(Boolean))]
    : [];
  const blockers = factValidation.blockers.map((blocker) => `fact_review:${blocker}`);

  if (!title) blockers.push("idea:title");
  if (!angle) blockers.push("idea:angle");
  if (normalizedTargets.length === 0) blockers.push("targets:required");
  if (normalizedTargets.some((target) => !SUPPORTED_TARGETS.has(target))) blockers.push("targets:unsupported");

  const claims = Array.isArray(factReview.claims)
    ? factReview.claims.map(normalizeText).filter(Boolean)
    : [];
  const rawSources = Array.isArray(factReview.sources) ? factReview.sources : [];
  const validSourceIndices = new Set(rawSources.flatMap((source, index) => (
    inspectFactSource(source).valid ? [index] : []
  )));
  const citations = Array.isArray(factReview.claim_citations) ? factReview.claim_citations : [];
  const usedSourceIndices = new Set();
  const claimInputs = claims.map((text, claimIndex) => {
    const sourceIndices = citations
      .filter((citation) => citation?.claim_index === claimIndex && Array.isArray(citation.source_indices))
      .flatMap((citation) => citation.source_indices)
      .filter((sourceIndex) => validSourceIndices.has(sourceIndex));
    const uniqueSourceIndices = [...new Set(sourceIndices)];
    uniqueSourceIndices.forEach((sourceIndex) => usedSourceIndices.add(sourceIndex));
    return { id: `claim-${claimIndex + 1}`, text, sourceIndices: uniqueSourceIndices };
  });
  const retainedSourceIndices = [...usedSourceIndices].sort((left, right) => left - right);
  const sourceIdByIndex = new Map(retainedSourceIndices.map((sourceIndex, index) => [sourceIndex, `source-${index + 1}`]));
  const sources = retainedSourceIndices.map((sourceIndex) => {
    const url = rawSources[sourceIndex];
    return {
      id: sourceIdByIndex.get(sourceIndex),
      url,
      hostname: inspectFactSource(url).hostname,
    };
  });
  const sourcedClaims = claimInputs.map(({ sourceIndices, ...claim }) => ({
    ...claim,
    sourceRefs: sourceIndices.map((sourceIndex) => sourceIdByIndex.get(sourceIndex)),
  }));
  const ready = blockers.length === 0;
  const fingerprintPayload = {
    idea: { title, angle },
    targets: normalizedTargets,
    claims: sourcedClaims,
    sources,
    constraints: CONSTRAINTS,
  };

  return {
    status: ready ? "ready_for_script_generation" : "blocked",
    ready,
    blockers,
    idea: fingerprintPayload.idea,
    targets: normalizedTargets,
    claims: sourcedClaims,
    sources,
    constraints: [...CONSTRAINTS],
    inputFingerprint: ready
      ? createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex")
      : null,
    factReview: {
      reviewedAt: normalizeText(factReview.reviewed_at) || null,
      contentVerification: factValidation.contentVerification,
      networkVerification: factValidation.networkVerification,
    },
    sourceContentFetched: false,
    factsGenerated: false,
    scriptGenerated: false,
    modelCalls: 0,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    businessResult: false,
  };
}
