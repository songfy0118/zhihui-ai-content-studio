import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { assessRssTransport, auditRssMetadataQuality, buildRssNewsPreview, dedupeRssItems, diagnoseRssFailure, normalizeCanonicalUrl, parseRssItems } from "../bridge/rss-news-preview.mjs";

const source = {
  id: "official-ai",
  name: "Official AI",
  category: "ai",
  language: "en",
  sourceType: "rss",
  baseUrl: "https://example.com/news/",
  feedUrl: "https://example.com/news/feed.xml",
  enabled: true,
  requiresLogin: false,
  rightsPolicy: "official_feed_metadata_with_attribution",
  feedEvidenceUrl: "https://example.com/news/",
};

test("normalizes canonical URLs without tracking parameters", () => {
  assert.equal(normalizeCanonicalUrl("/story?utm_source=test&id=2#top", source.baseUrl), "https://example.com/story?id=2");
  assert.equal(normalizeCanonicalUrl("http://example.com/story", source.baseUrl), null);
});

test("parses RSS and Atom metadata without returning full article bodies", () => {
  const rss = `<rss><channel><item><title><![CDATA[AI &amp; Work]]></title><link>https://example.com/story?utm_medium=rss</link><pubDate>Thu, 20 Aug 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Short official summary.</p>]]></description></item></channel></rss>`;
  const atom = `<feed><entry><title>Agent update</title><link href="https://example.com/agent"/><updated>2026-08-21T08:00:00Z</updated><summary>Release notes</summary></entry></feed>`;
  const [rssItem] = parseRssItems(rss, source);
  const [atomItem] = parseRssItems(atom, source);
  assert.equal(rssItem.title, "AI & Work");
  assert.equal(rssItem.canonicalUrl, "https://example.com/story");
  assert.equal(rssItem.summary, "Short official summary.");
  assert.equal(atomItem.canonicalUrl, "https://example.com/agent");
  assert.equal(atomItem.publishedAt, "2026-08-21T08:00:00.000Z");
});

test("omits feed summaries when source terms allow display-only metadata", () => {
  const displayOnlySource = { ...source, id: "display-only", feedSummaryPolicy: "omit" };
  const [item] = parseRssItems(`<rss><channel><item><title>Startup funding</title><link>https://example.com/funding</link><description>Feed text must not be transformed or reused.</description></item></channel></rss>`, displayOnlySource);
  assert.equal(item.title, "Startup funding");
  assert.equal(item.canonicalUrl, "https://example.com/funding");
  assert.equal(item.summary, "");
});

test("applies source path filters before the per-source item limit", () => {
  const filteredSource = { ...source, includePathPrefixes: ["/news/ai/"] };
  const rss = `<rss><channel>
    <item><title>Payments update</title><link>https://example.com/products/payments</link></item>
    <item><title>AI update one</title><link>https://example.com/news/ai/one</link></item>
    <item><title>AI update two</title><link>https://example.com/news/ai/two</link></item>
  </channel></rss>`;
  const items = parseRssItems(rss, filteredSource, 2);
  assert.deepEqual(items.map((item) => item.title), ["AI update one", "AI update two"]);
});

test("deduplicates repeated URL or same-source title fingerprints", () => {
  const items = parseRssItems(`<rss><channel><item><title>One</title><link>https://example.com/one</link></item><item><title>One</title><link>https://example.com/two</link></item><item><title>Three</title><link>https://example.com/one</link></item></channel></rss>`, source, 10);
  assert.equal(dedupeRssItems(items).length, 1);
});

test("audits RSS metadata freshness and registered provenance without fetching article bodies", () => {
  const items = [
    ...parseRssItems(`<rss><channel><item><title>Fresh</title><link>https://example.com/fresh</link><pubDate>Fri, 21 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`, source),
    ...parseRssItems(`<rss><channel><item><title>Recent</title><link>https://example.com/recent</link><pubDate>Wed, 19 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`, source),
    ...parseRssItems(`<rss><channel><item><title>No date</title><link>https://example.com/no-date</link></item></channel></rss>`, source),
  ];
  const audit = auditRssMetadataQuality(items, [source], { asOf: new Date("2026-08-21T13:00:00Z") });

  assert.deepEqual(audit.summary, {
    itemsAudited: 3,
    provenanceReadyItems: 3,
    usableTimestampItems: 2,
    within24Hours: 1,
    within72Hours: 2,
    within7Days: 2,
    olderThan7Days: 0,
    missingOrInvalidTimestamps: 1,
    futureTimestampsRequiringReview: 0,
    metadataQualityReadyItems: 2,
  });
  assert.equal(audit.items[0].freshnessStatus, "within_24_hours");
  assert.equal(audit.items[0].metadataProvenanceReady, true);
  assert.equal(audit.items[0].sourceEvidenceUrl, "https://example.com/news/");
  assert.equal(audit.items.every((item) => item.articleBodyFetched === false), true);
  assert.equal(audit.articleBodiesFetched, false);
  assert.equal(audit.factsVerified, false);
});

test("flags future timestamps and unregistered sources for human review", () => {
  const [item] = parseRssItems(`<rss><channel><item><title>Future</title><link>https://example.com/future</link><pubDate>Sat, 22 Aug 2026 13:00:00 GMT</pubDate></item></channel></rss>`, source);
  const audit = auditRssMetadataQuality([{ ...item, sourceId: "unknown" }], [source], { asOf: new Date("2026-08-21T13:00:00Z") });

  assert.equal(audit.items[0].freshnessStatus, "future_timestamp_requires_review");
  assert.equal(audit.items[0].metadataProvenanceReady, false);
  assert.equal(audit.summary.futureTimestampsRequiringReview, 1);
  assert.equal(audit.summary.provenanceReadyItems, 0);
  assert.equal(audit.summary.metadataQualityReadyItems, 0);
});

test("builds a partial live preview with explicit source health and no writes", async () => {
  const failedSource = { ...source, id: "failed", name: "Failed", feedUrl: "https://failed.example/feed.xml" };
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("failed")) return new Response("blocked", { status: 403 });
    return new Response(`<rss><channel><item><title>Verified feed entry</title><link>https://example.com/live</link><pubDate>Fri, 21 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  const preview = await buildRssNewsPreview({ sources: [source, failedSource], fetcher, now: () => new Date("2026-08-21T13:00:00Z") });
  assert.equal(preview.status, "preview_ready");
  assert.deepEqual(preview.summary, { feedsAttempted: 2, readySources: 1, failedSources: 1, itemsReturned: 1 });
  assert.equal(preview.sourceHealth.find((row) => row.sourceId === "failed").errorCode, "http_403");
  assert.equal(preview.sourceHealth.find((row) => row.sourceId === "failed").failureClass, "access_refused");
  assert.equal(preview.sourceHealth.find((row) => row.sourceId === "failed").retryable, false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers["User-Agent"], "ZhihuiAIContentStudio/0.1 (+https://github.com/songfy0118/zhihui-ai-content-studio)");
  assert.match(requests[0].options.headers.Accept, /application\/rss\+xml/);
  assert.deepEqual(preview.transportAssessment, {
    status: "mixed_reachability",
    reachableSources: 1,
    failedSources: 1,
    tlsOrProxyFailures: 0,
    runtimeOutboundReachable: true,
    globalOutageProven: false,
    operatorAction: "inspect_failed_source_paths",
  });
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.publishTriggered, false);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.metadataQuality.itemsAudited, 1);
  assert.equal(preview.metadataQuality.provenanceReadyItems, 1);
  assert.equal(preview.metadataQuality.within24Hours, 1);
  assert.equal(preview.metadataQuality.articleBodiesFetched, false);
});

test("reports a safe network cause code without swallowing source failures", async () => {
  const fetcher = async () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "ENOTFOUND" };
    throw error;
  };
  const preview = await buildRssNewsPreview({ sources: [source], fetcher });
  assert.equal(preview.sourceHealth[0].errorCode, "network_enotfound");
  assert.equal(preview.sourceHealth[0].failureClass, "network_error");
  assert.equal(preview.sourceHealth[0].retryable, true);
});

test("classifies a cause-less fetch TypeError as a retryable network failure", async () => {
  const fetcher = async () => {
    throw new TypeError("fetch failed");
  };
  const preview = await buildRssNewsPreview({ sources: [source], fetcher });
  assert.equal(preview.sourceHealth[0].errorCode, "network_fetch_failed");
  assert.equal(preview.sourceHealth[0].failureClass, "network_error");
  assert.equal(preview.sourceHealth[0].retryable, true);
  assert.equal(preview.sourceHealth[0].operatorAction, "retry_later");
});

test("cancels a chunked feed as soon as it exceeds the byte limit", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123456"));
      controller.enqueue(new TextEncoder().encode("789012"));
    },
    cancel(reason) {
      cancelled = reason === "feed_too_large";
    },
  });
  const fetcher = async () => new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } });
  const preview = await buildRssNewsPreview({ sources: [source], fetcher, maxBytes: 10 });
  assert.equal(preview.sourceHealth[0].errorCode, "feed_too_large");
  assert.equal(preview.sourceHealth[0].failureClass, "feed_limit_exceeded");
  assert.equal(preview.sourceHealth[0].itemsParsed, 0);
  assert.equal(cancelled, true);
});

test("classifies TLS or proxy failures without weakening transport security", () => {
  assert.deepEqual(diagnoseRssFailure("network_err_ssl_packet_length_too_long"), {
    failureClass: "tls_or_proxy_error",
    retryable: true,
    operatorAction: "check_tls_or_proxy_and_retry",
  });
});

test("distinguishes partial feed failure from an unproven runtime-wide outage", () => {
  const partial = assessRssTransport([
    { status: "ready", failureClass: null },
    { status: "error", failureClass: "tls_or_proxy_error" },
  ]);
  assert.equal(partial.status, "mixed_reachability");
  assert.equal(partial.runtimeOutboundReachable, true);
  assert.equal(partial.tlsOrProxyFailures, 1);
  assert.equal(partial.globalOutageProven, false);

  const inconclusive = assessRssTransport([
    { status: "error", failureClass: "network_error" },
    { status: "error", failureClass: "tls_or_proxy_error" },
  ]);
  assert.equal(inconclusive.status, "all_feeds_failed_inconclusive");
  assert.equal(inconclusive.runtimeOutboundReachable, false);
  assert.equal(inconclusive.globalOutageProven, false);
  assert.equal(inconclusive.operatorAction, "inspect_runtime_network_and_retry");
});

test("wires the preview as an explicit read-only UI action", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /读取公开 RSS（只读）/);
  assert.match(page, /fetch\("\/api\/news\/preview"/);
  assert.match(page, /数据库写入/);
  assert.match(page, /newsPreview\.sourceHealth\.map/);
  assert.match(page, /source\.operatorAction/);
  assert.match(page, /RSS 元数据质量审计/);
  assert.match(page, /metadataQuality\.provenanceReadyItems/);
  assert.match(page, /文章正文读取 0 · 事实核验 0 · 数据库写入 0 · 发布 0/);
  assert.match(route, /buildRssNewsPreview/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
