import assert from "node:assert/strict";
import test from "node:test";

import { buildTopicClusters } from "../bridge/topic-clustering.mjs";
import { buildTopicWorkflowPreview } from "../bridge/topic-workflow-preview.mjs";

function item(id, sourceId, title, publishedAt) {
  return { id, sourceId, sourceName: sourceId, title, canonicalUrl: `https://${sourceId}.example/${id}`, publishedAt, category: "ai" };
}

test("routes a no-candidate result into an ephemeral evidence-gap shortlist", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches a new enterprise agent", "2026-08-21T10:00:00Z"),
  ]);
  const preview = buildTopicWorkflowPreview(clustering, { now: "2026-08-21T13:00:00Z" });

  assert.equal(preview.status, "no_eligible_candidates");
  assert.equal(preview.nextGate, "human_evidence_gap_shortlist");
  assert.equal(preview.evidenceGapFallback.leads.length, 1);
  assert.equal(preview.evidenceGapFallback.evidenceSearchTriggered, false);
  assert.equal(preview.evidenceGapFallback.humanShortlistPersisted, false);
  assert.equal(preview.evidenceGapFallback.databaseWrites, false);
  assert.equal(preview.evidenceGapFallback.publishTriggered, false);
});

test("keeps an eligible multi-source candidate on human source and fact review", () => {
  const clustering = buildTopicClusters([
    item("a", "source-a", "OpenAI launches enterprise agent platform", "2026-08-21T10:00:00Z"),
    item("b", "source-b", "OpenAI unveils enterprise agent platform", "2026-08-21T12:00:00Z"),
  ]);
  const preview = buildTopicWorkflowPreview(clustering, { now: "2026-08-21T13:00:00Z" });

  assert.equal(preview.status, "ranked_candidates_ready");
  assert.equal(preview.nextGate, "human_source_and_fact_review");
  assert.equal(preview.evidenceGapFallback, null);
});
