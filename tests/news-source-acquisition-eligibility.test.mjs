import assert from "node:assert/strict";
import test from "node:test";

import { buildNewsSourceAcquisitionEligibility } from "../bridge/news-source-acquisition-eligibility.mjs";
import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";

test("source acquisition audit partitions the complete catalog without collecting content", () => {
  const first = buildNewsSourceAcquisitionEligibility();
  const second = buildNewsSourceAcquisitionEligibility();

  assert.equal(first.status, "source_acquisition_eligibility_ready");
  assert.deepEqual(first.summary, {
    totalSources: 17,
    automaticRssMetadata: 10,
    manualPublicPageMetadata: 5,
    userSuppliedPublicLinkOnly: 2,
    unclassified: 0,
  });
  assert.match(first.auditFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(first.auditFingerprint, second.auditFingerprint);
  assert.equal(first.articleBodiesFetched, false);
  assert.equal(first.loginTriggered, false);
  assert.equal(first.captchaBypassed, false);
  assert.equal(first.paywallBypassed, false);
  assert.equal(first.externalCalls, 0);
  assert.equal(first.databaseWrites, false);
  assert.equal(first.publishTriggered, false);
});

test("known Chinese sources remain in their exact acquisition lanes", () => {
  const audit = buildNewsSourceAcquisitionEligibility();
  assert.equal(audit.automaticRssMetadata.some((source) => source.id === "qbitai"), true);
  assert.equal(audit.manualPublicPageMetadata.some((source) => source.id === "jiqizhixin-public-newsroom"), true);
  assert.equal(audit.manualPublicPageMetadata.some((source) => source.id === "leiphone-public-newsroom"), true);
  assert.equal(audit.userSuppliedPublicLinkOnly.some((source) => source.id === "silicon-star-pro-wechat-manual"), true);
  assert.equal(audit.userSuppliedPublicLinkOnly.every((source) => source.collectionMode === "user_supplied_public_link_only"), true);
});

test("source acquisition audit fails closed when a source crosses its registered boundary", () => {
  const tampered = NEWS_SOURCE_CATALOG.map((source) => source.id === "silicon-star-pro-wechat-manual"
    ? { ...source, enabled: true, requiresLogin: false }
    : source);
  const audit = buildNewsSourceAcquisitionEligibility({ sources: tampered });

  assert.equal(audit.status, "source_acquisition_eligibility_blocked");
  assert.equal(audit.auditFingerprint, null);
  assert.deepEqual(audit.unclassified, ["silicon-star-pro-wechat-manual"]);
  assert.equal(audit.blockers.includes("unclassified_collection_boundary:silicon-star-pro-wechat-manual"), true);
});

test("source acquisition audit rejects insecure RSS feeds", () => {
  const tampered = NEWS_SOURCE_CATALOG.map((source) => source.id === "qbitai"
    ? { ...source, feedUrl: "http://example.test/feed" }
    : source);
  const audit = buildNewsSourceAcquisitionEligibility({ sources: tampered });

  assert.equal(audit.status, "source_acquisition_eligibility_blocked");
  assert.equal(audit.blockers.includes("insecure_feed_url:qbitai"), true);
  assert.equal(audit.blockers.includes("unclassified_collection_boundary:qbitai"), true);
});

test("audit route remains a read-only catalog operation", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../app/api/news/source-acquisition-eligibility/route.ts", import.meta.url),
    "utf8",
  ));
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /getD1Database|INSERT|UPDATE|DELETE|publish/i);
  assert.match(source, /Cache-Control/);
});
