import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";

const leads = [{
  id: "cluster:one",
  title: "OpenAI launches a new enterprise agent",
  sourceId: "source-a",
  missingIndependentSources: 1,
  suggestedQueries: ["\"OpenAI launches a new enterprise agent\"", "OpenAI enterprise agent independent confirmation"],
}];
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://a.example/", feedUrl: "https://a.example/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Independent", sourceType: "official_newsroom", baseUrl: "https://b.example/", feedUrl: null, enabled: true, requiresLogin: false },
  { id: "source-c", name: "Login source", sourceType: "rss", baseUrl: "https://c.example/", feedUrl: "https://c.example/feed", enabled: true, requiresLogin: true },
];

test("builds a fingerprinted plan using only independent public sources", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  assert.equal(plan.status, "search_plan_ready");
  assert.equal(plan.selection.accepted, 1);
  assert.match(plan.planFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.targets[0].allowedSources.map((source) => source.id), ["source-b"]);
  assert.equal(plan.targets[0].resultsFound, 0);
});

test("blocks empty, excessive and stale selections", () => {
  assert.deepEqual(buildEvidenceSearchPlan(leads, [], sources).blockers, ["selection_empty"]);
  assert.ok(buildEvidenceSearchPlan(leads, ["1", "2", "3", "4"], sources).blockers.includes("selection_limit_exceeded"));
  assert.ok(buildEvidenceSearchPlan(leads, ["cluster:stale"], sources).blockers.includes("selected_lead_not_current:cluster:stale"));
});

test("never executes search or advances facts, source locks, drafts or publication", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  assert.equal(plan.automaticSearchAllowed, false);
  assert.equal(plan.searchTriggered, false);
  assert.equal(plan.factsVerified, false);
  assert.equal(plan.sourceLocksCreated, 0);
  assert.equal(plan.draftsUnlocked, 0);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.publishTriggered, false);
});

test("wires a guarded non-executing plan endpoint and console action", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/evidence-search-plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /生成第二来源检索计划（不执行）/);
  assert.match(page, /fetch\("\/api\/news\/evidence-search-plan"/);
  assert.match(route, /body\.selectedIds\.length > 3/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
