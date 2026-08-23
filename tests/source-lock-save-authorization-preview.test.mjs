import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { buildSourceLockSaveAuthorizationPreview } from "../bridge/source-lock-save-authorization-preview.mjs";

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

function readySavePlan() {
  const searchPlan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  const metadata = buildEvidenceMetadataPreview(searchPlan, [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const review = buildEvidenceReviewPreview(searchPlan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks }]);
  return buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
}

test("builds a deterministic single-use authorization preview bound to the exact save plan", () => {
  const plan = readySavePlan();
  const first = buildSourceLockSaveAuthorizationPreview(plan);
  const repeat = buildSourceLockSaveAuthorizationPreview(structuredClone(plan));

  assert.equal(first.status, "source_lock_save_authorization_preview_ready");
  assert.equal(first.authorizationPreviewFingerprint, repeat.authorizationPreviewFingerprint);
  assert.equal(first.sourceSavePlanFingerprint, plan.savePlanFingerprint);
  assert.equal(first.sourceReviewFingerprint, plan.reviewFingerprint);
  assert.equal(first.saveTarget.evidenceCount, 2);
  assert.deepEqual(first.saveTarget.evidenceRoles, ["independent", "original"]);
  assert.equal(first.requiredConfirmation, `AUTHORIZE REVIEWED SOURCE LOCK SAVE ${first.authorizationPreviewFingerprint}`);
  assert.equal(first.eligibleForExplicitSourceLockSaveAuthorization, true);
});

test("rejects a tampered plan or a falsely opened write boundary", () => {
  const tampered = readySavePlan();
  tampered.plannedLocks[0].title += " changed";
  assert.deepEqual(buildSourceLockSaveAuthorizationPreview(tampered).blockers, ["source_lock_save_plan_invalid_or_tampered"]);

  const writeEnabled = readySavePlan();
  writeEnabled.writeAllowed = true;
  assert.equal(buildSourceLockSaveAuthorizationPreview(writeEnabled).eligibleForExplicitSourceLockSaveAuthorization, false);

  const alreadyAuthorized = readySavePlan();
  alreadyAuthorized.authorizationGranted = true;
  assert.equal(buildSourceLockSaveAuthorizationPreview(alreadyAuthorized).status, "source_lock_save_authorization_preview_blocked");
});

test("keeps authorization, writes, source locks, drafts and publication closed", () => {
  const result = buildSourceLockSaveAuthorizationPreview(readySavePlan());

  assert.equal(result.singleUseAuthorizationRequired, true);
  assert.equal(result.sourceLockSaveAuthorizationGranted, false);
  assert.equal(result.liveSaveRouteConnected, false);
  assert.equal(result.writeAllowed, false);
  assert.equal(result.databaseWriteAttempted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.persisted, false);
  assert.equal(result.sourceLocksCreated, 0);
  assert.equal(result.draftsUnlocked, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("does not connect the preview contract to a save route, store or live database", async () => {
  const [source, savePlanRoute, migrationRoute] = await Promise.all([
    readFile(new URL("../bridge/source-lock-save-authorization-preview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /source-lock-store|\bfetch\s*\(|\bgetDb\b|\.batch\(|\.run\(/);
  assert.doesNotMatch(savePlanRoute, /source-lock-save-authorization-preview|source-lock-store|\.batch\(|\.run\(/);
  assert.doesNotMatch(migrationRoute, /source-lock-save-authorization-preview|source-lock-store/);
});
