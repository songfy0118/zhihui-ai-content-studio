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
  qualityEvidenceFingerprint: "a".repeat(64),
  evidence: [{ id: "a-original", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://www.a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
}];
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://a.example/", feedUrl: "https://a.example/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Independent", sourceType: "rss", baseUrl: "https://b.example/", feedUrl: "https://b.example/feed", enabled: true, requiresLogin: false },
  { id: "source-c", name: "Newsroom only", sourceType: "official_newsroom", baseUrl: "https://c.example/", feedUrl: null, enabled: true, requiresLogin: false },
];
const items = [
  { id: "a-original", sourceId: "source-a", sourceName: "Original", title: leads[0].title, canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" },
  { id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z", summary: "Body-like feed summary must not be returned", metadataProvenanceReady: true, sourceEvidenceUrl: "https://b.example/feed-evidence", rightsPolicy: "official_feed_metadata_with_attribution", collectionScope: "rss_metadata_only", articleBodyFetched: false, freshnessStatus: "within_24_hours", ageHours: 2 },
  { id: "b-unrelated", sourceId: "source-b", sourceName: "Independent", title: "Cloud database pricing changes", canonicalUrl: "https://b.example/other", publishedAt: "2026-08-20T15:00:00.000Z" },
  { id: "b-old", sourceId: "source-b", sourceName: "Independent", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://b.example/old", publishedAt: "2026-07-20T14:00:00.000Z" },
];

test("returns only bounded independent RSS metadata candidates for human review", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const preview = buildEvidenceMetadataPreview(plan, items, { requireQualityLineage: true });
  assert.equal(preview.status, "metadata_candidates_found");
  assert.equal(preview.summary.candidatesReturned, 1);
  assert.equal(preview.targets[0].candidates[0].id, "b-match");
  assert.equal(preview.targets[0].originalEvidence.canonicalUrl, "https://www.a.example/story");
  assert.equal(preview.targets[0].originalHost, "a.example");
  assert.equal(preview.targets[0].candidates[0].candidateHost, "b.example");
  assert.equal(preview.targets[0].candidates[0].publishedDeltaHours, 2);
  assert.equal(preview.targets[0].candidates[0].reviewStatus, "human_review_required");
  assert.equal(preview.summary.candidatesWithQualityEvidence, 1);
  assert.equal(preview.qualityBoundary.allReturnedCandidatesQualityBound, true);
  assert.match(preview.qualityBoundary.previewQualityFingerprint, /^[a-f0-9]{64}$/);
  assert.match(preview.targets[0].candidates[0].candidateQualityEvidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.targets[0].candidates[0].qualityBoundary.collectionScope, "rss_metadata_only");
  assert.equal(preview.candidateAudit.targetItemEvaluations, 4);
  assert.equal(preview.candidateAudit.excludedBySourceScope, 1);
  assert.equal(preview.candidateAudit.excludedByQualityGate, 2);
  assert.equal(preview.candidateAudit.matchedBeforeLimit, 1);
  assert.equal(preview.candidateAudit.candidatesReturned, 1);
  assert.equal("summary" in preview.targets[0].candidates[0], false);
});

test("accounts for every target-item evaluation with one explicit exclusion stage", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const qualityReady = { metadataProvenanceReady: true, sourceEvidenceUrl: "https://b.example/feed-evidence", rightsPolicy: "official_feed_metadata_with_attribution", collectionScope: "rss_metadata_only", articleBodyFetched: false, freshnessStatus: "within_72_hours", ageHours: 48 };
  const diagnosticItems = [
    { ...items[0], ...qualityReady },
    { ...items[1], metadataProvenanceReady: false },
    { ...items[1], ...qualityReady, id: "b-time", publishedAt: "2026-08-18T12:00:00.000Z" },
    { ...items[1], ...qualityReady, id: "b-title", title: "Cloud database pricing changes", publishedAt: "2026-08-20T13:00:00.000Z" },
  ];
  const preview = buildEvidenceMetadataPreview(plan, diagnosticItems, { requireQualityLineage: true, windowHours: 24 });

  assert.equal(preview.status, "no_metadata_candidates");
  assert.deepEqual(preview.candidateAudit, {
    targetItemEvaluations: 4,
    excludedBySourceScope: 1,
    excludedByQualityGate: 1,
    qualityExclusionReasons: { provenance_not_ready: 1 },
    excludedByTimeWindow: 1,
    excludedByTitleMatch: 1,
    matchedBeforeLimit: 0,
    omittedByPerTargetLimit: 0,
    candidatesReturned: 0,
  });
});

test("excludes a matching second-source item without current RSS metadata quality evidence", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const preview = buildEvidenceMetadataPreview(plan, [{ ...items[1], metadataProvenanceReady: false }], { requireQualityLineage: true });
  assert.equal(preview.status, "no_metadata_candidates");
  assert.equal(preview.summary.candidatesReturned, 0);
  assert.equal(preview.summary.candidatesWithQualityEvidence, 0);
  assert.equal(preview.qualityBoundary.previewQualityFingerprint, null);
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

test("blocks metadata preview when the selected lead has no source quality lineage", () => {
  const plan = buildEvidenceSearchPlan([{ ...leads[0], qualityEvidenceFingerprint: null }], ["cluster:one"], sources);
  const blocked = buildEvidenceMetadataPreview(plan, items, { requireQualityLineage: true });
  assert.deepEqual(blocked.blockers, ["source_quality_lineage_not_bound:cluster:one"]);
  assert.equal(blocked.summary.itemsConsidered, 0);
  assert.equal(blocked.qualityBoundary.sourceTargetsQualityBound, false);
});

test("reports an honest empty result when metadata does not cross the threshold", () => {
  const plan = buildEvidenceSearchPlan(leads, ["cluster:one"], sources);
  const preview = buildEvidenceMetadataPreview(plan, [items[2]], { requireQualityLineage: true });
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
  assert.match(page, /候选质量证据已绑定/);
  assert.match(page, /候选排除诊断/);
  assert.match(page, /fetch\("\/api\/news\/evidence-metadata-preview"/);
  assert.match(page, /const preview = await response\.json\(\) as EvidenceMetadataPreview;\s*if \(requestRevision !== evidencePipelineRevision\.current\) return;\s*setEvidenceMetadataPreview\(preview\);/);
  assert.match(route, /body\.selectedIds\.length > 3/);
  assert.match(route, /requireQualityLineage: true/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
