import { createHash } from "node:crypto";

const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_MAX_ITEMS = 5;
const RSS_USER_AGENT = "ZhihuiAIContentStudio/0.1 (+https://github.com/songfy0118/zhihui-ai-content-studio)";
const TRACKING_PARAMETERS = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i;

export function diagnoseRssFailure(errorCode) {
  if (!errorCode) return { failureClass: null, retryable: false, operatorAction: null };
  if (/^network_err_ssl_/.test(errorCode)) return { failureClass: "tls_or_proxy_error", retryable: true, operatorAction: "check_tls_or_proxy_and_retry" };
  if (errorCode === "timeout") return { failureClass: "timeout", retryable: true, operatorAction: "retry_later" };
  if (errorCode === "http_429") return { failureClass: "rate_limited", retryable: true, operatorAction: "respect_retry_window" };
  if (/^http_5\d\d$/.test(errorCode)) return { failureClass: "upstream_error", retryable: true, operatorAction: "retry_later" };
  if (/^http_(?:401|403)$/.test(errorCode)) return { failureClass: "access_refused", retryable: false, operatorAction: "manual_source_review" };
  if (errorCode === "http_404") return { failureClass: "feed_not_found", retryable: false, operatorAction: "verify_feed_url" };
  if (errorCode === "feed_too_large") return { failureClass: "feed_limit_exceeded", retryable: false, operatorAction: "review_source_limits" };
  if (/^network_/.test(errorCode)) return { failureClass: "network_error", retryable: true, operatorAction: "retry_later" };
  return { failureClass: "fetch_error", retryable: false, operatorAction: "inspect_source_failure" };
}

export function assessRssTransport(sourceHealth = []) {
  const reachableSources = sourceHealth.filter((source) => source.status === "ready" || source.status === "empty").length;
  const failedSources = sourceHealth.filter((source) => source.status === "error").length;
  const tlsOrProxyFailures = sourceHealth.filter((source) => source.failureClass === "tls_or_proxy_error").length;

  if (!sourceHealth.length) {
    return { status: "not_assessed", reachableSources, failedSources, tlsOrProxyFailures, runtimeOutboundReachable: false, globalOutageProven: false, operatorAction: null };
  }
  if (!failedSources) {
    return { status: "all_feeds_reachable", reachableSources, failedSources, tlsOrProxyFailures, runtimeOutboundReachable: true, globalOutageProven: false, operatorAction: null };
  }
  if (reachableSources) {
    return { status: "mixed_reachability", reachableSources, failedSources, tlsOrProxyFailures, runtimeOutboundReachable: true, globalOutageProven: false, operatorAction: "inspect_failed_source_paths" };
  }
  return { status: "all_feeds_failed_inconclusive", reachableSources, failedSources, tlsOrProxyFailures, runtimeOutboundReachable: false, globalOutageProven: false, operatorAction: "inspect_runtime_network_and_retry" };
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function stripMarkup(value = "") {
  return decodeXml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return match[1];
  }
  return "";
}

function readLink(block) {
  const attributeLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
  return attributeLink?.[1] ?? readTag(block, ["link", "guid", "id"]);
}

function normalizePublishedAt(value) {
  if (!value) return null;
  const timestamp = Date.parse(stripMarkup(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeCanonicalUrl(value, baseUrl) {
  try {
    const url = new URL(stripMarkup(value), baseUrl);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function isCanonicalUrlAllowed(canonicalUrl, source) {
  if (!source.includePathPrefixes?.length) return true;
  try {
    const path = new URL(canonicalUrl).pathname;
    return source.includePathPrefixes.some((prefix) => path.startsWith(prefix));
  } catch {
    return false;
  }
}

export function parseRssItems(xml, source, maxItems = DEFAULT_MAX_ITEMS) {
  if (typeof xml !== "string" || !source?.id || !source?.baseUrl) return [];
  const rssBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomBlocks = rssBlocks.length ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = rssBlocks.length ? rssBlocks : atomBlocks;

  return blocks.flatMap((block) => {
    const title = stripMarkup(readTag(block, ["title"]));
    const canonicalUrl = normalizeCanonicalUrl(readLink(block), source.baseUrl);
    if (!title || !canonicalUrl || !isCanonicalUrlAllowed(canonicalUrl, source)) return [];
    const summary = source.feedSummaryPolicy === "omit"
      ? ""
      : stripMarkup(readTag(block, ["description", "summary", "content:encoded"])).slice(0, 240);
    const publishedAt = normalizePublishedAt(readTag(block, ["pubDate", "published", "updated", "dc:date"]));
    const contentHash = createHash("sha256").update(`${source.id}\n${title.toLocaleLowerCase("en-US")}`).digest("hex");
    return [{
      id: `${source.id}:${contentHash.slice(0, 16)}`,
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      language: source.language,
      title,
      summary,
      canonicalUrl,
      publishedAt,
      contentHash,
    }];
  }).slice(0, maxItems);
}

export function dedupeRssItems(items = []) {
  const urls = new Set();
  const hashes = new Set();
  return items.filter((item) => {
    if (!item?.canonicalUrl || !item?.contentHash || urls.has(item.canonicalUrl) || hashes.has(item.contentHash)) return false;
    urls.add(item.canonicalUrl);
    hashes.add(item.contentHash);
    return true;
  });
}

function assessPublishedAt(publishedAt, asOfMs) {
  const publishedMs = Date.parse(publishedAt ?? "");
  if (!Number.isFinite(publishedMs)) return { ageHours: null, freshnessStatus: "timestamp_missing_or_invalid" };
  const ageHours = (asOfMs - publishedMs) / (60 * 60 * 1000);
  if (ageHours < 0) return { ageHours: Number(ageHours.toFixed(1)), freshnessStatus: "future_timestamp_requires_review" };
  if (ageHours <= 24) return { ageHours: Number(ageHours.toFixed(1)), freshnessStatus: "within_24_hours" };
  if (ageHours <= 72) return { ageHours: Number(ageHours.toFixed(1)), freshnessStatus: "within_72_hours" };
  if (ageHours <= 168) return { ageHours: Number(ageHours.toFixed(1)), freshnessStatus: "within_7_days" };
  return { ageHours: Number(ageHours.toFixed(1)), freshnessStatus: "older_than_7_days" };
}

export function auditRssMetadataQuality(items = [], sources = [], { asOf = new Date() } = {}) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const asOfMs = asOfDate.getTime();
  if (!Number.isFinite(asOfMs)) throw new TypeError("asOf must be a valid date");
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const auditedItems = items.map((item) => {
    const source = sourceById.get(item.sourceId);
    const freshness = assessPublishedAt(item.publishedAt, asOfMs);
    const metadataProvenanceReady = Boolean(
      source
      && source.enabled
      && !source.requiresLogin
      && source.sourceType === "rss"
      && source.feedUrl?.startsWith("https://")
      && source.rightsPolicy
      && item.canonicalUrl?.startsWith("https://"),
    );
    return {
      ...item,
      ...freshness,
      metadataProvenanceReady,
      sourceEvidenceUrl: source?.feedEvidenceUrl ?? source?.baseUrl ?? null,
      rightsPolicy: source?.rightsPolicy ?? null,
      collectionScope: "rss_metadata_only",
      articleBodyFetched: false,
    };
  });
  const usableTimestamp = (item) => item.ageHours !== null && item.ageHours >= 0;

  return {
    asOf: asOfDate.toISOString(),
    items: auditedItems,
    summary: {
      itemsAudited: auditedItems.length,
      provenanceReadyItems: auditedItems.filter((item) => item.metadataProvenanceReady).length,
      usableTimestampItems: auditedItems.filter(usableTimestamp).length,
      within24Hours: auditedItems.filter((item) => usableTimestamp(item) && item.ageHours <= 24).length,
      within72Hours: auditedItems.filter((item) => usableTimestamp(item) && item.ageHours <= 72).length,
      within7Days: auditedItems.filter((item) => usableTimestamp(item) && item.ageHours <= 168).length,
      olderThan7Days: auditedItems.filter((item) => usableTimestamp(item) && item.ageHours > 168).length,
      missingOrInvalidTimestamps: auditedItems.filter((item) => item.freshnessStatus === "timestamp_missing_or_invalid").length,
      futureTimestampsRequiringReview: auditedItems.filter((item) => item.freshnessStatus === "future_timestamp_requires_review").length,
      metadataQualityReadyItems: auditedItems.filter((item) => item.metadataProvenanceReady && usableTimestamp(item)).length,
    },
    articleBodiesFetched: false,
    factsVerified: false,
    databaseWrites: false,
    publishTriggered: false,
  };
}

async function fetchSourcePreview(source, { fetcher, maxBytes, maxItems, timeoutMs }) {
  const startedAt = Date.now();
  try {
    const response = await fetcher(source.feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": RSS_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const reportedBytes = Number(response.headers.get("content-length") ?? 0);
    if (reportedBytes > maxBytes) throw new Error("feed_too_large");
    const xml = await response.text();
    if (new TextEncoder().encode(xml).byteLength > maxBytes) throw new Error("feed_too_large");
    const items = parseRssItems(xml, source, maxItems);
    return {
      health: { sourceId: source.id, status: items.length ? "ready" : "empty", httpStatus: response.status, itemsParsed: items.length, durationMs: Date.now() - startedAt, errorCode: null, ...diagnoseRssFailure(null) },
      items,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch_failed";
    const causeCode = typeof error?.cause?.code === "string" ? error.cause.code.toLowerCase().replace(/[^a-z0-9_]/g, "") : "";
    const genericNetworkFailure = error?.name === "TypeError" && /^fetch failed$/i.test(message);
    const errorCode = /^http_\d{3}$/.test(message) || message === "feed_too_large" ? message : error?.name === "TimeoutError" ? "timeout" : causeCode ? `network_${causeCode}` : genericNetworkFailure ? "network_fetch_failed" : "fetch_failed";
    return {
      health: { sourceId: source.id, status: "error", httpStatus: errorCode.startsWith("http_") ? Number(errorCode.slice(5)) : null, itemsParsed: 0, durationMs: Date.now() - startedAt, errorCode, ...diagnoseRssFailure(errorCode) },
      items: [],
    };
  }
}

export async function buildRssNewsPreview({ sources = [], fetcher = fetch, maxBytes = DEFAULT_MAX_BYTES, maxItemsPerSource = DEFAULT_MAX_ITEMS, timeoutMs = 8_000, now = () => new Date() } = {}) {
  const rssSources = sources.filter((source) => source.enabled && !source.requiresLogin && source.sourceType === "rss" && source.feedUrl);
  const results = await Promise.all(rssSources.map((source) => fetchSourcePreview(source, { fetcher, maxBytes, maxItems: maxItemsPerSource, timeoutMs })));
  const rawItems = dedupeRssItems(results.flatMap((result) => result.items))
    .sort((left, right) => String(right.publishedAt ?? "").localeCompare(String(left.publishedAt ?? "")));
  const fetchedAt = now();
  const metadataQuality = auditRssMetadataQuality(rawItems, rssSources, { asOf: fetchedAt });
  const items = metadataQuality.items;
  const sourceHealth = results.map((result) => result.health);
  const readySources = sourceHealth.filter((source) => source.status === "ready").length;

  return {
    status: items.length ? "preview_ready" : "no_live_items",
    fetchedAt: fetchedAt.toISOString(),
    summary: {
      feedsAttempted: rssSources.length,
      readySources,
      failedSources: sourceHealth.filter((source) => source.status === "error").length,
      itemsReturned: items.length,
    },
    sourceHealth,
    transportAssessment: assessRssTransport(sourceHealth),
    metadataQuality: {
      asOf: metadataQuality.asOf,
      ...metadataQuality.summary,
      articleBodiesFetched: metadataQuality.articleBodiesFetched,
      factsVerified: metadataQuality.factsVerified,
      databaseWrites: metadataQuality.databaseWrites,
      publishTriggered: metadataQuality.publishTriggered,
    },
    items,
    contentFetched: items.length > 0,
    factsVerified: false,
    humanReviewRequired: true,
    externalCalls: rssSources.length,
    databaseWrites: false,
    publishTriggered: false,
  };
}
