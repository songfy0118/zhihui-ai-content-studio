import { createHash } from "node:crypto";

const METRIC_ID = /^metric_[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_SOURCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PUBLIC_ORIGINS = Object.freeze({
  xiaohongshu: "https://www.xiaohongshu.com",
  douyin: "https://www.douyin.com",
});
const ALLOWED_SOURCES = new Set(["platform_api", "platform_export"]);
const COUNTERS = Object.freeze(["views", "likes", "comments", "shares", "saves", "followers"]);

export const PLATFORM_TEXT_METRICS_PROJECTION_COLUMNS = Object.freeze([
  "id",
  "idea_id",
  "platform",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "followers",
  "completion_rate",
  "source_kind",
  "external_post_id",
  "captured_at",
  "imported_at",
  "content_fingerprint",
  "published_post_url",
  "published_at",
  "source_reference",
  "source_evidence_fingerprint",
  "created_at",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function strictIso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function validPublicationUrl(platform, url, externalPostId) {
  try {
    const parsed = new URL(url);
    const expectedPath = platform === "xiaohongshu" ? `/explore/${externalPostId}` : `/video/${externalPostId}`;
    return parsed.origin === PUBLIC_ORIGINS[platform] && parsed.pathname === expectedPath && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

function expectedMetricId(row) {
  return `metric_${hash({
    platform: row.platform,
    externalPostId: row.external_post_id,
    capturedAt: row.captured_at,
    sourceEvidenceFingerprint: row.source_evidence_fingerprint,
  })}`;
}

function normalizeRow(row) {
  if (!row || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...PLATFORM_TEXT_METRICS_PROJECTION_COLUMNS].sort())) return null;
  const publishedAt = strictIso(row.published_at);
  const capturedAt = strictIso(row.captured_at);
  const importedAt = strictIso(row.imported_at);
  const createdAt = strictIso(row.created_at);
  if (
    !METRIC_ID.test(row.id ?? "")
    || row.id !== expectedMetricId(row)
    || !SAFE_ID.test(row.idea_id ?? "")
    || !PUBLIC_ORIGINS[row.platform]
    || !SAFE_ID.test(row.external_post_id ?? "")
    || !validPublicationUrl(row.platform, row.published_post_url, row.external_post_id)
    || !publishedAt
    || !capturedAt
    || !importedAt
    || !createdAt
    || Date.parse(publishedAt) > Date.parse(capturedAt)
    || Date.parse(capturedAt) > Date.parse(importedAt)
    || !ALLOWED_SOURCES.has(row.source_kind)
    || !SAFE_SOURCE_REFERENCE.test(row.source_reference ?? "")
    || !HASH.test(row.content_fingerprint ?? "")
    || !HASH.test(row.source_evidence_fingerprint ?? "")
    || COUNTERS.some((counter) => !Number.isSafeInteger(row[counter]) || row[counter] < 0)
    || !Number.isFinite(row.completion_rate)
  ) return null;
  return {
    metricId: row.id,
    ideaId: row.idea_id,
    platform: row.platform,
    contentFingerprint: row.content_fingerprint,
    externalPostId: row.external_post_id,
    publishedPostUrl: row.published_post_url,
    publishedAt,
    capturedAt,
    importedAt,
    sourceKind: row.source_kind,
    sourceReference: row.source_reference,
    sourceEvidenceFingerprint: row.source_evidence_fingerprint,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    followers: row.followers,
    completionRate: row.completion_rate,
    verificationStatus: "strong_source_verified_read_only",
  };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_metrics_projection_blocked",
    blockers: [],
    metrics: [],
    metricCount: 0,
    complete: false,
    realDataOnly: true,
    eligibleForWeightUpdatePreview: false,
    learningUpdateEligible: false,
    learningWeightsUpdated: false,
    inspectedDataRows: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextMetricsReadSql(metricCount) {
  if (!Number.isSafeInteger(metricCount) || metricCount < 1 || metricCount > 20) throw new Error("metric_count_invalid");
  return `SELECT ${PLATFORM_TEXT_METRICS_PROJECTION_COLUMNS.join(", ")}
FROM metrics
WHERE id IN (${Array.from({ length: metricCount }, () => "?").join(", ")})`;
}

export async function readPlatformTextMetricsProjection(d1, { metricIds = [] } = {}) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  if (
    !Array.isArray(metricIds)
    || metricIds.length < 1
    || metricIds.length > 20
    || new Set(metricIds).size !== metricIds.length
    || metricIds.some((id) => !METRIC_ID.test(id ?? ""))
  ) return safeResult({ blockers: ["metric_ids_invalid_or_duplicate"] });

  let result;
  try {
    result = await d1.prepare(buildPlatformTextMetricsReadSql(metricIds.length)).bind(...metricIds).all();
  } catch {
    return safeResult({ blockers: ["metrics_projection_read_failed"], inspectedDataRows: true });
  }
  const rows = Array.isArray(result?.results) ? result.results : [];
  const byId = new Map(rows.map((row) => [row?.id, row]));
  const metrics = metricIds.map((id) => normalizeRow(byId.get(id))).filter(Boolean);
  if (rows.length !== metricIds.length || byId.size !== metricIds.length || metrics.length !== metricIds.length) {
    return safeResult({ blockers: ["metrics_projection_incomplete_or_invalid"], inspectedDataRows: true });
  }
  return safeResult({
    status: "platform_text_metrics_projection_ready",
    metrics,
    metricCount: metrics.length,
    complete: true,
    eligibleForWeightUpdatePreview: true,
    inspectedDataRows: true,
  });
}
