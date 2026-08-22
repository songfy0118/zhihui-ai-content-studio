import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorFormFillAuthorization } from "../bridge/platform-text-creator-form-fill-authorization-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fillTarget(platform) {
  const role = "cover";
  const filename = `${platform}-01-${role}.svg`;
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
      role,
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

function readyPreview(platforms = ["xiaohongshu", "douyin"]) {
  const fillTargets = platforms.map(fillTarget);
  const fingerprintPayload = {
    sourceDraftPackagePlanFingerprint: "a".repeat(64),
    sourceCreatorOpenContractFingerprint: "b".repeat(64),
    sourceAccountConfirmationFingerprint: "c".repeat(64),
    fillTargets,
  };
  const formFillAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return {
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
}

function authorize(preview, overrides = {}) {
  return assessPlatformTextCreatorFormFillAuthorization({
    preview,
    prefillRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.formFillAuthorizationPreviewFingerprint,
    ...overrides,
  });
}

test("creates a deterministic prefill-only execution contract after exact authorization", () => {
  const preview = readyPreview();
  const first = authorize(preview);
  const repeat = authorize(structuredClone(preview));

  assert.equal(first.status, "platform_text_creator_form_fill_authorization_accepted");
  assert.equal(first.eligible, true);
  assert.equal(first.authorizationAccepted, true);
  assert.equal(first.executionContract.contractFingerprint, repeat.executionContract.contractFingerprint);
  assert.deepEqual(first.executionContract.contractTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.executionContract.status, "authorized_not_executed");
  assert.equal(first.formFillAuthorizationGranted, true);
});

test("blocks missing intent, wrong confirmation and stale fingerprints", () => {
  const preview = readyPreview();
  const missing = authorize(preview, { prefillRequested: false });
  const wrong = authorize(preview, { confirmation: "PREFILL SOMETHING ELSE" });
  const stale = authorize(preview, { authorizedPreviewFingerprint: "f".repeat(64) });

  assert.ok(missing.blockers.includes("creator_form_fill_not_requested"));
  assert.ok(wrong.blockers.includes("creator_form_fill_confirmation_invalid"));
  assert.ok(stale.blockers.includes("creator_form_fill_preview_fingerprint_mismatch"));
  assert.equal(missing.executionContract, null);
  assert.equal(wrong.formFillAuthorizationGranted, false);
  assert.equal(stale.reviewedAssetUploadAllowedByContract, false);
});

test("rejects tampered copy, assets or account bindings", () => {
  const changedCopy = readyPreview();
  changedCopy.fillTargets[0].exactReviewedFields.body += "篡改";
  assert.ok(authorize(changedCopy).blockers.includes("platform_text_creator_form_fill_authorization_preview_invalid_or_tampered"));

  const changedAsset = readyPreview();
  changedAsset.fillTargets[0].reviewedAssets[0].svgFingerprint = "f".repeat(64);
  assert.ok(authorize(changedAsset).blockers.includes("platform_text_creator_form_fill_authorization_preview_invalid_or_tampered"));

  const unsafePath = readyPreview();
  unsafePath.fillTargets[0].reviewedAssets[0].relativePath = `../outside/${unsafePath.fillTargets[0].reviewedAssets[0].filename}`;
  assert.ok(authorize(unsafePath).blockers.includes("platform_text_creator_form_fill_authorization_preview_invalid_or_tampered"));

  const changedAccount = readyPreview();
  changedAccount.fillTargets[0].confirmedAccount.identityLabel = "另一个账号";
  assert.ok(authorize(changedAccount).blockers.includes("platform_text_creator_form_fill_authorization_preview_invalid_or_tampered"));
});

test("supports one authorized Douyin target", () => {
  const result = authorize(readyPreview(["douyin"]));

  assert.equal(result.eligible, true);
  assert.equal(result.executionContract.contractTargets.length, 1);
  assert.equal(result.executionContract.contractTargets[0].platform, "douyin");
});

test("contract forbids login, draft save and publication and performs no external action", async () => {
  const result = authorize(readyPreview());
  const source = await readFile(new URL("../bridge/platform-text-creator-form-fill-authorization-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(result.executionContract.constraints, {
    visibleBrowserOnly: true,
    confirmedAccountMustRemainVisible: true,
    loginAllowed: false,
    reviewedAssetUploadAllowed: true,
    reviewedFieldFillAllowed: true,
    draftSaveAllowed: false,
    publishAllowed: false,
  });
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-form-fill-authorization-gate")));
  assert.equal(result.browserInteractionPerformed, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.formFieldsFilled, false);
  assert.equal(result.draftSaveAllowedByContract, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishAllowedByContract, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
});
