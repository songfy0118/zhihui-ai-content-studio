import { createHash } from "node:crypto";

export const DOUYIN_VIRAL_REFERENCE_POLICY = Object.freeze({
  minimumQualifiedSamples: 100,
  minimumVisibleEngagement: 10_000,
  minimumIndependentCreators: 20,
  minimumOccurrencesPerPattern: 3,
  minimumReusablePatterns: 4,
  allowedFormats: Object.freeze(["image_text", "video"]),
  allowedHookPatterns: Object.freeze([
    "familiar_anchor_conflict",
    "counterintuitive_claim",
    "specific_number",
    "identity_stakes",
    "strong_question",
    "extreme_contrast",
  ]),
});

const FORMAT_SET = new Set(DOUYIN_VIRAL_REFERENCE_POLICY.allowedFormats);
const PATTERN_SET = new Set(DOUYIN_VIRAL_REFERENCE_POLICY.allowedHookPatterns);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedText(value, maximumLength) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function normalizedDouyinUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
    if (url.protocol !== "https:" || hostname !== "douyin.com" || !/^\/(?:video|note)\/\d+\/?$/u.test(url.pathname)) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedSample(value) {
  const id = normalizedText(value?.id, 120);
  const url = normalizedDouyinUrl(value?.url);
  const creatorId = normalizedText(value?.creatorId, 160);
  const title = normalizedText(value?.title, 300);
  const format = FORMAT_SET.has(value?.format) ? value.format : null;
  const hookPattern = PATTERN_SET.has(value?.hookPattern) ? value.hookPattern : null;
  const visibleEngagement = value?.visibleEngagement;
  if (
    !id
    || !url
    || !creatorId
    || !title
    || !format
    || !hookPattern
    || !Number.isInteger(visibleEngagement)
    || visibleEngagement < 0
    || value?.metricSource !== "douyin_visible_result"
    || value?.aiOrTechnologyRelevant !== true
  ) return null;
  return {
    id,
    url,
    creatorId,
    title,
    format,
    hookPattern,
    visibleEngagement,
    metricSource: "douyin_visible_result",
    aiOrTechnologyRelevant: true,
  };
}

function safeResult(fields = {}) {
  return {
    status: "douyin_viral_reference_benchmark_blocked",
    blockers: [],
    policy: { ...DOUYIN_VIRAL_REFERENCE_POLICY },
    observedSampleCount: 0,
    validUniqueSampleCount: 0,
    invalidSampleCount: 0,
    duplicateSampleCount: 0,
    qualifiedSampleCount: 0,
    independentCreatorCount: 0,
    reusablePatternCount: 0,
    formatCounts: { image_text: 0, video: 0 },
    reusablePatterns: [],
    benchmarkFingerprint: null,
    readyForHookCalibration: false,
    generatedTitles: false,
    draftChanged: false,
    draftSaved: false,
    publishTriggered: false,
    externalCalls: false,
    ...fields,
  };
}

export function assessDouyinViralReferenceBenchmark(samples) {
  if (!Array.isArray(samples)) return safeResult({ blockers: ["douyin_reference_samples_required"] });

  const uniqueByUrl = new Map();
  let invalidSampleCount = 0;
  let duplicateSampleCount = 0;
  for (const candidate of samples) {
    const sample = normalizedSample(candidate);
    if (!sample) {
      invalidSampleCount += 1;
      continue;
    }
    if (uniqueByUrl.has(sample.url)) {
      duplicateSampleCount += 1;
      continue;
    }
    uniqueByUrl.set(sample.url, sample);
  }

  const validSamples = [...uniqueByUrl.values()];
  const qualified = validSamples.filter((sample) => sample.visibleEngagement >= DOUYIN_VIRAL_REFERENCE_POLICY.minimumVisibleEngagement);
  const creators = new Set(qualified.map((sample) => sample.creatorId));
  const patternCounts = new Map();
  const formatCounts = { image_text: 0, video: 0 };
  for (const sample of qualified) {
    patternCounts.set(sample.hookPattern, (patternCounts.get(sample.hookPattern) ?? 0) + 1);
    formatCounts[sample.format] += 1;
  }
  const reusablePatterns = [...patternCounts.entries()]
    .filter(([, count]) => count >= DOUYIN_VIRAL_REFERENCE_POLICY.minimumOccurrencesPerPattern)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([hookPattern, sampleCount]) => ({ hookPattern, sampleCount }));

  const blockers = [];
  if (invalidSampleCount) blockers.push("invalid_douyin_reference_samples_present");
  if (qualified.length < DOUYIN_VIRAL_REFERENCE_POLICY.minimumQualifiedSamples) blockers.push("not_enough_high_engagement_samples");
  if (creators.size < DOUYIN_VIRAL_REFERENCE_POLICY.minimumIndependentCreators) blockers.push("not_enough_independent_creators");
  if (reusablePatterns.length < DOUYIN_VIRAL_REFERENCE_POLICY.minimumReusablePatterns) blockers.push("not_enough_repeated_hook_patterns");

  const benchmarkPayload = {
    policy: DOUYIN_VIRAL_REFERENCE_POLICY,
    qualified: qualified.map(({ id, url, creatorId, title, format, hookPattern, visibleEngagement }) => ({
      id,
      url,
      creatorId,
      title,
      format,
      hookPattern,
      visibleEngagement,
    })),
    reusablePatterns,
  };
  return safeResult({
    status: blockers.length ? "douyin_viral_reference_benchmark_blocked" : "douyin_viral_reference_benchmark_ready",
    blockers,
    observedSampleCount: samples.length,
    validUniqueSampleCount: validSamples.length,
    invalidSampleCount,
    duplicateSampleCount,
    qualifiedSampleCount: qualified.length,
    independentCreatorCount: creators.size,
    reusablePatternCount: reusablePatterns.length,
    formatCounts,
    reusablePatterns,
    benchmarkFingerprint: hash(benchmarkPayload),
    readyForHookCalibration: blockers.length === 0,
  });
}
