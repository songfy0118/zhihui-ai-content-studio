import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPublicArticleAcquisitionPlan, PUBLIC_ARTICLE_ACQUISITION_LIMITS } from "../bridge/public-article-acquisition-plan.mjs";

const briefPreview = {
  status: "text_draft_brief_preview_ready",
  readyForHumanResearch: true,
  briefFingerprint: "c".repeat(64),
  brief: {
    evidence: [
      { evidenceId: "openai-one", sourceId: "openai-news", sourceName: "OpenAI News", title: "OpenAI launches an agent platform", canonicalUrl: "https://openai.com/index/agent-platform/", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
      { evidenceId: "microsoft-one", sourceId: "microsoft-ai-source", sourceName: "Microsoft Source · AI", title: "A new enterprise agent platform launches", canonicalUrl: "https://news.microsoft.com/source/features/ai/agent-platform/", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
    ],
  },
};

test("builds a bounded public-article acquisition plan without executing it", () => {
  const plan = buildPublicArticleAcquisitionPlan(briefPreview);
  assert.equal(plan.status, "public_article_acquisition_plan_ready");
  assert.match(plan.planFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(plan.targets.length, 2);
  assert.ok(plan.targets.every((target) => target.eligible && target.request?.method === "GET"));
  assert.deepEqual(plan.limits, PUBLIC_ARTICLE_ACQUISITION_LIMITS);
  assert.ok(plan.stopConditions.includes("robots_disallowed"));
  assert.ok(plan.stopConditions.includes("paywall_detected"));
  assert.equal(plan.automaticExecutionAllowed, false);
  assert.equal(plan.networkRequestsPlanned, 2);
  assert.equal(plan.networkRequestsMade, 0);
});

test("blocks catalog policies that authorize metadata only", () => {
  const metadataOnly = structuredClone(briefPreview);
  metadataOnly.brief.evidence[0] = {
    ...metadataOnly.brief.evidence[0],
    sourceId: "google-blog",
    canonicalUrl: "https://blog.google/technology/ai/example/",
  };
  const plan = buildPublicArticleAcquisitionPlan(metadataOnly);
  assert.ok(plan.blockers.includes("google-blog:source_body_policy_review_required"));
  assert.equal(plan.readyForExecutionAuthorizationRequest, false);
  assert.equal(plan.networkRequestsPlanned, 0);

  const displayOnly = structuredClone(briefPreview);
  displayOnly.brief.evidence[0] = {
    ...displayOnly.brief.evidence[0],
    sourceId: "techcrunch",
    canonicalUrl: "https://techcrunch.com/2026/08/23/example/",
  };
  const displayOnlyPlan = buildPublicArticleAcquisitionPlan(displayOnly);
  assert.ok(displayOnlyPlan.blockers.includes("techcrunch:source_body_policy_review_required"));
  assert.equal(displayOnlyPlan.readyForExecutionAuthorizationRequest, false);
  assert.equal(displayOnlyPlan.networkRequestsPlanned, 0);
});

test("blocks unlisted hosts, disabled login sources and invalid target counts", () => {
  const mismatchedHost = structuredClone(briefPreview);
  mismatchedHost.brief.evidence[0].canonicalUrl = "https://unlisted.example/copied-story";
  assert.ok(buildPublicArticleAcquisitionPlan(mismatchedHost).blockers.includes("openai-news:source_url_host_mismatch"));

  const manual = structuredClone(briefPreview);
  manual.brief.evidence[0] = {
    ...manual.brief.evidence[0],
    sourceId: "wechat-manual-import",
    canonicalUrl: "https://mp.weixin.qq.com/s/example",
  };
  const manualPlan = buildPublicArticleAcquisitionPlan(manual);
  assert.ok(manualPlan.blockers.includes("wechat-manual-import:source_disabled"));
  assert.ok(manualPlan.blockers.includes("wechat-manual-import:source_requires_login"));

  const oneTarget = structuredClone(briefPreview);
  oneTarget.brief.evidence.pop();
  assert.ok(buildPublicArticleAcquisitionPlan(oneTarget).blockers.includes("article_target_count_invalid"));
});

test("keeps raw content, claims, drafts and platform actions closed", async () => {
  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch_must_not_run");
  };
  try {
    const plan = buildPublicArticleAcquisitionPlan(briefPreview);
    assert.equal(fetchCalls, 0);
    assert.equal(plan.sourceBodiesFetched, false);
    assert.equal(plan.rawContentPersisted, false);
    assert.equal(plan.factsVerified, false);
    assert.equal(plan.readyForCopyGeneration, false);
    assert.equal(plan.modelCalls, 0);
    assert.equal(plan.databaseWrites, false);
    assert.equal(plan.draftGenerated, false);
    assert.equal(plan.publishTriggered, false);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("public-article-acquisition-plan")));
});
