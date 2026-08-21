const ALLOWED_SOURCES = new Set(["platform_api", "platform_export"]);
const ALLOWED_PLATFORMS = new Set(["douyin", "tiktok", "xiaohongshu"]);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateMetricProvenance(metric = {}) {
  const requiredCounters = ["views", "likes", "comments", "shares", "saves"];
  const missing = [];
  if (!ALLOWED_PLATFORMS.has(metric.platform)) missing.push("platform");
  if (!ALLOWED_SOURCES.has(metric.sourceKind)) missing.push("sourceKind");
  if (typeof metric.externalPostId !== "string" || !metric.externalPostId.trim()) missing.push("externalPostId");
  if (typeof metric.capturedAt !== "string" || !Number.isFinite(Date.parse(metric.capturedAt))) missing.push("capturedAt");
  for (const counter of requiredCounters) {
    if (!isNonNegativeInteger(metric[counter])) missing.push(counter);
  }
  if (typeof metric.completionRate !== "number" || metric.completionRate < 0 || metric.completionRate > 100) missing.push("completionRate");
  return { verified: missing.length === 0, missing };
}

export function filterVerifiedMetrics(rows = []) {
  const metrics = rows.filter((row) => validateMetricProvenance(row).verified);
  return {
    metrics,
    status: metrics.length ? "verified" : "awaiting_verified_import",
    realDataOnly: true,
    recordsExcluded: rows.length - metrics.length,
    acceptedSources: [...ALLOWED_SOURCES],
    writePerformed: false,
    publishTriggered: false,
  };
}
