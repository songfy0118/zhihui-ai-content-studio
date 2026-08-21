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
  assert.equal(summary.totalSources, 7);
  assert.equal(summary.enabledSources, 6);
  assert.equal(summary.rssSources, 4);
  assert.equal(summary.officialNewsrooms, 2);
  assert.equal(summary.manualReviewSources, 1);
});
