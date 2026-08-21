import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildRssNewsPreview, dedupeRssItems, normalizeCanonicalUrl, parseRssItems } from "../bridge/rss-news-preview.mjs";

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

test("deduplicates repeated URL or same-source title fingerprints", () => {
  const items = parseRssItems(`<rss><channel><item><title>One</title><link>https://example.com/one</link></item><item><title>One</title><link>https://example.com/two</link></item><item><title>Three</title><link>https://example.com/one</link></item></channel></rss>`, source, 10);
  assert.equal(dedupeRssItems(items).length, 1);
});

test("builds a partial live preview with explicit source health and no writes", async () => {
  const failedSource = { ...source, id: "failed", name: "Failed", feedUrl: "https://failed.example/feed.xml" };
  const fetcher = async (url) => {
    if (url.includes("failed")) return new Response("blocked", { status: 403 });
    return new Response(`<rss><channel><item><title>Verified feed entry</title><link>https://example.com/live</link><pubDate>Fri, 21 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  const preview = await buildRssNewsPreview({ sources: [source, failedSource], fetcher, now: () => new Date("2026-08-21T13:00:00Z") });
  assert.equal(preview.status, "preview_ready");
  assert.deepEqual(preview.summary, { feedsAttempted: 2, readySources: 1, failedSources: 1, itemsReturned: 1 });
  assert.equal(preview.sourceHealth.find((row) => row.sourceId === "failed").errorCode, "http_403");
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.publishTriggered, false);
  assert.equal(preview.factsVerified, false);
});

test("reports a safe network cause code without swallowing source failures", async () => {
  const fetcher = async () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "ENOTFOUND" };
    throw error;
  };
  const preview = await buildRssNewsPreview({ sources: [source], fetcher });
  assert.equal(preview.sourceHealth[0].errorCode, "network_enotfound");
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
  assert.match(route, /buildRssNewsPreview/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
