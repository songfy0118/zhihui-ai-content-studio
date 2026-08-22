import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorDraftSaveAuthorization } from "../bridge/platform-text-creator-draft-save-authorization-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function saveTarget(platform) {
  return {
    platform,
    pageUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish/publish?target=note"
      : "https://creator.douyin.com/creator-micro/content/upload",
    confirmedAccount: {
      identityLabel: platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
      accountHandle: null,
    },
    expectedFieldFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    expectedAssetFingerprints: [platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64)],
    operation: "save_current_visible_creator_form_as_draft_after_separate_authorization",
    targetStatus: "preview_only_not_authorized",
    requiresSameVisiblePageAndAccount: true,
    draftSaveAllowed: false,
    publishAllowed: false,
  };
}

function readyPreview(platforms = ["xiaohongshu", "douyin"]) {
  const saveTargets = platforms.map(saveTarget);
  const fingerprintPayload = {
    sourceContractFingerprint: "a".repeat(64),
    sourceReviewConfirmationFingerprint: "b".repeat(64),
    saveTargets,
  };
  const draftSaveAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return {
    status: "platform_text_creator_draft_save_authorization_preview_ready",
    blockers: [],
    ...fingerprintPayload,
    draftSaveAuthorizationPreviewFingerprint,
    requiredConfirmation: `SAVE REVIEWED CREATOR DRAFTS ${draftSaveAuthorizationPreviewFingerprint}`,
    targetCount: saveTargets.length,
    eligibleForExplicitDraftSaveAuthorization: true,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

function authorize(preview, overrides = {}) {
  return assessPlatformTextCreatorDraftSaveAuthorization({
    preview,
    saveRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.draftSaveAuthorizationPreviewFingerprint,
    ...overrides,
  });
}

test("creates a deterministic save-only execution contract after exact authorization", () => {
  const preview = readyPreview();
  const first = authorize(preview);
  const repeat = authorize(structuredClone(preview));

  assert.equal(first.status, "platform_text_creator_draft_save_authorization_accepted");
  assert.equal(first.executionContract.contractFingerprint, repeat.executionContract.contractFingerprint);
  assert.deepEqual(first.executionContract.contractTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.executionContract.status, "authorized_not_executed");
  assert.equal(first.draftSaveAuthorizationGranted, true);
  assert.equal(first.draftSaveAllowedByContract, true);
  assert.equal(first.publishAllowedByContract, false);
});

test("blocks missing intent, wrong confirmation and stale fingerprints", () => {
  const preview = readyPreview();
  const missing = authorize(preview, { saveRequested: false });
  const wrong = authorize(preview, { confirmation: "SAVE SOMETHING ELSE" });
  const stale = authorize(preview, { authorizedPreviewFingerprint: "f".repeat(64) });

  assert.ok(missing.blockers.includes("creator_draft_save_not_requested"));
  assert.ok(wrong.blockers.includes("creator_draft_save_confirmation_invalid"));
  assert.ok(stale.blockers.includes("creator_draft_save_preview_fingerprint_mismatch"));
  assert.equal(stale.executionContract, null);
  assert.equal(stale.draftSaveAuthorizationGranted, false);
});

test("rejects changed accounts, fingerprints or save targets", () => {
  const changedAccount = readyPreview();
  changedAccount.saveTargets[0].confirmedAccount.identityLabel = "另一个账号";
  assert.ok(authorize(changedAccount).blockers.includes("creator_draft_save_authorization_preview_invalid_or_tampered"));

  const changedField = readyPreview();
  changedField.saveTargets[0].expectedFieldFingerprint = "f".repeat(64);
  assert.ok(authorize(changedField).blockers.includes("creator_draft_save_authorization_preview_invalid_or_tampered"));

  const offOrigin = readyPreview();
  offOrigin.saveTargets[0].pageUrl = "https://example.invalid/draft";
  assert.ok(authorize(offOrigin).blockers.includes("creator_draft_save_authorization_preview_invalid_or_tampered"));
});

test("supports one authorized Douyin draft target", () => {
  const result = authorize(readyPreview(["douyin"]));

  assert.equal(result.executionContract.contractTargets.length, 1);
  assert.equal(result.executionContract.contractTargets[0].platform, "douyin");
});

test("contract allows only draft save and gate performs no external action", async () => {
  const result = authorize(readyPreview());
  const source = await readFile(new URL("../bridge/platform-text-creator-draft-save-authorization-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(result.executionContract.constraints, {
    visibleBrowserOnly: true,
    sameVisiblePageAndAccountRequired: true,
    loginAllowed: false,
    fieldEditsAllowed: false,
    assetEditsAllowed: false,
    draftSaveAllowed: true,
    publishAllowed: false,
  });
  assert.equal(result.browserInteractionPerformed, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.draftSaveTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-draft-save-authorization-gate")));
});
