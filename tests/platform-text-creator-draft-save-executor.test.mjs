import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPlatformTextCreatorDraftSaveExecutor } from "../bridge/platform-text-creator-draft-save-executor.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contractTarget(platform) {
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
    operation: "save_current_visible_creator_form_as_draft_only",
  };
}

function readyAuthorization(platforms = ["xiaohongshu", "douyin"]) {
  const contractTargets = platforms.map(contractTarget);
  const contractPayload = {
    authorizationPreviewFingerprint: "a".repeat(64),
    sourceContractFingerprint: "b".repeat(64),
    sourceReviewConfirmationFingerprint: "c".repeat(64),
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      sameVisiblePageAndAccountRequired: true,
      loginAllowed: false,
      fieldEditsAllowed: false,
      assetEditsAllowed: false,
      draftSaveAllowed: true,
      publishAllowed: false,
    },
  };
  return {
    status: "platform_text_creator_draft_save_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: contractPayload.authorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint: hash(contractPayload),
      status: "authorized_not_executed",
    },
    draftSaveAuthorizationGranted: true,
    browserInteractionAllowedByContract: true,
    sameVisiblePageAndAccountRequiredByContract: true,
    fieldEditsAllowedByContract: false,
    assetEditsAllowedByContract: false,
    draftSaveAllowedByContract: true,
    publishAllowedByContract: false,
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

function successfulResponse(request) {
  return {
    saved: true,
    visible: true,
    saveConfirmationVisible: true,
    finalUrl: request.url,
    accountIdentityVisible: true,
    identityLabel: request.confirmedAccount.identityLabel,
    accountHandle: request.confirmedAccount.accountHandle,
    fieldFingerprint: request.expectedFieldFingerprint,
    assetFingerprints: [...request.expectedAssetFingerprints],
    draftReference: `simulated-${request.platform}-draft`,
    publishTriggered: false,
  };
}

test("saves two authorized drafts sequentially through an injected simulator", async () => {
  const calls = [];
  const result = await createPlatformTextCreatorDraftSaveExecutor(async (request) => {
    calls.push(request);
    return successfulResponse(request);
  }).execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_drafts_save_reported_not_published");
  assert.equal(result.saveAttempts, 2);
  assert.equal(result.savedCount, 2);
  assert.equal(result.allTargetsSaved, true);
  assert.equal(result.draftSaved, true);
  assert.equal(result.publishTriggered, false);
  assert.deepEqual(calls.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(calls.every((call) => call.operation === "save_current_visible_creator_form_as_draft_only"));
});

test("rejects tampered authorization before invoking the adapter", async () => {
  const authorization = readyAuthorization();
  authorization.executionContract.contractTargets[0].expectedFieldFingerprint = "f".repeat(64);
  let calls = 0;
  const result = await createPlatformTextCreatorDraftSaveExecutor(async (request) => {
    calls += 1;
    return successfulResponse(request);
  }).execute(authorization);

  assert.deepEqual(result.blockers, ["creator_draft_save_authorization_invalid_or_tampered"]);
  assert.equal(result.saveAttempts, 0);
  assert.equal(result.draftSaved, false);
  assert.equal(result.externalCalls, false);
  assert.equal(calls, 0);
});

test("reports a partial save and stops after a second-target exception", async () => {
  let calls = 0;
  const result = await createPlatformTextCreatorDraftSaveExecutor(async (request) => {
    calls += 1;
    if (request.platform === "douyin") throw new Error("simulated_failure");
    return successfulResponse(request);
  }).execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_draft_save_execution_partial_failed");
  assert.equal(result.saveAttempts, 2);
  assert.equal(result.savedCount, 1);
  assert.equal(result.draftSaved, true);
  assert.deepEqual(result.failedTarget, { platform: "douyin", reason: "visible_draft_save_adapter_exception" });
  assert.equal(result.publishTriggered, false);
  assert.equal(calls, 2);
});

test("fails closed on changed account, fingerprints or any observed publication", async () => {
  const cases = [
    ["confirmed_account_not_visible_or_mismatched", { identityLabel: "另一个账号" }],
    ["reviewed_fields_or_assets_changed_before_save", { fieldFingerprint: "f".repeat(64) }],
    ["forbidden_publication_observed", { publishTriggered: true }],
  ];
  for (const [reason, overrides] of cases) {
    const result = await createPlatformTextCreatorDraftSaveExecutor(async (request) => ({
      ...successfulResponse(request),
      ...overrides,
    })).execute(readyAuthorization(["douyin"]));

    assert.equal(result.status, "platform_text_creator_draft_save_execution_failed");
    assert.deepEqual(result.blockers, [reason]);
    assert.equal(result.savedCount, 0);
    assert.equal(result.draftSaved, true);
    assert.equal(result.publishTriggered, reason === "forbidden_publication_observed");
  }
});

test("supports one target and remains disconnected from routes and browser libraries", async () => {
  const result = await createPlatformTextCreatorDraftSaveExecutor(async (request) => successfulResponse(request))
    .execute(readyAuthorization(["douyin"]));
  const source = await readFile(new URL("../bridge/platform-text-creator-draft-save-executor.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.savedCount, 1);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.fieldEditsTriggered, false);
  assert.equal(result.assetEditsTriggered, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-draft-save-executor")));
});
