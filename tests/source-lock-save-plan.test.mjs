import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";

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

function readyReview() {
  const plan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  const metadata = buildEvidenceMetadataPreview(plan, [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  return buildEvidenceReviewPreview(plan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks }]);
}

test("binds a save plan to the exact current review fingerprint", () => {
  const review = readyReview();
  const plan = buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
  assert.equal(plan.status, "source_lock_save_plan_ready");
  assert.match(plan.savePlanFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(plan.plannedRecordCount, 1);
  assert.equal(plan.plannedLocks[0].sources.length, 2);
  assert.equal(plan.plannedLocks[0].claimCount, 0);
});

test("blocks missing and mismatched fingerprint confirmations", () => {
  const review = readyReview();
  assert.ok(buildSourceLockSavePlan(review).blockers.includes("review_fingerprint_confirmation_required"));
  assert.ok(buildSourceLockSavePlan(review, { confirmedReviewFingerprint: "0".repeat(64) }).blockers.includes("review_fingerprint_mismatch"));
});

test("never grants authorization or persists the planned records", () => {
  const review = readyReview();
  const plan = buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
  assert.equal(plan.authorizationRequired, true);
  assert.equal(plan.authorizationGranted, false);
  assert.equal(plan.writeAllowed, false);
  assert.equal(plan.persisted, false);
  assert.equal(plan.sourceLocksCreated, 0);
  assert.equal(plan.factsVerified, false);
  assert.equal(plan.draftsUnlocked, 0);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.publishTriggered, false);
});

test("wires a save-plan-only endpoint without a database adapter", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /生成来源锁保存计划（不保存）/);
  assert.match(page, /fetch\("\/api\/news\/source-lock-save-plan"/);
  assert.match(page, /setSourceLockSavePlanBusy\(true\);\s*setSourceLockSavePlan\(null\);\s*setSourceLockSaveAuthorizationPreview\(null\);\s*evidencePipelineRevision\.current \+= 1;/);
  assert.match(page, /const plan = await response\.json\(\) as SourceLockSavePlan;\s*if \(requestRevision !== evidencePipelineRevision\.current\) return;\s*setSourceLockSavePlan\(plan\);/);
  assert.match(route, /buildManualPublicEvidencePreview/);
  assert.match(route, /manualInputs/);
  assert.match(route, /authorizationGranted: false/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
