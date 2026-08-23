import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST } from "../app/api/news/source-lock-save-authorization-preview/route.ts";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readySavePlan() {
  const reviewFingerprint = "a".repeat(64);
  const plannedLocks = [{
    leadId: "cluster:one",
    title: "OpenAI launches enterprise agent platform",
    reviewFingerprint,
    sources: [
      { evidenceId: "original", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
      { evidenceId: "independent", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
    ],
    claimCount: 0,
    factsVerified: false,
    status: "planned_not_saved",
  }];
  return {
    status: "source_lock_save_plan_ready",
    readyForAuthorizationRequest: true,
    blockers: [],
    reviewFingerprint,
    savePlanFingerprint: hash({ reviewFingerprint, locks: plannedLocks }),
    plannedRecordCount: 1,
    plannedLocks,
    authorizationRequired: true,
    authorizationGranted: false,
    singleUseAuthorizationRequired: true,
    writeAllowed: false,
    persisted: false,
    sourceLocksCreated: 0,
    factsVerified: false,
    draftsUnlocked: 0,
    databaseWrites: false,
    publishTriggered: false,
  };
}

test("returns a no-write authorization preview for the exact save plan", async () => {
  const response = await POST(new Request("http://localhost/api/news/source-lock-save-authorization-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savePlan: readySavePlan() }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "source_lock_save_authorization_preview_ready");
  assert.equal(body.eligibleForExplicitSourceLockSaveAuthorization, true);
  assert.equal(body.sourceLockSaveAuthorizationGranted, false);
  assert.equal(body.liveSaveRouteConnected, false);
  assert.equal(body.databaseWriteAttempted, false);
  assert.equal(body.databaseWrites, false);
  assert.equal(body.persisted, false);
  assert.equal(body.sourceLocksCreated, 0);
  assert.equal(body.publishTriggered, false);
});

test("rejects malformed requests before any external call or write", async () => {
  const response = await POST(new Request("http://localhost/api/news/source-lock-save-authorization-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body.blockers, ["source_lock_save_plan_invalid_or_tampered"]);
  assert.equal(body.externalCalls, false);
  assert.equal(body.databaseWriteAttempted, false);
  assert.equal(body.databaseWrites, false);
  assert.equal(body.persisted, false);
});

test("wires only a preview action without connecting the source-lock writer", async () => {
  const [page, route, savePlanRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-authorization-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /预览单次保存授权（不授权）/);
  assert.match(page, /fetch\("\/api\/news\/source-lock-save-authorization-preview"/);
  assert.match(route, /buildSourceLockSaveAuthorizationPreview/);
  assert.doesNotMatch(route, /source-lock-store|\bgetDb\b|\.batch\(|\.run\(|SAVE_REVIEWED_SOURCE_LOCK/);
  assert.doesNotMatch(savePlanRoute, /source-lock-save-authorization-preview|source-lock-store|\.batch\(|\.run\(/);
});
