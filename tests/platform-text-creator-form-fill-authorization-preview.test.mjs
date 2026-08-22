import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorFormFillAuthorizationPreview } from "../bridge/platform-text-creator-form-fill-authorization-preview.mjs";
import { assessPlatformTextCreatorOpenAuthorization } from "../bridge/platform-text-creator-open-authorization-gate.mjs";
import { buildPlatformTextCreatorOpenAuthorizationPreview } from "../bridge/platform-text-creator-open-authorization-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function packageItem(platform) {
  const role = "cover";
  const filename = `${platform}-01-${role}.svg`;
  return {
    platform,
    creatorEntryUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish"
      : "https://creator.douyin.com/creator-micro/content/upload",
    interactionMode: "visible_browser_manual_after_separate_authorization",
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？",
    body: "看到标题时先查来源。\n\n两条独立公开来源描述同一模拟事件，真实性仍待确认。",
    coverText: "先核对来源",
    hashtags: ["科技观察", "信息核验"],
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    draftFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    draftReviewFingerprint: "3".repeat(64),
    visualReviewFingerprint: "4".repeat(64),
    assets: [{
      cardIndex: 1,
      role,
      filename,
      relativePath: `work/platform-text-visual-previews/${"5".repeat(64)}/${filename}`,
      width: 1080,
      height: platform === "xiaohongshu" ? 1440 : 1920,
      svgBytes: 256,
      copyFingerprint: "6".repeat(64),
      svgFingerprint: platform === "xiaohongshu" ? "7".repeat(64) : "8".repeat(64),
      verificationStatus: "durable_human_visual_review_confirmed_current",
    }],
    assetCount: 1,
    packageStatus: "reviewed_inputs_ready_pending_creator_open_authorization",
    requiredHumanSteps: [
      "authorize_visible_creator_page_open",
      "verify_visible_account_identity",
      "reconfirm_copy_and_asset_fingerprints",
      "upload_reviewed_assets_and_copy_text_manually",
      "request_separate_authorization_before_saving_draft",
    ],
    creatorPageOpenAuthorized: false,
    draftSaveAuthorized: false,
  };
}

function readyDraftPackage(platforms = ["xiaohongshu", "douyin"]) {
  const packageItems = platforms.map(packageItem);
  const fingerprintPayload = {
    sourceHandoffFingerprint: "9".repeat(64),
    assetPlanFingerprint: "a".repeat(64),
    renderFingerprint: "5".repeat(64),
    bundleManifestFingerprint: "b".repeat(64),
    visualReviewFingerprint: "4".repeat(64),
    assetHandoffPlanFingerprint: "c".repeat(64),
    packageItems,
  };
  return {
    status: "platform_text_unified_draft_package_plan_ready",
    blockers: [],
    ...fingerprintPayload,
    draftPackagePlanFingerprint: hash(fingerprintPayload),
    platformCount: packageItems.length,
    assetCount: packageItems.length,
    copyHandoffReady: true,
    reviewedAssetReferencesReady: true,
    draftPackageInputsReady: true,
    eligibleForCreatorPageOpenAuthorization: true,
    readyForDraftHandoff: false,
    visualAssetsReady: false,
    assetUploadReady: false,
    assetsUnlocked: false,
    browserOpenPerformed: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    filesystemMutations: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

function readyOpenAuthorization(draftPackage) {
  const requestedPlatforms = draftPackage.packageItems.map((item) => item.platform);
  const preview = buildPlatformTextCreatorOpenAuthorizationPreview(draftPackage, requestedPlatforms);
  return assessPlatformTextCreatorOpenAuthorization({
    preview,
    executeRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
  });
}

function readyAccountConfirmation(authorization) {
  const sourceContractFingerprint = authorization.executionContract.contractFingerprint;
  const confirmedIdentityPreviewFingerprint = "d".repeat(64);
  const confirmedAccounts = authorization.executionContract.contractTargets.map((target) => ({
    platform: target.platform,
    pageUrl: target.platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish/publish?target=note"
      : "https://creator.douyin.com/creator-micro/content/upload",
    identityLabel: target.platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
    accountHandle: null,
    decision: "confirmed_current_target_account",
    confirmationSource: "human_visible_page_review",
    confirmationStatus: "human_confirmed",
  }));
  const confirmationPayload = {
    sourceContractFingerprint,
    identityPreviewFingerprint: confirmedIdentityPreviewFingerprint,
    confirmedAccounts,
  };
  return {
    status: "platform_text_creator_account_confirmation_accepted",
    eligible: true,
    blockers: [],
    sourceContractFingerprint,
    confirmedIdentityPreviewFingerprint,
    identityConfirmationFingerprint: hash(confirmationPayload),
    confirmedAccountCount: confirmedAccounts.length,
    confirmedAccounts,
    accountIdentityVerified: true,
    draftFormFillAuthorizationEligible: true,
    browserOpenPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

function readyInputs(platforms) {
  const draftPackagePlan = readyDraftPackage(platforms);
  const creatorOpenAuthorization = readyOpenAuthorization(draftPackagePlan);
  const accountConfirmation = readyAccountConfirmation(creatorOpenAuthorization);
  return { draftPackagePlan, creatorOpenAuthorization, accountConfirmation };
}

test("builds a deterministic form-fill authorization preview bound to copy, assets and accounts", () => {
  const inputs = readyInputs();
  const first = buildPlatformTextCreatorFormFillAuthorizationPreview(inputs);
  const repeat = buildPlatformTextCreatorFormFillAuthorizationPreview(structuredClone(inputs));

  assert.equal(first.status, "platform_text_creator_form_fill_authorization_preview_ready");
  assert.equal(first.formFillAuthorizationPreviewFingerprint, repeat.formFillAuthorizationPreviewFingerprint);
  assert.equal(first.targetCount, 2);
  assert.equal(first.reviewedAssetCount, 2);
  assert.deepEqual(first.fillTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(first.fillTargets.every((target) => target.targetStatus === "preview_only_not_authorized"));
  assert.equal(first.requiredConfirmation, `PREFILL REVIEWED CREATOR FORMS ${first.formFillAuthorizationPreviewFingerprint}`);
  assert.equal(first.eligibleForExplicitFormFillAuthorization, true);
});

test("preserves exact reviewed fields and asset references", () => {
  const inputs = readyInputs();
  const result = buildPlatformTextCreatorFormFillAuthorizationPreview(inputs);

  for (const target of result.fillTargets) {
    const item = inputs.draftPackagePlan.packageItems.find((candidate) => candidate.platform === target.platform);
    assert.equal(target.exactReviewedFields.title, item.title);
    assert.equal(target.exactReviewedFields.body, item.body);
    assert.deepEqual(target.exactReviewedFields.hashtags, item.hashtags);
    assert.deepEqual(target.reviewedAssets, item.assets);
    assert.equal(target.confirmedAccount.identityConfirmationFingerprint, inputs.accountConfirmation.identityConfirmationFingerprint);
  }
});

test("rejects a stale draft package, open contract or account confirmation", () => {
  const stalePackage = readyInputs();
  stalePackage.draftPackagePlan.packageItems[0].title += "篡改";
  assert.ok(buildPlatformTextCreatorFormFillAuthorizationPreview(stalePackage).blockers.includes(
    "creator_open_authorization_invalid_or_stale_for_current_draft_package",
  ));

  const staleContract = readyInputs();
  staleContract.creatorOpenAuthorization.executionContract.contractFingerprint = "f".repeat(64);
  assert.ok(buildPlatformTextCreatorFormFillAuthorizationPreview(staleContract).blockers.includes(
    "creator_open_authorization_invalid_or_stale_for_current_draft_package",
  ));

  const staleAccount = readyInputs();
  staleAccount.accountConfirmation.confirmedAccounts[0].identityLabel = "错误账号";
  assert.ok(buildPlatformTextCreatorFormFillAuthorizationPreview(staleAccount).blockers.includes(
    "creator_account_confirmation_invalid_or_stale",
  ));
});

test("supports one confirmed Douyin target", () => {
  const result = buildPlatformTextCreatorFormFillAuthorizationPreview(readyInputs(["douyin"]));

  assert.equal(result.status, "platform_text_creator_form_fill_authorization_preview_ready");
  assert.equal(result.targetCount, 1);
  assert.equal(result.fillTargets[0].platform, "douyin");
});

test("does not interact with the browser, fill forms, save drafts, publish or connect routes", async () => {
  const result = buildPlatformTextCreatorFormFillAuthorizationPreview(readyInputs());
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.ok(routes.every((content) => !content.includes("platform-text-creator-form-fill-authorization-preview")));
  assert.equal(result.formFillAuthorizationGranted, false);
  assert.equal(result.browserInteractionPerformed, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.formFieldsFilled, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.ok(result.fillTargets.every((target) => target.saveDraftAllowed === false && target.publishAllowed === false));
});
