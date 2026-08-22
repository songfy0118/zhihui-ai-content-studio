import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorOpenAuthorization } from "../bridge/platform-text-creator-open-authorization-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyPreview() {
  const sourceDraftPackagePlanFingerprint = "a".repeat(64);
  const visualReviewFingerprint = "b".repeat(64);
  const openTargets = [
    ["xiaohongshu", "https://creator.xiaohongshu.com/publish", "c".repeat(64)],
    ["douyin", "https://creator.douyin.com/creator-micro/content/upload", "d".repeat(64)],
  ].map(([platform, creatorEntryUrl, draftFingerprint]) => ({
    platform,
    creatorEntryUrl,
    interactionMode: "visible_browser_user_observable",
    draftPackagePlanFingerprint: sourceDraftPackagePlanFingerprint,
    draftFingerprint,
    visualReviewFingerprint,
    reviewedAssetCount: 2,
    accountIdentityCheck: {
      required: true,
      method: "visible_creator_header_manual_confirmation",
      expectedAccountIdentity: null,
      status: "pending_user_verification",
    },
    openStatus: "preview_only_not_authorized",
  }));
  const authorizationPreviewFingerprint = hash({ sourceDraftPackagePlanFingerprint, openTargets });
  return {
    status: "platform_text_creator_open_authorization_preview_ready",
    blockers: [],
    sourceDraftPackagePlanFingerprint,
    authorizationPreviewFingerprint,
    requiredConfirmation: `OPEN REVIEWED CREATOR PAGES ${authorizationPreviewFingerprint}`,
    openTargets,
    targetCount: 2,
    accountIdentityVerificationRequired: true,
    eligibleForExplicitCreatorOpenAuthorization: true,
    creatorOpenAuthorizationGranted: false,
    browserOpenPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    accountIdentityVerified: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function authorize(preview, overrides = {}) {
  return assessPlatformTextCreatorOpenAuthorization({
    preview,
    executeRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
    ...overrides,
  });
}

test("creates a deterministic open-only execution contract after exact authorization", () => {
  const preview = readyPreview();
  const first = authorize(preview);
  const repeat = authorize(structuredClone(preview));

  assert.equal(first.status, "platform_text_creator_open_authorization_accepted");
  assert.equal(first.eligible, true);
  assert.equal(first.authorizationAccepted, true);
  assert.equal(first.executionContract.contractFingerprint, repeat.executionContract.contractFingerprint);
  assert.deepEqual(first.executionContract.contractTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.executionContract.status, "authorized_not_executed");
  assert.equal(first.browserOpenAllowedByContract, true);
  assert.equal(first.creatorOpenAuthorizationGranted, true);
});

test("blocks missing intent, wrong confirmation and stale fingerprints", () => {
  const preview = readyPreview();
  const missing = authorize(preview, { executeRequested: false });
  const wrongConfirmation = authorize(preview, { confirmation: "OPEN SOMETHING ELSE" });
  const stale = authorize(preview, { authorizedPreviewFingerprint: "f".repeat(64) });

  assert.ok(missing.blockers.includes("creator_open_not_requested"));
  assert.ok(wrongConfirmation.blockers.includes("creator_open_confirmation_invalid"));
  assert.ok(stale.blockers.includes("creator_open_fingerprint_mismatch"));
  assert.equal(missing.executionContract, null);
  assert.equal(wrongConfirmation.browserOpenAllowedByContract, false);
  assert.equal(stale.creatorOpenAuthorizationGranted, false);
});

test("rejects a tampered preview before creating a contract", () => {
  const preview = readyPreview();
  preview.openTargets[0].creatorEntryUrl = "https://example.invalid/upload";
  const result = authorize(preview);

  assert.ok(result.blockers.includes("platform_text_creator_open_authorization_preview_invalid_or_tampered"));
  assert.equal(result.eligible, false);
  assert.equal(result.authorizationAccepted, false);
  assert.equal(result.executionContract, null);
});

test("contract allows only visible page opening and performs no external action", async () => {
  const result = authorize(readyPreview());
  const source = await readFile(new URL("../bridge/platform-text-creator-open-authorization-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(result.executionContract.constraints, {
    visibleBrowserOnly: true,
    loginAllowed: false,
    uploadAllowed: false,
    draftSaveAllowed: false,
    publishAllowed: false,
  });
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-open-authorization-gate")));
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.loginAllowedByContract, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadAllowedByContract, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaveAllowedByContract, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishAllowedByContract, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
});
