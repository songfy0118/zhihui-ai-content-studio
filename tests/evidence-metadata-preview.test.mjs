import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";

const leads = [{
  id: "cluster:one",
  title: "OpenAI launches enterprise agent platform",
  sourceId: "source-a",
  publishedAt: "2026-08-20T12:00:00.000Z",
  missingIndependentSources: 1,
  suggestedQueries: ["OpenAI enterprise agent platform"],
  evidence: [{ id: "a-original", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://www.a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
}];
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://a.example/", feedUrl: "https://a.example/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Independent", sourceType: "rss", baseUrl: "https://b.example/", feedUrl: "https://b.example/feed", enabled: true, requiresLogin: false },
  { id: "source-c", name: "Newsroom only", sourceType: "official_newsroom", baseUrl: "https://c.example/", feedUrl: null, enabled: true, requiresLogin: false },
];
const items = [
  { id: "a-original", sourceId: "source-a", sourceName: "Original", title: leads[0].title, canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" },
  { id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z", summary: "Body-like feed summary must not be returned" },
  { id: "b-unrelated", sourceId: "source-b", sourceName: "Independent", title: "Cloud database pricing changes", canonicalUrl: "https://b.example/other", publishedAt: "2026-08-20T15:00:00.000Z" },
  { id: "b-old", sourceId: "source-b", sourceName: "Independent", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://b.example/old", publishedAt: "2026-07-20T14:00:00.000Z" },
];

test("returns only bounded independent RSS metadata candidates for human review", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const preview = buildEvidenceMetadataPreview(plan, items);
  assert.equal(preview.status, "metadata_candidates_found");
  assert.equal(preview.summary.candidatesReturned, 1);
  assert.equal(preview.targets[0].candidates[0].id, "b-match");
  assert.equal(preview.targets[0].originalEvidence.canonicalUrl, "https://www.a.example/story");
  assert.equal(preview.targets[0].originalHost, "a.example");
  assert.equal(preview.targets[0].candidates[0].candidateHost, "b.example");
  assert.equal(preview.targets[0].candidates[0].publishedDeltaHours, 2);
  assert.equal(preview.targets[0].candidates[0].reviewStatus, "human_review_required");
  assert.equal("summary" in preview.targets[0].candidates[0], false);
});

test("blocks a missing plan and never advances factual or publishing state", () => {
  const blocked = buildEvidenceMetadataPreview(buildEvidenceSearchPlan([], [], sources), items);
  assert.deepEqual(blocked.blockers, ["search_plan_not_ready"]);
  assert.equal(blocked.summary.itemsConsidered, 0);
  assert.equal(blocked.articleBodiesFetched, false);
  assert.equal(blocked.factsVerified, false);
  assert.equal(blocked.sourceLocksCreated, 0);
  assert.equal(blocked.draftsUnlocked, 0);
  assert.equal(blocked.databaseWrites, false);
  assert.equal(blocked.publishTriggered, false);
});

test("reports an honest empty result when metadata does not cross the threshold", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const preview = buildEvidenceMetadataPreview(plan, [items[2]]);
  assert.equal(preview.status, "no_metadata_candidates");
  assert.equal(preview.summary.candidatesReturned, 0);
  assert.equal(preview.humanReviewRequired, true);
});

test("wires an explicit metadata-only endpoint without storage or publication", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/evidence-metadata-preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /检索公开 RSS 元数据/);
  assert.match(page, /查看原来源/);
  assert.match(page, /较原来源/);
  assert.match(page, /fetch\("\/api\/news\/evidence-metadata-preview"/);
  assert.match(route, /body\.selectedIds\.length > 3/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
