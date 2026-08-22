import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorFormFillAuthorization } from "../bridge/platform-text-creator-form-fill-authorization-gate.mjs";
import { createPlatformTextCreatorFormFillExecutor } from "../bridge/platform-text-creator-form-fill-executor.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fillTarget(platform) {
  const filename = `${platform}-01-cover.svg`;
  return {
    platform,
    creatorEntryUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish"
      : "https://creator.douyin.com/creator-micro/content/upload",
    visiblePageUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish/publish?target=note"
      : "https://creator.douyin.com/creator-micro/content/upload",
    confirmedAccount: {
      identityLabel: platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
      accountHandle: null,
      identityConfirmationFingerprint: "c".repeat(64),
    },
    operation: "prefill_reviewed_creator_form_after_separate_authorization",
    exactReviewedFields: {
      contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
      title: platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？",
      body: "看到标题时先查来源。\n\n两条独立公开来源描述同一模拟事件，真实性仍待确认。",
      coverText: "先核对来源",
      hashtags: ["科技观察", "信息核验"],
      sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    },
    reviewedAssets: [{
      cardIndex: 1,
      role: "cover",
      filename,
      relativePath: `work/platform-text-visual-previews/${"d".repeat(64)}/${filename}`,
      width: 1080,
      height: platform === "xiaohongshu" ? 1440 : 1920,
      svgBytes: 256,
      copyFingerprint: "e".repeat(64),
      svgFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
      verificationStatus: "durable_human_visual_review_confirmed_current",
    }],
    reviewedAssetCount: 1,
    draftFingerprint: platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64),
    draftReviewFingerprint: "5".repeat(64),
    visualReviewFingerprint: "6".repeat(64),
    targetStatus: "preview_only_not_authorized",
    saveDraftAllowed: false,
    publishAllowed: false,
  };
}

function readyAuthorization(platforms = ["xiaohongshu", "douyin"]) {
  const fillTargets = platforms.map(fillTarget);
  const fingerprintPayload = {
    sourceDraftPackagePlanFingerprint: "a".repeat(64),
    sourceCreatorOpenContractFingerprint: "b".repeat(64),
    sourceAccountConfirmationFingerprint: "c".repeat(64),
    fillTargets,
  };
  const formFillAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  const preview = {
    status: "platform_text_creator_form_fill_authorization_preview_ready",
    blockers: [],
    ...fingerprintPayload,
    formFillAuthorizationPreviewFingerprint,
    requiredConfirmation: `PREFILL REVIEWED CREATOR FORMS ${formFillAuthorizationPreviewFingerprint}`,
    targetCount: fillTargets.length,
    reviewedAssetCount: fillTargets.length,
    eligibleForExplicitFormFillAuthorization: true,
    formFillAuthorizationGranted: false,
    browserInteractionPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    formFieldsFilled: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
  return assessPlatformTextCreatorFormFillAuthorization({
    preview,
    prefillRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.formFillAuthorizationPreviewFingerprint,
  });
}

function successfulResponse(request) {
  return {
    completed: true,
    visible: true,
    finalUrl: request.url,
    accountIdentityVisible: true,
    identityLabel: request.confirmedAccount.identityLabel,
    accountHandle: request.confirmedAccount.accountHandle,
    filledFieldFingerprint: hash(request.exactReviewedFields),
    uploadedAssetFingerprints: request.reviewedAssets.map((asset) => asset.svgFingerprint),
    draftSaved: false,
    publishTriggered: false,
  };
}

test("prefills two authorized targets sequentially through an injected simulator", async () => {
  const calls = [];
  const result = await createPlatformTextCreatorFormFillExecutor(async (request) => {
    calls.push(request);
    return successfulResponse(request);
  }).execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_forms_prefilled_review_pending_not_saved");
  assert.equal(result.prefillAttempts, 2);
  assert.equal(result.prefilledCount, 2);
  assert.equal(result.allTargetsPrefilled, true);
  assert.deepEqual(calls.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(calls.every((call) => call.visible && call.operation === "prefill_visible_creator_form_and_upload_reviewed_assets_only"));
  assert.ok(result.prefilledTargets.every((target) => target.status === "prefilled_visible_review_pending_not_saved"));
  assert.ok(result.prefilledTargets.every((target) => target.saveDraftRequiredSeparateAuthorization === true));
});

test("rejects a tampered execution contract before invoking the adapter", async () => {
  const authorization = readyAuthorization();
  authorization.executionContract.contractTargets[0].exactReviewedFields.body += "篡改";
  let calls = 0;
  const result = await createPlatformTextCreatorFormFillExecutor(async (request) => {
    calls += 1;
    return successfulResponse(request);
  }).execute(authorization);

  assert.deepEqual(result.blockers, ["platform_text_creator_form_fill_authorization_invalid_or_tampered"]);
  assert.equal(result.prefillAttempts, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(calls, 0);
});

test("reports partial failure and stops after an injected second-target exception", async () => {
  let calls = 0;
  const result = await createPlatformTextCreatorFormFillExecutor(async (request) => {
    calls += 1;
    if (request.platform === "douyin") throw new Error("simulated_failure");
    return successfulResponse(request);
  }).execute(readyAuthorization());

  assert.equal(result.status, "platform_text_creator_form_fill_execution_partial_failed");
  assert.equal(result.prefillAttempts, 2);
  assert.equal(result.prefilledCount, 1);
  assert.deepEqual(result.failedTarget, { platform: "douyin", reason: "visible_form_prefill_adapter_exception" });
  assert.equal(result.allTargetsPrefilled, false);
  assert.equal(result.accountIdentityRemainedVisible, false);
  assert.equal(calls, 2);
});

test("blocks mismatched account, fingerprints and any reported save or publish", async () => {
  const cases = [
    ["confirmed_account_not_visible_or_mismatched", { identityLabel: "另一个账号" }],
    ["reviewed_fields_or_assets_not_confirmed", { filledFieldFingerprint: "f".repeat(64) }],
    ["forbidden_save_or_publish_observed", { draftSaved: true }],
    ["forbidden_save_or_publish_observed", { publishTriggered: true }],
  ];
  for (const [reason, overrides] of cases) {
    const result = await createPlatformTextCreatorFormFillExecutor(async (request) => ({
      ...successfulResponse(request),
      ...overrides,
    })).execute(readyAuthorization(["douyin"]));

    assert.equal(result.status, "platform_text_creator_form_fill_execution_failed");
    assert.deepEqual(result.blockers, [reason]);
    assert.equal(result.prefilledCount, 0);
    assert.equal(result.draftSaved, false);
    assert.equal(result.publishTriggered, false);
  }
});

test("supports one target and remains disconnected from routes and browser libraries", async () => {
  const result = await createPlatformTextCreatorFormFillExecutor(async (request) => successfulResponse(request))
    .execute(readyAuthorization(["douyin"]));
  const source = await readFile(new URL("../bridge/platform-text-creator-form-fill-executor.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.prefilledCount, 1);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-form-fill-executor")));
});
