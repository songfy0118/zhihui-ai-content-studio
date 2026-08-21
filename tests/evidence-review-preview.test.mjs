import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";

const lead = {
  id: "cluster:one",
  title: "OpenAI launches enterprise agent platform",
  sourceId: "source-a",
  publishedAt: "2026-08-20T12:00:00.000Z",
  missingIndependentSources: 1,
  suggestedQueries: ["OpenAI enterprise agent platform"],
  evidence: [{ id: "a-one", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
};
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://a.example/", feedUrl: "https://a.example/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Independent", sourceType: "rss", baseUrl: "https://b.example/", feedUrl: "https://b.example/feed", enabled: true, requiresLogin: false },
];
const candidateItems = [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }];
const completeChecks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));

function fixtures(items = candidateItems) {
  const plan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  return { plan, metadata: buildEvidenceMetadataPreview(plan, items) };
}

test("requires a current candidate and every explicit human evidence check", () => {
  const { plan, metadata } = fixtures();
  const preview = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks: completeChecks }]);
  assert.equal(preview.status, "evidence_review_preview_ready");
  assert.match(preview.reviewFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.summary.targetsEligible, 1);
  assert.equal(preview.readyForAuthorizedSourceLockSave, true);
});

test("blocks incomplete checks, stale candidates and same-host evidence", () => {
  const { plan, metadata } = fixtures();
  const incomplete = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks: { ...completeChecks, dates_consistent: false } }]);
  assert.ok(incomplete.blockers.some((blocker) => blocker.includes("human_check_missing:dates_consistent")));
  const stale = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: "missing", checks: completeChecks }]);
  assert.ok(stale.blockers.some((blocker) => blocker.includes("candidate_not_current")));
  const sameHostMetadata = buildEvidenceMetadataPreview(plan, [{ ...candidateItems[0], canonicalUrl: "https://a.example/other" }]);
  const sameHost = buildEvidenceReviewPreview(plan, sameHostMetadata, [{ leadId: lead.id, candidateId: "b-match", checks: completeChecks }]);
  assert.ok(sameHost.blockers.some((blocker) => blocker.includes("independent_host_not_confirmed")));
});

test("keeps a successful preview ephemeral and does not create a source lock", () => {
  const { plan, metadata } = fixtures();
  const preview = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks: completeChecks }]);
  assert.equal(preview.persisted, false);
  assert.equal(preview.sourceLockCreated, false);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.draftsUnlocked, 0);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.publishTriggered, false);
});

test("wires a guarded review preview without persistence", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/evidence-review-preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /预览证据审查（不保存）/);
  assert.match(page, /fetch\("\/api\/news\/evidence-review-preview"/);
  assert.match(route, /externalCalls: 0/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
