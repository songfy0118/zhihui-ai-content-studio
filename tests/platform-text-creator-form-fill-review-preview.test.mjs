import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorFormFillReviewPreview } from "../bridge/platform-text-creator-form-fill-review-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contractTarget(platform) {
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
    operation: "prefill_visible_creator_form_and_upload_reviewed_assets_only",
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
    draftFingerprint: "3".repeat(64),
    draftReviewFingerprint: "4".repeat(64),
    visualReviewFingerprint: "5".repeat(64),
  };
}

function readyInputs(platforms = ["xiaohongshu", "douyin"]) {
  const contractTargets = platforms.map(contractTarget);
  const contractPayload = {
    authorizationPreviewFingerprint: "6".repeat(64),
    sourceDraftPackagePlanFingerprint: "7".repeat(64),
    sourceCreatorOpenContractFingerprint: "8".repeat(64),
    sourceAccountConfirmationFingerprint: "c".repeat(64),
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      confirmedAccountMustRemainVisible: true,
      loginAllowed: false,
      reviewedAssetUploadAllowed: true,
      reviewedFieldFillAllowed: true,
      draftSaveAllowed: false,
      publishAllowed: false,
    },
  };
  const contractFingerprint = hash(contractPayload);
  const authorization = {
    status: "platform_text_creator_form_fill_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    formFillAuthorizationGranted: true,
    browserInteractionAllowedByContract: true,
    reviewedAssetUploadAllowedByContract: true,
    reviewedFieldFillAllowedByContract: true,
    draftSaveAllowedByContract: false,
    publishAllowedByContract: false,
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
    executionContract: {
      ...contractPayload,
      contractFingerprint,
      status: "authorized_not_executed",
    },
  };
  const prefilledTargets = contractTargets.map((target) => ({
    platform: target.platform,
    finalUrl: target.visiblePageUrl,
    status: "prefilled_visible_review_pending_not_saved",
    filledFieldFingerprint: hash(target.exactReviewedFields),
    uploadedAssetFingerprints: target.reviewedAssets.map((asset) => asset.svgFingerprint),
    reviewedAssetCount: target.reviewedAssetCount,
    saveDraftRequiredSeparateAuthorization: true,
  }));
  const execution = {
    status: "platform_text_creator_forms_prefilled_review_pending_not_saved",
    blockers: [],
    contractFingerprint,
    prefillAttempts: prefilledTargets.length,
    prefilledCount: prefilledTargets.length,
    prefilledTargets,
    failedTarget: null,
    allTargetsPrefilled: true,
    browserInteractionPerformed: true,
    accountIdentityRemainedVisible: true,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: true,
    formFieldsFilled: true,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: true,
    businessResult: false,
  };
  return { authorization, execution };
}

test("builds a deterministic visible human-review preview for both prefilled forms", () => {
  const inputs = readyInputs();
  const first = buildPlatformTextCreatorFormFillReviewPreview(inputs);
  const repeat = buildPlatformTextCreatorFormFillReviewPreview(structuredClone(inputs));

  assert.equal(first.status, "platform_text_creator_form_fill_human_review_pending");
  assert.equal(first.formFillReviewPreviewFingerprint, repeat.formFillReviewPreviewFingerprint);
  assert.equal(first.targetCount, 2);
  assert.deepEqual(first.reviewTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(first.reviewTargets.every((target) => target.reviewStatus === "human_visible_review_pending"));
  assert.equal(first.requiredConfirmation, `REVIEW PREFILLED CREATOR FORMS ${first.formFillReviewPreviewFingerprint}`);
  assert.equal(first.eligibleForHumanVisibleReview, true);
  assert.equal(first.eligibleForDraftSaveAuthorization, false);
});

test("preserves exact account, field and asset expectations in the checklist", () => {
  const inputs = readyInputs();
  const result = buildPlatformTextCreatorFormFillReviewPreview(inputs);

  for (const [index, target] of result.reviewTargets.entries()) {
    const contract = inputs.authorization.executionContract.contractTargets[index];
    assert.deepEqual(target.confirmedAccount, {
      identityLabel: contract.confirmedAccount.identityLabel,
      accountHandle: null,
    });
    assert.equal(target.expectedFieldFingerprint, hash(contract.exactReviewedFields));
    assert.deepEqual(target.expectedAssetFingerprints, contract.reviewedAssets.map((asset) => asset.svgFingerprint));
    assert.ok(target.requiredChecks.includes("draft_remains_unsaved"));
  }
});

test("rejects partial execution, changed fields and stale execution fingerprints", () => {
  const partial = readyInputs();
  partial.execution.status = "platform_text_creator_form_fill_execution_partial_failed";
  assert.deepEqual(buildPlatformTextCreatorFormFillReviewPreview(partial).blockers, [
    "creator_form_fill_execution_invalid_incomplete_or_tampered",
  ]);

  const changedFields = readyInputs();
  changedFields.authorization.executionContract.contractTargets[0].exactReviewedFields.title += "篡改";
  assert.equal(buildPlatformTextCreatorFormFillReviewPreview(changedFields).eligibleForHumanVisibleReview, false);

  const stale = readyInputs();
  stale.execution.contractFingerprint = "f".repeat(64);
  assert.equal(buildPlatformTextCreatorFormFillReviewPreview(stale).status, "platform_text_creator_form_fill_review_preview_blocked");
});

test("supports one Douyin target without saving, publishing or connecting routes", async () => {
  const result = buildPlatformTextCreatorFormFillReviewPreview(readyInputs(["douyin"]));
  const source = await readFile(new URL("../bridge/platform-text-creator-form-fill-review-preview.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.targetCount, 1);
  assert.equal(result.visibleHumanReviewCompleted, false);
  assert.equal(result.draftSaveAuthorizationGranted, false);
  assert.equal(result.browserInteractionPerformedByPreview, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggeredByPreview, false);
  assert.equal(result.formFieldsFilledByPreview, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-form-fill-review-preview")));
});
