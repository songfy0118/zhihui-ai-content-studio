import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { POST } from "../app/api/news/platform-text-unified-draft-package-plan/route.ts";

test("exposes a planning-only unified draft package endpoint", async () => {
  const response = await POST(new Request("http://localhost/api/news/platform-text-unified-draft-package-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.status, "platform_text_unified_draft_package_plan_blocked");
  assert.equal(body.requestAccepted, true);
  assert.equal(body.planningOnly, true);
  assert.equal(body.readyForDraftHandoff, false);
  assert.equal(body.browserOpenPerformed, false);
  assert.equal(body.loginTriggered, false);
  assert.equal(body.uploadTriggered, false);
  assert.equal(body.draftSaved, false);
  assert.equal(body.databaseWrites, false);
  assert.equal(body.filesystemMutations, false);
  assert.equal(body.externalCalls, false);
  assert.equal(body.publishTriggered, false);
});

test("rejects malformed or oversized requests before planning", async () => {
  const malformed = await POST(new Request("http://localhost/api/news/platform-text-unified-draft-package-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "[]",
  }));
  assert.equal(malformed.status, 400);
  assert.deepEqual((await malformed.json()).blockers, ["invalid_unified_draft_package_plan_request"]);

  const oversized = await POST(new Request("http://localhost/api/news/platform-text-unified-draft-package-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "1000001" },
    body: "{}",
  }));
  assert.equal(oversized.status, 413);
  const body = await oversized.json();
  assert.deepEqual(body.blockers, ["unified_draft_package_plan_request_too_large"]);
  assert.equal(body.requestAccepted, false);
});

test("keeps the route free of storage, browser and publishing adapters", async () => {
  const route = await readFile(new URL("../app/api/news/platform-text-unified-draft-package-plan/route.ts", import.meta.url), "utf8");
  assert.match(route, /buildPlatformTextUnifiedDraftPackagePlan/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(|fetch\(|playwright|puppeteer|creator\.douyin|xiaohongshu/);
});
