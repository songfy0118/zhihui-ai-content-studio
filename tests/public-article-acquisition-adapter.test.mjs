import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { executePublicArticleAcquisition, extractPublicArticleText, PUBLIC_ARTICLE_FETCH_CONFIRMATION } from "../bridge/public-article-acquisition-adapter.mjs";
import { buildPublicArticleAcquisitionPlan } from "../bridge/public-article-acquisition-plan.mjs";

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

function plan() {
  return buildPublicArticleAcquisitionPlan(briefPreview);
}

function input(value = plan(), overrides = {}) {
  return {
    plan: value,
    executeRequested: true,
    confirmation: PUBLIC_ARTICLE_FETCH_CONFIRMATION,
    authorizedPlanFingerprint: value.planFingerprint,
    ...overrides,
  };
}

function articleHtml(sourceName) {
  return `<!doctype html><html><head><title>${sourceName} report</title><style>.hidden{display:none}</style></head><body><nav>Navigation should disappear</nav><article><h1>Agent platform announcement</h1><p>${sourceName} published a detailed public announcement for testing.</p><p>This simulated paragraph contains enough text to exercise extraction without representing a real article or factual business result.</p><script>throw new Error('remove me')</script><p>Every statement here is synthetic fixture text and still requires human claim review.</p></article><footer>Footer should disappear</footer></body></html>`;
}

const robotsAllowed = async () => ({ checked: true, allowed: true });

test("extracts two simulated public articles sequentially without persisting raw content", async () => {
  const calls = [];
  const waits = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(articleHtml(new URL(url).hostname), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
  const result = await executePublicArticleAcquisition(input(), { fetcher, robotsPolicyChecker: robotsAllowed, waiter: async (milliseconds) => waits.push(milliseconds) });

  assert.equal(result.status, "public_article_acquisition_complete");
  assert.equal(result.documents.length, 2);
  assert.equal(result.networkRequestsMade, 2);
  assert.equal(result.robotsChecksMade, 2);
  assert.deepEqual(waits, [2_000]);
  assert.ok(calls.every((call) => call.options.redirect === "manual" && call.options.credentials === "omit"));
  assert.ok(result.documents.every((document) => document.ephemeral && !document.text.includes("Navigation") && !document.text.includes("remove me")));
  assert.ok(result.documents.every((document) => !Object.hasOwn(document, "rawHtml")));
  assert.equal(result.rawContentPersisted, false);
  assert.equal(result.articleTextPersisted, false);
  assert.equal(result.factsVerified, false);
});

test("blocks missing confirmation and a tampered plan before any injected call", async () => {
  let fetchCalls = 0;
  let robotsCalls = 0;
  const fetcher = async () => {
    fetchCalls += 1;
    return new Response(articleHtml("unused"), { headers: { "content-type": "text/html" } });
  };
  const checker = async () => {
    robotsCalls += 1;
    return { checked: true, allowed: true };
  };
  const missingConfirmation = await executePublicArticleAcquisition(input(plan(), { confirmation: null }), { fetcher, robotsPolicyChecker: checker });
  const tamperedPlan = plan();
  tamperedPlan.targets[0].canonicalUrl = "https://openai.com/index/changed/";
  const tampered = await executePublicArticleAcquisition(input(tamperedPlan), { fetcher, robotsPolicyChecker: checker });
  assert.ok(missingConfirmation.blockers.includes("article_fetch_confirmation_invalid"));
  assert.ok(tampered.blockers.includes("article_acquisition_plan_tampered"));
  assert.equal(fetchCalls, 0);
  assert.equal(robotsCalls, 0);
});

test("stops before fetch when robots policy denies an article", async () => {
  let fetchCalls = 0;
  const result = await executePublicArticleAcquisition(input(), {
    fetcher: async () => {
      fetchCalls += 1;
      throw new Error("must_not_fetch");
    },
    robotsPolicyChecker: async () => ({ checked: true, allowed: false }),
    waiter: async () => {},
  });
  assert.ok(result.blockers.includes("openai-news:robots_disallowed"));
  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.documents, []);
});

test("rejects cross-host redirects and discards partial document results", async () => {
  let calls = 0;
  const result = await executePublicArticleAcquisition(input(), {
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return new Response(articleHtml("OpenAI"), { headers: { "content-type": "text/html" } });
      return new Response(null, { status: 302, headers: { location: "https://unlisted.example/copied" } });
    },
    robotsPolicyChecker: robotsAllowed,
    waiter: async () => {},
  });
  assert.ok(result.blockers.includes("microsoft-ai-source:redirect_outside_configured_source_host"));
  assert.deepEqual(result.documents, []);
  assert.equal(result.networkRequestsMade, 2);
});

test("diagnoses simulated paywall, captcha, login and rate-limit barriers", async () => {
  const scenarios = [
    [402, "<html><body>Payment required</body></html>", "paywall_detected"],
    [200, "<html><body><div class='g-recaptcha'>Verify you are human</div></body></html>", "captcha_detected"],
    [200, "<html><body><form><input type='password'>Sign in to continue</form></body></html>", "login_required"],
    [429, "<html><body>Slow down</body></html>", "rate_limited"],
  ];
  for (const [status, html, blocker] of scenarios) {
    const result = await executePublicArticleAcquisition(input(), {
      fetcher: async () => new Response(html, { status, headers: { "content-type": "text/html" } }),
      robotsPolicyChecker: robotsAllowed,
      waiter: async () => {},
    });
    assert.ok(result.blockers.includes(`openai-news:${blocker}`));
    assert.deepEqual(result.documents, []);
  }
});

test("diagnoses an invalid injected transport response without leaking an exception", async () => {
  const result = await executePublicArticleAcquisition(input(), {
    fetcher: async () => ({}),
    robotsPolicyChecker: robotsAllowed,
    waiter: async () => {},
  });
  assert.ok(result.blockers.includes("openai-news:fetch_response_invalid"));
  assert.deepEqual(result.documents, []);
});

test("keeps the adapter disconnected from API routes and real network", async () => {
  const extracted = extractPublicArticleText(articleHtml("Fixture"));
  assert.ok(extracted.text.length >= 120);
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("public-article-acquisition-adapter")));
});
