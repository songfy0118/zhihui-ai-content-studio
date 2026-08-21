const PLACEHOLDER_HOSTS = new Set(["example.com", "example.org", "example.net", "localhost", "127.0.0.1"]);

export function inspectFactSource(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return {
      valid: url.protocol === "https:" && !PLACEHOLDER_HOSTS.has(hostname) && !hostname.endsWith(".invalid"),
      hostname,
    };
  } catch {
    return { valid: false, hostname: null };
  }
}

export function validateFactReview(review = {}) {
  const claims = Array.isArray(review.claims) ? review.claims.filter((claim) => typeof claim === "string" && claim.trim()) : [];
  const sources = Array.isArray(review.sources) ? review.sources : [];
  const inspectedSources = sources.map(inspectFactSource);
  const validSourceIndices = new Set(inspectedSources.flatMap((source, index) => source.valid ? [index] : []));
  const distinctHosts = new Set(inspectedSources.filter((source) => source.valid).map((source) => source.hostname));
  const citations = Array.isArray(review.claim_citations) ? review.claim_citations : [];
  const citedClaims = new Set();

  for (const citation of citations) {
    if (!Number.isInteger(citation?.claim_index) || citation.claim_index < 0 || citation.claim_index >= claims.length) continue;
    if (!Array.isArray(citation.source_indices) || !citation.source_indices.some((index) => validSourceIndices.has(index))) continue;
    citedClaims.add(citation.claim_index);
  }

  const checks = [
    { id: "review_status", ready: review.status === "reviewed", detail: "Fact review must be explicitly marked reviewed" },
    { id: "review_date", ready: /^\d{4}-\d{2}-\d{2}$/.test(review.reviewed_at ?? ""), detail: "Fact review must retain a review date" },
    { id: "claims", ready: claims.length > 0, detail: "At least one concrete claim is required" },
    { id: "sources", ready: validSourceIndices.size >= 2, detail: "At least two non-placeholder HTTPS sources are required" },
    { id: "source_diversity", ready: distinctHosts.size >= 2, detail: "Sources must span at least two distinct hosts" },
    { id: "claim_citations", ready: claims.length > 0 && citedClaims.size === claims.length, detail: "Every claim must cite at least one retained source" },
  ];
  const blockers = checks.filter((check) => !check.ready).map((check) => check.id);

  return {
    ready: blockers.length === 0,
    checks,
    blockers,
    claimCount: claims.length,
    sourceCount: validSourceIndices.size,
    distinctHostCount: distinctHosts.size,
    citedClaimCount: citedClaims.size,
    networkVerification: "not_run",
    contentVerification: review.status === "reviewed" ? "human_recorded" : "not_recorded",
  };
}
