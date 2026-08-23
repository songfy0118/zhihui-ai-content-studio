import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { buildSourceLockSaveAuthorizationPreview } from "../bridge/source-lock-save-authorization-preview.mjs";
import { assessSourceLockSaveAuthorization } from "../bridge/source-lock-save-authorization-gate.mjs";
import { preflightSourceLockSaveExecution } from "../bridge/source-lock-save-execution-preflight.mjs";

const ISSUED_AT = "2026-08-23T10:25:00.000Z";
const CHECKED_AT = "2026-08-23T10:27:00.000Z";
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

function authorization() {
  const searchPlan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  const metadata = buildEvidenceMetadataPreview(searchPlan, [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const review = buildEvidenceReviewPreview(searchPlan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks }]);
  const plan = buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
  const preview = buildSourceLockSaveAuthorizationPreview(plan);
  return assessSourceLockSaveAuthorization({
    preview,
    authorizationRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
  }, { now: () => ISSUED_AT });
}

function preflight(value = authorization(), overrides = {}) {
  return preflightSourceLockSaveExecution({
    authorization: value,
    preflightRequested: true,
    checkedAt: CHECKED_AT,
    observedTicketConsumptionCount: 0,
    storageStatus: "verified",
    targetBinding: "DB",
    writerAdapterPresent: true,
    liveSaveRouteConnected: true,
    ...overrides,
  });
}

test("preflights one unconsumed ticket deterministically inside its time window", () => {
  const value = authorization();
  const first = preflight(value);
  const repeat = preflight(structuredClone(value));

  assert.equal(first.status, "source_lock_save_execution_preflight_ready");
  assert.equal(first.authorizationWindowValid, true);
  assert.equal(first.remainingTicketUses, 1);
  assert.equal(first.millisecondsUntilExpiry, 3 * 60_000);
  assert.equal(first.eligibleForExplicitExecutionAuthorization, true);
  assert.equal(first.executionAuthorizationGranted, false);
  assert.equal(first.readyForSingleSaveInvocation, false);
  assert.deepEqual(first, repeat);
});

test("reports the current disconnected execution path as explicit blockers", () => {
  const result = preflight(authorization(), {
    storageStatus: "unknown",
    targetBinding: null,
    writerAdapterPresent: false,
    liveSaveRouteConnected: false,
  });

  assert.ok(result.blockers.includes("source_lock_storage_not_verified"));
  assert.ok(result.blockers.includes("source_lock_target_binding_mismatch"));
  assert.ok(result.blockers.includes("source_lock_writer_adapter_missing"));
  assert.ok(result.blockers.includes("source_lock_live_save_route_not_connected"));
  assert.equal(result.eligibleForExplicitExecutionAuthorization, false);
});

test("blocks before validity, at expiry, replay and invalid counts", () => {
  const before = preflight(authorization(), { checkedAt: "2026-08-23T10:24:59.999Z" });
  const expired = preflight(authorization(), { checkedAt: "2026-08-23T10:30:00.000Z" });
  const replay = preflight(authorization(), { observedTicketConsumptionCount: 1 });
  const invalid = preflight(authorization(), { observedTicketConsumptionCount: -1 });

  assert.ok(before.blockers.includes("source_lock_save_authorization_not_yet_valid"));
  assert.ok(expired.blockers.includes("source_lock_save_authorization_expired"));
  assert.ok(replay.blockers.includes("source_lock_save_authorization_ticket_already_consumed"));
  assert.ok(invalid.blockers.includes("source_lock_save_ticket_consumption_count_invalid"));
});

test("rejects tampered authorization tickets", () => {
  const changedTarget = authorization();
  changedTarget.authorizationTicket.saveTarget.title += " changed";
  const changedWindow = authorization();
  changedWindow.authorizationTicket.expiresAt = "2026-08-23T10:31:00.000Z";

  for (const result of [preflight(changedTarget), preflight(changedWindow)]) {
    assert.ok(result.blockers.includes("source_lock_save_authorization_invalid_or_tampered"));
    assert.equal(result.remainingTicketUses, 0);
  }
});

test("preflight never consumes the ticket, reads the database, writes, saves or publishes", async () => {
  const result = preflight();
  const [source, previewRoute, savePlanRoute, migrationRoute] = await Promise.all([
    readFile(new URL("../bridge/source-lock-save-execution-preflight.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-authorization-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.authorizationTicketConsumed, false);
  assert.equal(result.databaseBindingRead, false);
  assert.equal(result.databaseWriteAttempted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.persisted, false);
  assert.equal(result.sourceLocksCreated, 0);
  assert.equal(result.draftsUnlocked, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.doesNotMatch(source, /source-lock-store|process\.env|\.prepare\s*\(|\bfetch\s*\(|writeFile|appendFile|mkdir/);
  assert.ok([previewRoute, savePlanRoute, migrationRoute].every((content) => !content.includes("source-lock-save-execution-preflight")));
});
