import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview, EVIDENCE_REVIEW_CHECKS } from "../bridge/evidence-review-preview.mjs";
import { buildSourceLockSavePlan } from "../bridge/source-lock-save-plan.mjs";
import { buildSourceLockSaveAuthorizationPreview } from "../bridge/source-lock-save-authorization-preview.mjs";
import { assessSourceLockSaveAuthorization } from "../bridge/source-lock-save-authorization-gate.mjs";

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

function readyPreview() {
  const searchPlan = buildEvidenceSearchPlan([lead], [lead.id], sources);
  const metadata = buildEvidenceMetadataPreview(searchPlan, [{ id: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z" }]);
  const checks = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map((check) => [check, true]));
  const review = buildEvidenceReviewPreview(searchPlan, metadata, [{ leadId: lead.id, candidateId: "b-match", checks }]);
  const plan = buildSourceLockSavePlan(review, { confirmedReviewFingerprint: review.reviewFingerprint });
  return buildSourceLockSaveAuthorizationPreview(plan);
}

function authorize(preview, overrides = {}, options = {}) {
  return assessSourceLockSaveAuthorization({
    preview,
    authorizationRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
    ...overrides,
  }, {
    now: () => "2026-08-23T10:15:00.000Z",
    ...options,
  });
}

test("creates a deterministic short-lived single-use ticket after exact confirmation", () => {
  const preview = readyPreview();
  const first = authorize(preview);
  const repeat = authorize(structuredClone(preview));

  assert.equal(first.status, "source_lock_save_authorization_accepted");
  assert.equal(first.eligible, true);
  assert.equal(first.authorizationAccepted, true);
  assert.equal(first.sourceLockSaveAuthorizationGranted, true);
  assert.equal(first.authorizationTicket.ticketFingerprint, repeat.authorizationTicket.ticketFingerprint);
  assert.equal(first.authorizationTicket.status, "authorized_pending_execution_preflight");
  assert.equal(first.authorizationTicket.issuedAt, "2026-08-23T10:15:00.000Z");
  assert.equal(first.authorizationTicket.expiresAt, "2026-08-23T10:20:00.000Z");
  assert.equal(first.authorizationTicket.sourceSavePlanFingerprint, preview.sourceSavePlanFingerprint);
});

test("blocks missing intent, wrong confirmation and stale preview fingerprints", () => {
  const preview = readyPreview();
  const missing = authorize(preview, { authorizationRequested: false });
  const wrong = authorize(preview, { confirmation: "AUTHORIZE SOMETHING ELSE" });
  const stale = authorize(preview, { authorizedPreviewFingerprint: "f".repeat(64) });

  assert.ok(missing.blockers.includes("source_lock_save_authorization_not_requested"));
  assert.ok(wrong.blockers.includes("source_lock_save_authorization_confirmation_invalid"));
  assert.ok(stale.blockers.includes("source_lock_save_authorization_preview_fingerprint_mismatch"));
  assert.equal(missing.authorizationTicket, null);
  assert.equal(wrong.sourceLockSaveAuthorizationGranted, false);
  assert.equal(stale.executionEligible, false);
});

test("rejects a tampered preview and invalid ticket window", () => {
  const tampered = readyPreview();
  tampered.saveTarget.title += " changed";
  assert.ok(authorize(tampered).blockers.includes("source_lock_save_authorization_preview_invalid_or_tampered"));

  const tamperedTerms = readyPreview();
  tamperedTerms.authorizationTerms.evidenceRecordCount = 3;
  assert.ok(authorize(tamperedTerms).blockers.includes("source_lock_save_authorization_preview_invalid_or_tampered"));

  const invalidWindow = authorize(readyPreview(), {}, { ttlSeconds: 30 });
  assert.ok(invalidWindow.blockers.includes("source_lock_save_authorization_ticket_window_invalid"));
  assert.equal(invalidWindow.authorizationAccepted, false);

  const clockFailure = authorize(readyPreview(), {}, { now: () => { throw new Error("clock unavailable"); } });
  assert.ok(clockFailure.blockers.includes("source_lock_save_authorization_ticket_window_invalid"));
  assert.equal(clockFailure.authorizationTicket, null);
});

test("accepted authorization still cannot execute, write, unlock drafts or publish", () => {
  const result = authorize(readyPreview());

  assert.deepEqual(result.authorizationTicket.constraints, {
    singleUse: true,
    exactSavePlanFingerprintRequired: true,
    explicitExecuteRequestRequired: true,
    executionPreflightRequired: true,
    liveDatabaseBindingRequired: true,
    databaseWriteAllowed: false,
    draftUnlockAllowed: false,
    publishAllowed: false,
  });
  assert.equal(result.ticketConsumed, false);
  assert.equal(result.executionPreflightRequired, true);
  assert.equal(result.executionEligible, false);
  assert.equal(result.liveSaveRouteConnected, false);
  assert.equal(result.writeAllowedByContract, false);
  assert.equal(result.databaseWriteAttempted, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.persisted, false);
  assert.equal(result.sourceLocksCreated, 0);
  assert.equal(result.draftsUnlocked, 0);
  assert.equal(result.publishTriggered, false);
});

test("does not connect the authorization gate to routes, writer or live database", async () => {
  const [source, previewRoute, savePlanRoute, migrationRoute] = await Promise.all([
    readFile(new URL("../bridge/source-lock-save-authorization-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-authorization-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/source-lock-migration/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /source-lock-store|\bfetch\s*\(|\bgetDb\b|\.batch\(|\.run\(/);
  assert.doesNotMatch(previewRoute, /source-lock-save-authorization-gate|source-lock-store|\.batch\(|\.run\(/);
  assert.doesNotMatch(savePlanRoute, /source-lock-save-authorization-gate|source-lock-store|\.batch\(|\.run\(/);
  assert.doesNotMatch(migrationRoute, /source-lock-save-authorization-gate|source-lock-store/);
});
