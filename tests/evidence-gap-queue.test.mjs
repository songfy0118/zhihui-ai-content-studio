import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildEvidenceGapQueue, selectSourceDiverseLeads } from "../bridge/evidence-gap-queue.mjs";

function item(id, sourceId, title, publishedAt, category = "ai") {
  return { id, sourceId, sourceName: sourceId, title, canonicalUrl: `https://${sourceId}.example/${id}`, publishedAt, category };
}

test("returns recent account-fit single-source leads for independent-source research", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches a new enterprise agent", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "Community garden publishes meeting calendar", "2026-08-21T11:00:00Z", "company_technology"),
  ]);
  const queue = buildEvidenceGapQueue(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(queue.summary.recentSingleSourceLeads, 1);
  assert.equal(queue.leads[0].sourceId, "source-a");
  assert.equal(queue.leads[0].status, "needs_independent_source");
  assert.equal(queue.leads[0].missingIndependentSources, 1);
  assert.match(queue.leads[0].suggestedQueries[0], /OpenAI launches/);
});

test("excludes old, undated and already cross-source clusters", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "OpenAI unveils enterprise agent platform", "2026-08-21T12:00:00Z"),
    item("c", "source-c", "New AI model for enterprise work", "2026-08-01T12:00:00Z"),
    item("d", "source-d", "AI hiring changes software careers", null),
  ]);
  const queue = buildEvidenceGapQueue(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(queue.leads.length, 0);
});

test("keeps shortlist ephemeral and blocks fact, source-lock and draft claims", () => {
  const clustering = buildTopicClusters([item("a", "source-a", "OpenAI launches a new enterprise agent", "2026-08-21T10:00:00Z")]);
  const queue = buildEvidenceGapQueue(clustering, { now: "2026-08-21T13:00:00Z" });
  assert.equal(queue.humanShortlistPersisted, false);
  assert.equal(queue.evidenceSearchTriggered, false);
  assert.equal(queue.factsVerified, false);
  assert.equal(queue.sourceLocksCreated, 0);
  assert.equal(queue.draftsUnlocked, 0);
  assert.equal(queue.databaseWrites, false);
  assert.equal(queue.publishTriggered, false);
  assert.equal(queue.leads[0].selectableForDraft, false);
});

test("limits each source so one publisher cannot occupy the whole shortlist", () => {
  const candidates = [
    { id: "a1", sourceId: "source-a" },
    { id: "a2", sourceId: "source-a" },
    { id: "a3", sourceId: "source-a" },
    { id: "a4", sourceId: "source-a" },
    { id: "b1", sourceId: "source-b" },
    { id: "b2", sourceId: "source-b" },
    { id: "c1", sourceId: "source-c" },
  ];
  const selected = selectSourceDiverseLeads(candidates, 5, 2);
  assert.deepEqual(selected.map((candidate) => candidate.id), ["a1", "a2", "b1", "b2", "c1"]);
  assert.equal(Math.max(...[...new Set(selected.map((candidate) => candidate.sourceId))].map((sourceId) => selected.filter((candidate) => candidate.sourceId === sourceId).length)), 2);
});

test("wires the evidence-gap queue as a read-only console action", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/evidence-gaps/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /生成补证清单（只读）/);
  assert.match(page, /fetch\("\/api\/news\/evidence-gaps"/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
