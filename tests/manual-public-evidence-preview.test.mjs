import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildManualPublicEvidencePreview } from "../bridge/manual-public-evidence-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";

const lead = {
  id: "cluster:one",
  title: "OpenAI launches enterprise agent platform",
  sourceId: "source-a",
  publishedAt: "2026-08-20T12:00:00.000Z",
  missingIndependentSources: 1,
  suggestedQueries: ["OpenAI enterprise agent platform"],
  evidence: [{ id: "a-one", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://origin.news/story", publishedAt: "2026-08-20T12:00:00.000Z" }],
};
const sources = [
  { id: "source-a", name: "Original", sourceType: "rss", baseUrl: "https://origin.news/", feedUrl: "https://origin.news/feed", enabled: true, requiresLogin: false },
  { id: "source-b", name: "Catalog source", sourceType: "rss", baseUrl: "https://catalog.news/", feedUrl: "https://catalog.news/feed", enabled: true, requiresLogin: false },
];
const plan = buildEvidenceSearchPlan([lead], [lead.id], sources);

function input(overrides = {}) {
  return {
    leadId: lead.id,
    sourceName: "Independent News",
    title: "Enterprise agent platform launched by OpenAI",
    canonicalUrl: "https://independent.news/report",
    publishedAt: "2026-08-20T14:00:00.000Z",
    ...overrides,
  };
}

test("previews one public manual candidate without fetching or persisting it", () => {
  const preview = buildManualPublicEvidencePreview(plan, [input()]);
  assert.equal(preview.status, "manual_evidence_preview_ready");
  assert.equal(preview.summary.candidatesAccepted, 1);
  assert.equal(preview.targets[0].originalHost, "origin.news");
  assert.equal(preview.targets[0].candidates[0].candidateHost, "independent.news");
  assert.equal(preview.targets[0].candidates[0].publishedDeltaHours, 2);
  assert.equal(preview.targets[0].candidates[0].inputMode, "user_supplied_public_metadata");
  assert.equal(preview.candidateUrlFetched, false);
  assert.equal(preview.articleBodiesFetched, false);
  assert.equal(preview.manualInputPersisted, false);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.sourceLocksCreated, 0);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.publishTriggered, false);
});

test("blocks unsafe, same-host, stale and unrelated manual candidates", () => {
  const cases = [
    [input({ canonicalUrl: "http://independent.news/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://user:secret@independent.news/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://127.0.0.1/report" }), "public_https_url_required"],
    [input({ canonicalUrl: "https://origin.news/other" }), "same_exact_host"],
    [input({ publishedAt: "2026-09-20T14:00:00.000Z" }), "outside_time_window"],
    [input({ title: "Local sports schedule update" }), "title_match_below_threshold"],
  ];
  for (const [candidate, blocker] of cases) {
    const preview = buildManualPublicEvidencePreview(plan, [candidate]);
    assert.equal(preview.status, "manual_evidence_preview_blocked");
    assert.ok(preview.blockers.some((value) => value.endsWith(blocker)), blocker);
  }
});

test("blocks missing plans, empty input and duplicate lead candidates", () => {
  assert.ok(buildManualPublicEvidencePreview(null, [input()]).blockers.includes("search_plan_not_ready"));
  assert.ok(buildManualPublicEvidencePreview(plan, []).blockers.includes("manual_evidence_input_empty"));
  const duplicate = buildManualPublicEvidencePreview(plan, [input(), input({ canonicalUrl: "https://second.news/report" })]);
  assert.ok(duplicate.blockers.some((value) => value.endsWith("duplicate_lead")));
});

test("builds a no-write source-lock save plan after manual evidence review", () => {
  const metadata = buildManualPublicEvidencePreview(plan, [input()]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const preview = buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: metadata.targets[0].candidates[0].id, checks }]);
  assert.equal(preview.humanEvidenceReviewComplete, true);
  assert.equal(preview.readyForAuthorizedSourceLockSave, true);
  assert.deepEqual(preview.downstreamBlockers, []);
  assert.match(preview.reviewFingerprint, /^[a-f0-9]{64}$/);
  const savePlan = buildSourceLockSavePlan(preview, { confirmedReviewFingerprint: preview.reviewFingerprint });
  assert.equal(savePlan.status, "source_lock_save_plan_ready");
  assert.equal(savePlan.plannedRecordCount, 1);
  assert.equal(savePlan.authorizationGranted, false);
  assert.equal(savePlan.writeAllowed, false);
  assert.equal(savePlan.persisted, false);
  assert.equal(savePlan.sourceLocksCreated, 0);
  assert.equal(savePlan.databaseWrites, false);
});
