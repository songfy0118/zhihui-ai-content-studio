import assert from "node:assert/strict";
import test from "node:test";

import { NEWS_SOURCE_CATALOG, summarizeNewsSourceCatalog, validateNewsSourceCatalog } from "../bridge/news-source-catalog.mjs";
import { assessManualSourceLinkHost, describeManualSourceLinkHost, listEvidenceHandoffSourceSuggestions, listManualSourceNameSuggestions } from "../app/manual-source-options.ts";

test("news source catalog allows only public no-login sources for automatic collection", () => {
  const validation = validateNewsSourceCatalog();
  assert.equal(validation.valid, true, validation.blockers.join(", "));
  assert.equal(NEWS_SOURCE_CATALOG.some((source) => source.enabled && source.requiresLogin), false);
  assert.equal(NEWS_SOURCE_CATALOG.every((source) => source.baseUrl.startsWith("https://")), true);
});

test("wechat remains a disabled manual-review source", () => {
  const wechat = NEWS_SOURCE_CATALOG.find((source) => source.id === "wechat-manual-import");
  assert.ok(wechat);
  assert.equal(wechat.enabled, false);
  assert.equal(wechat.sourceType, "manual_import");
  assert.equal(wechat.rightsPolicy, "user_supplied_links_summary_only");
});

test("Silicon Star Pro stays on the manual watchlist without automatic collection", () => {
  const source = NEWS_SOURCE_CATALOG.find((candidate) => candidate.id === "silicon-star-pro-wechat-manual");
  assert.ok(source);
  assert.equal(source.enabled, false);
  assert.equal(source.requiresLogin, true);
  assert.equal(source.sourceType, "manual_import");
  assert.equal(source.feedUrl, null);
  assert.deepEqual(source.editorialAliases, ["硅星人Pro", "硅星人"]);
  assert.equal(source.rightsPolicy, "user_supplied_links_summary_only");
  assert.equal(source.automaticCollectionBlockedReason, "wechat_requires_user_supplied_public_article_url");
});

test("manual source suggestions expose labels without enabling collection", () => {
  const suggestions = listManualSourceNameSuggestions(NEWS_SOURCE_CATALOG);
  assert.deepEqual(suggestions.map(({ id }) => id), ["silicon-star-pro-wechat-manual", "wechat-manual-import"]);
  assert.deepEqual(suggestions[0], {
    id: "silicon-star-pro-wechat-manual",
    name: "硅星人Pro · 公众号人工链接",
    aliases: ["硅星人Pro", "硅星人"],
    expectedHost: "mp.weixin.qq.com",
    expectedHosts: ["mp.weixin.qq.com"],
  });
  assert.equal(suggestions.some((source) => source.id === "qbitai"), false);
});

test("manual evidence handoff suggests registered editorial sources without changing collection policy", () => {
  const suggestions = listEvidenceHandoffSourceSuggestions(NEWS_SOURCE_CATALOG);
  assert.equal(suggestions.some((source) => source.id === "qbitai" && source.aliases.includes("量子位")), true);
  assert.equal(suggestions.some((source) => source.id === "silicon-star-pro-wechat-manual" && source.aliases.includes("硅星人Pro")), true);
  const siliconStar = NEWS_SOURCE_CATALOG.find((source) => source.id === "silicon-star-pro-wechat-manual");
  assert.equal(siliconStar?.enabled, false);
  assert.equal(siliconStar?.requiresLogin, true);
});

test("manual source link hints compare hosts without fetching the article", () => {
  const suggestions = listManualSourceNameSuggestions(NEWS_SOURCE_CATALOG);
  const sourceName = "硅星人Pro · 公众号人工链接";
  assert.match(describeManualSourceLinkHost(sourceName, "", suggestions), /请粘贴该来源的公开文章链接/);
  assert.match(describeManualSourceLinkHost(sourceName, "https://mp.weixin.qq.com/s/example", suggestions), /链接主机与已登记来源一致/);
  assert.match(describeManualSourceLinkHost(sourceName, "https://example.org/repost", suggestions), /当前链接为 example\.org/);
  assert.match(describeManualSourceLinkHost(sourceName, "http://mp.weixin.qq.com/s/example", suggestions), /链接必须使用公开 HTTPS/);
  assert.equal(describeManualSourceLinkHost("其他公开来源", "https://example.org/story", suggestions), null);
});

test("manual source host assessment blocks registered name or alias mismatches locally", () => {
  const suggestions = listEvidenceHandoffSourceSuggestions(NEWS_SOURCE_CATALOG);
  const mismatch = assessManualSourceLinkHost("量子位", "https://mp.weixin.qq.com/s/not-qbitai", suggestions);
  assert.equal(mismatch.status, "mismatch");
  assert.equal(mismatch.blocksPreview, true);
  assert.match(mismatch.message, /登记主机为 qbitai\.com/);

  const match = assessManualSourceLinkHost("硅星人Pro", "https://mp.weixin.qq.com/s/public-article", suggestions);
  assert.equal(match.status, "match");
  assert.equal(match.blocksPreview, false);
});

test("manual source host assessment blocks malformed and non-HTTPS links for custom sources", () => {
  const suggestions = listEvidenceHandoffSourceSuggestions(NEWS_SOURCE_CATALOG);
  for (const [canonicalUrl, message] of [
    ["not-a-url", /链接格式无效/],
    ["http://independent.news/story", /必须使用公开 HTTPS/],
  ]) {
    const assessment = assessManualSourceLinkHost("Independent News", canonicalUrl, suggestions);
    assert.equal(assessment.status, "invalid_link");
    assert.equal(assessment.blocksPreview, true);
    assert.match(assessment.message, message);
  }

  const validCustom = assessManualSourceLinkHost("Independent News", "https://independent.news/story", suggestions);
  assert.equal(validCustom.status, "unregistered");
  assert.equal(validCustom.blocksPreview, false);
  assert.equal(validCustom.message, null);
});

test("manual source host assessment blocks credentials, local and reserved hosts", () => {
  const suggestions = listEvidenceHandoffSourceSuggestions(NEWS_SOURCE_CATALOG);
  const cases = [
    ["https://user:secret@independent.news/story", /不能包含账号或密码/],
    ["https://localhost/story", /主机 localhost 不是可公开访问/],
    ["https://127.0.0.1/story", /主机 127\.0\.0\.1 不是可公开访问/],
    ["https://192.168.1.20/story", /主机 192\.168\.1\.20 不是可公开访问/],
    ["https://news.internal/story", /主机 news\.internal 不是可公开访问/],
    ["https://[::1]/story", /主机 ::1 不是可公开访问/],
  ];
  for (const [canonicalUrl, message] of cases) {
    const assessment = assessManualSourceLinkHost("Independent News", canonicalUrl, suggestions);
    assert.equal(assessment.status, "unsafe_link");
    assert.equal(assessment.blocksPreview, true);
    assert.match(assessment.message, message);
  }

  const publicIp = assessManualSourceLinkHost("Independent News", "https://8.8.8.8/story", suggestions);
  assert.equal(publicIp.status, "unregistered");
  assert.equal(publicIp.blocksPreview, false);
});

test("manual source host assessment blocks the selected lead's original host locally", () => {
  const suggestions = listEvidenceHandoffSourceSuggestions(NEWS_SOURCE_CATALOG);
  const sameHost = assessManualSourceLinkHost("Independent News", "https://www.origin.news/another-story", suggestions, ["origin.news"]);
  assert.equal(sameHost.status, "same_original_host");
  assert.equal(sameHost.blocksPreview, true);
  assert.match(sameHost.message, /需要独立来源/);
  const independent = assessManualSourceLinkHost("Independent News", "https://independent.news/story", suggestions, ["origin.news"]);
  assert.equal(independent.status, "unregistered");
  assert.equal(independent.blocksPreview, false);
});

test("catalog summary separates automatic and manual sources", () => {
  const summary = summarizeNewsSourceCatalog();
  assert.equal(summary.totalSources, 17);
  assert.equal(summary.enabledSources, 15);
  assert.equal(summary.rssSources, 9);
  assert.equal(summary.officialNewsrooms, 6);
  assert.equal(summary.manualReviewSources, 2);
});

test("Microsoft AI falls back to manual newsroom review after its feed refuses access", () => {
  const microsoft = NEWS_SOURCE_CATALOG.find((source) => source.id === "microsoft-ai-source");
  assert.ok(microsoft);
  assert.equal(microsoft.sourceType, "official_newsroom");
  assert.equal(microsoft.feedUrl, null);
  assert.equal(microsoft.automaticCollectionBlockedReason, "feed_access_refused_http_403");
  assert.equal(microsoft.rightsPolicy, "public_page_manual_metadata_with_attribution");
});

test("TechCrunch feed is metadata-only and keeps article acquisition blocked", () => {
  const techcrunch = NEWS_SOURCE_CATALOG.find((source) => source.id === "techcrunch");
  assert.ok(techcrunch);
  assert.equal(techcrunch.sourceType, "rss");
  assert.equal(techcrunch.feedUrl, "https://techcrunch.com/feed/");
  assert.equal(techcrunch.feedSummaryPolicy, "omit");
  assert.equal(techcrunch.rightsPolicy, "official_feed_display_only_with_attribution");
  assert.equal(techcrunch.requiresLogin, false);
  assert.equal(techcrunch.feedEvidenceUrl, "https://techcrunch.com/rss-terms-of-use/");
});

test("Anthropic is a public newsroom candidate without a claimed RSS feed", () => {
  const anthropic = NEWS_SOURCE_CATALOG.find((source) => source.id === "anthropic-newsroom");
  assert.ok(anthropic);
  assert.equal(anthropic.sourceType, "official_newsroom");
  assert.equal(anthropic.feedUrl, null);
  assert.equal(anthropic.requiresLogin, false);
  assert.equal(anthropic.enabled, true);
  assert.equal(anthropic.baseUrl, "https://www.anthropic.com/news");
});

test("SEC and Federal Reserve feeds retain first-party discovery evidence", () => {
  const expected = new Map([
    ["us-sec-press-releases", {
      feedUrl: "https://www.sec.gov/news/pressreleases.rss",
      feedEvidenceUrl: "https://www.sec.gov/about/rss-feeds",
    }],
    ["us-federal-reserve-press-releases", {
      feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
      feedEvidenceUrl: "https://www.federalreserve.gov/feeds/feeds.htm",
    }],
  ]);

  for (const [id, evidence] of expected) {
    const source = NEWS_SOURCE_CATALOG.find((candidate) => candidate.id === id);
    assert.ok(source, `missing ${id}`);
    assert.equal(source.sourceType, "rss");
    assert.equal(source.feedUrl, evidence.feedUrl);
    assert.equal(source.feedEvidenceUrl, evidence.feedEvidenceUrl);
    assert.equal(source.rightsPolicy, "official_public_record_with_attribution");
    assert.equal(source.requiresLogin, false);
  }
});

test("expanded feeds are official, attributable and have discovery evidence", () => {
  const expandedIds = ["google-blog", "aws-machine-learning-blog", "apple-machine-learning-research", "nvidia-blog", "qbitai"];
  for (const id of expandedIds) {
    const source = NEWS_SOURCE_CATALOG.find((candidate) => candidate.id === id);
    assert.ok(source, `missing ${id}`);
    assert.equal(source.sourceType, "rss");
    assert.equal(source.requiresLogin, false);
    assert.equal(source.rightsPolicy, "official_feed_metadata_with_attribution");
    assert.match(source.feedEvidenceUrl, /^https:\/\//);
  }
  assert.equal(NEWS_SOURCE_CATALOG.find((source) => source.id === "google-blog")?.category, "company_technology");
  assert.deepEqual(NEWS_SOURCE_CATALOG.find((source) => source.id === "google-blog")?.includePathPrefixes, ["/innovation-and-ai/"]);
  assert.equal(NEWS_SOURCE_CATALOG.find((source) => source.id === "nvidia-blog")?.category, "company_technology");
  const qbitai = NEWS_SOURCE_CATALOG.find((source) => source.id === "qbitai");
  assert.equal(qbitai?.category, "ai_media");
  assert.equal(qbitai?.language, "zh-CN");
  assert.deepEqual(qbitai?.editorialAliases, ["量子位", "QbitAI"]);
  assert.equal(qbitai?.feedUrl, "https://www.qbitai.com/feed");
});

test("catalog rejects malformed source path filters", () => {
  const invalid = NEWS_SOURCE_CATALOG.map((source) => source.id === "google-blog"
    ? { ...source, includePathPrefixes: ["https://blog.google/innovation-and-ai/"] }
    : source);
  const validation = validateNewsSourceCatalog(invalid);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.blockers, ["invalid_include_path_prefix:google-blog"]);

  const nonArray = invalid.map((source) => source.id === "google-blog"
    ? { ...source, includePathPrefixes: "/innovation-and-ai/" }
    : source);
  assert.deepEqual(validateNewsSourceCatalog(nonArray).blockers, ["invalid_include_path_prefixes:google-blog"]);
});

test("Chinese public newsrooms stay manual-only when no free official RSS is confirmed", () => {
  const expected = new Map([
    ["jiqizhixin-public-newsroom", "rss_requires_application_or_subscription"],
    ["leiphone-public-newsroom", "no_confirmed_official_rss_feed"],
  ]);
  for (const [id, blockedReason] of expected) {
    const source = NEWS_SOURCE_CATALOG.find((candidate) => candidate.id === id);
    assert.ok(source, `missing ${id}`);
    assert.equal(source.sourceType, "official_newsroom");
    assert.equal(source.feedUrl, null);
    assert.equal(source.requiresLogin, false);
    assert.equal(source.enabled, true);
    assert.equal(source.rightsPolicy, "public_page_manual_metadata_with_attribution");
    assert.equal(source.automaticCollectionBlockedReason, blockedReason);
  }
});
