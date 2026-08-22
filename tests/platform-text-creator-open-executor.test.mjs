import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPlatformTextCreatorOpenExecutor } from "../bridge/platform-text-creator-open-executor.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyAuthorization() {
  const authorizationPreviewFingerprint = "a".repeat(64);
  const contractTargets = [
    ["xiaohongshu", "https://creator.xiaohongshu.com/publish", "b".repeat(64)],
    ["douyin", "https://creator.douyin.com/creator-micro/content/upload", "c".repeat(64)],
  ].map(([platform, creatorEntryUrl, draftFingerprint]) => ({
    platform,
    creatorEntryUrl,
    operation: "open_visible_official_creator_page_only",
    accountIdentityVerificationRequiredAfterOpen: true,
    draftPackagePlanFingerprint: "d".repeat(64),
    draftFingerprint,
    visualReviewFingerprint: "e".repeat(64),
    reviewedAssetCount: 2,
  }));
  const constraints = {
    visibleBrowserOnly: true,
    loginAllowed: false,
    uploadAllowed: false,
    draftSaveAllowed: false,
    publishAllowed: false,
  };
  const contractPayload = { authorizationPreviewFingerprint, contractTargets, constraints };
  return {
    status: "platform_text_creator_open_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: authorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint: hash(contractPayload),
      status: "authorized_not_executed",
    },
    browserOpenAllowedByContract: true,
    creatorOpenAuthorizationGranted: true,
    browserOpenPerformed: false,
    loginAllowedByContract: false,
    loginStateRead: false,
    loginTriggered: false,
    accountIdentityVerified: false,
    uploadAllowedByContract: false,
    uploadTriggered: false,
    draftSaveAllowedByContract: false,
    draftSaved: false,
    publishAllowedByContract: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

test("opens authorized official creator targets sequentially through an injected simulator", async () => {
  const calls = [];
  const executor = createPlatformTextCreatorOpenExecutor(async (request) => {
    calls.push(request);
    return { opened: true, visible: true, finalUrl: request.url };
  });
  const result = await executor.execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_pages_opened_identity_pending");
  assert.equal(result.openAttempts, 2);
  assert.equal(result.openedCount, 2);
  assert.equal(result.allTargetsOpened, true);
  assert.equal(result.browserOpenPerformed, true);
  assert.equal(result.externalCalls, true);
  assert.deepEqual(calls.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(calls.every((call) => call.visible === true && call.operation === "open_visible_official_creator_page_only"));
  assert.ok(result.openedTargets.every((target) => target.status === "opened_visible_account_identity_pending"));
});

test("rejects tampered authorization before invoking the opener", async () => {
  const authorization = readyAuthorization();
  authorization.executionContract.contractTargets[0].creatorEntryUrl = "https://example.invalid";
  let calls = 0;
  const result = await createPlatformTextCreatorOpenExecutor(async () => {
    calls += 1;
    return { opened: true, visible: true, finalUrl: "https://example.invalid" };
  }).execute(authorization);

  assert.deepEqual(result.blockers, ["platform_text_creator_open_authorization_invalid_or_tampered"]);
  assert.equal(result.openAttempts, 0);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.externalCalls, false);
  assert.equal(calls, 0);
});

test("reports partial opening and stops after an injected second-target failure", async () => {
  let calls = 0;
  const result = await createPlatformTextCreatorOpenExecutor(async (request) => {
    calls += 1;
    if (request.platform === "douyin") throw new Error("simulated_failure");
    return { opened: true, visible: true, finalUrl: request.url };
  }).execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_open_execution_partial_failed");
  assert.equal(result.openAttempts, 2);
  assert.equal(result.openedCount, 1);
  assert.deepEqual(result.failedTarget, { platform: "douyin", reason: "visible_page_opener_exception" });
  assert.equal(result.allTargetsOpened, false);
  assert.equal(result.browserOpenPerformed, true);
  assert.equal(calls, 2);
});

test("does not inspect accounts, log in, upload, save or publish and remains disconnected from routes", async () => {
  const executor = createPlatformTextCreatorOpenExecutor(async (request) => ({
    opened: true,
    visible: true,
    finalUrl: request.url,
  }));
  const result = await executor.execute(readyAuthorization());
  const source = await readFile(new URL("../bridge/platform-text-creator-open-executor.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.ok(routes.every((content) => !content.includes("platform-text-creator-open-executor")));
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.equal(result.accountIdentityVerified, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});
