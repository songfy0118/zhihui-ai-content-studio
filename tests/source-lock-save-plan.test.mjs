import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { POST } from "../app/api/news/source-lock-save-plan/route.ts";
import { formatSourceLockEvidenceRole, formatSourceLockPlanBlocker, formatSourceLockPublisherRole } from "../app/source-lock-plan-diagnostics.ts";

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

test("formats source lock plan blockers as actionable Chinese diagnostics", () => {
  assert.equal(formatSourceLockPlanBlocker("invalid_save_plan_request"), "保存计划请求已失效，请重新完成证据审查");
  assert.equal(formatSourceLockPlanBlocker("review_fingerprint_mismatch"), "审查指纹已变化，请重新生成计划");
  assert.equal(formatSourceLockPlanBlocker("review_target_not_eligible:cluster:one"), "线索 cluster:one：审查证据不完整，不能进入保存计划");
  assert.equal(formatSourceLockPlanBlocker("future_blocker"), "future_blocker");
});

test("labels every source role before authorization", () => {
  assert.equal(formatSourceLockEvidenceRole("original"), "原始来源");
  assert.equal(formatSourceLockEvidenceRole("independent"), "独立补证");
  assert.equal(formatSourceLockPublisherRole("catalog_metadata"), "已登记 RSS 元数据");
  assert.equal(formatSourceLockPublisherRole("original_publisher"), "声明为原始发布者");
  assert.equal(formatSourceLockPublisherRole("syndicated_or_repost"), "声明为转载页 / 聚合页");
});

test("binds a save plan to the exact current review fingerprint", () => {
  const review = readyReview();
  const plan = buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
  assert.equal(plan.status, "source_lock_save_plan_ready");
  assert.match(plan.savePlanFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(plan.plannedRecordCount, 1);
  assert.equal(plan.plannedLocks[0].sources.length, 2);
  assert.deepEqual(plan.plannedLocks[0].sources.map((source) => source.publisherRole), ["catalog_metadata", "catalog_metadata"]);
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

test("returns a complete blocked save-plan contract for malformed requests", async () => {
  const response = await POST(new Request("http://localhost/api/news/source-lock-save-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, "source_lock_save_plan_blocked");
  assert.deepEqual(body.blockers, ["invalid_save_plan_request"]);
  assert.equal(body.readyForAuthorizationRequest, false);
  assert.equal(body.reviewFingerprint, null);
  assert.equal(body.savePlanFingerprint, null);
  assert.equal(body.plannedRecordCount, 0);
  assert.deepEqual(body.plannedLocks, []);
  assert.equal(body.authorizationGranted, false);
  assert.equal(body.writeAllowed, false);
  assert.equal(body.externalCalls, 0);
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
  assert.match(page, /sourceLockSavePlan\.blockers\.map\(formatSourceLockPlanBlocker\)\.join\(" \/ "\)/);
  assert.match(page, /function SourceLockPlanSummary/);
  assert.match(page, /授权前请核对两条公开来源/);
  assert.match(page, /<SourceLockPlanSummary plan=\{sourceLockSavePlan\}\/>/);
  assert.match(route, /buildManualPublicEvidencePreview/);
  assert.match(route, /manualInputs/);
  assert.match(route, /\.\.\.buildSourceLockSavePlan\(null\)/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
