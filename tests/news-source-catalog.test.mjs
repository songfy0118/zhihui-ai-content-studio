import assert from "node:assert/strict";
import test from "node:test";

import { NEWS_SOURCE_CATALOG, summarizeNewsSourceCatalog, validateNewsSourceCatalog } from "../bridge/news-source-catalog.mjs";

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

test("catalog summary separates automatic and manual sources", () => {
  const summary = summarizeNewsSourceCatalog();
  assert.equal(summary.totalSources, 13);
  assert.equal(summary.enabledSources, 12);
  assert.equal(summary.rssSources, 9);
  assert.equal(summary.officialNewsrooms, 3);
  assert.equal(summary.manualReviewSources, 1);
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
  assert.equal(NEWS_SOURCE_CATALOG.find((source) => source.id === "nvidia-blog")?.category, "company_technology");
  const qbitai = NEWS_SOURCE_CATALOG.find((source) => source.id === "qbitai");
  assert.equal(qbitai?.category, "ai_media");
  assert.equal(qbitai?.language, "zh-CN");
  assert.deepEqual(qbitai?.editorialAliases, ["量子位", "QbitAI"]);
  assert.equal(qbitai?.feedUrl, "https://www.qbitai.com/feed");
});
