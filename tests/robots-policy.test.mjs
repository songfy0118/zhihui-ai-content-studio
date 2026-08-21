import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRobotsPolicyChecker, evaluateRobotsTxt } from "../bridge/robots-policy.mjs";

test("uses the longest matching path and lets Allow win a tie", () => {
  const robots = `
User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /same
Allow: /same
`;
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/private/report" }).allowed, false);
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/private/public/report" }).allowed, true);
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/same" }).allowed, true);
});

test("prefers the matching product group over the wildcard group", () => {
  const robots = `
User-agent: *
Disallow: /

User-agent: ZhihuiResearchBot
Disallow: /internal
Allow: /
`;
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/public" }).allowed, true);
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/internal/report" }).allowed, false);
});

test("supports wildcard and end-anchor path rules", () => {
  const robots = "User-agent: *\nDisallow: /*?preview=*\nDisallow: /download$\n";
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/story?preview=yes" }).allowed, false);
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/download" }).allowed, false);
  assert.equal(evaluateRobotsTxt(robots, { url: "https://example.com/download/file" }).allowed, true);
});

test("checks a simulated robots file without persisting its contents", async () => {
  const calls = [];
  const checker = createRobotsPolicyChecker({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response("User-agent: *\nDisallow: /private\nAllow: /public\n", { headers: { "content-type": "text/plain" } });
    },
  });
  const allowed = await checker({ url: "https://openai.com/public/story", configuredHost: "openai.com" });
  const denied = await checker({ url: "https://openai.com/private/story", configuredHost: "openai.com" });
  assert.equal(allowed.allowed, true);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "disallowed_by_rule");
  assert.equal(denied.robotsTextPersisted, false);
  assert.ok(calls.every((call) => call.url === "https://openai.com/robots.txt" && call.options.redirect === "manual" && call.options.credentials === "omit"));
});

test("handles missing robots conservatively and blocks access errors", async () => {
  for (const [status, allowed, reason] of [[404, true, "robots_not_present"], [410, true, "robots_not_present"], [403, false, "robots_access_denied"], [429, false, "robots_rate_limited"]]) {
    const checker = createRobotsPolicyChecker({ fetcher: async () => new Response(null, { status }) });
    const checked = await checker({ url: "https://openai.com/index/story", configuredHost: "openai.com" });
    assert.equal(checked.allowed, allowed);
    assert.equal(checked.reason, reason);
  }
});

test("blocks cross-host robots redirects, oversized files and fetch failures", async () => {
  const redirectChecker = createRobotsPolicyChecker({ fetcher: async () => new Response(null, { status: 302, headers: { location: "https://unlisted.example/robots.txt" } }) });
  const redirected = await redirectChecker({ url: "https://openai.com/index/story", configuredHost: "openai.com" });
  assert.equal(redirected.reason, "robots_redirect_outside_configured_host");

  const largeChecker = createRobotsPolicyChecker({ maxBytes: 10, fetcher: async () => new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } }) });
  assert.equal((await largeChecker({ url: "https://openai.com/index/story", configuredHost: "openai.com" })).reason, "robots_too_large");

  const failedChecker = createRobotsPolicyChecker({ fetcher: async () => { throw new Error("offline"); } });
  const failed = await failedChecker({ url: "https://openai.com/index/story", configuredHost: "openai.com" });
  assert.equal(failed.checked, false);
  assert.equal(failed.allowed, false);
  assert.equal(failed.reason, "robots_fetch_failed");
});

test("keeps the checker disconnected from routes and real network", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("robots-policy")));
});
