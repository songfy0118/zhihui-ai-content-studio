import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorOpenAuthorizationPreview } from "../bridge/platform-text-creator-open-authorization-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function packageItem(platform, renderFingerprint, visualReviewFingerprint) {
  const role = "cover";
  const filename = `${platform}-01-${role}.svg`;
  return {
    platform,
    creatorEntryUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish"
      : "https://creator.douyin.com/creator-micro/content/upload",
    interactionMode: "visible_browser_manual_after_separate_authorization",
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: `${platform} 双来源核验示例`,
    body: "两条公开来源描述同一模拟事件，真实性仍待人工确认。",
    coverText: "别只看一个来源",
    hashtags: ["科技观察", "信息核验"],
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    draftFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    draftReviewFingerprint: "3".repeat(64),
    visualReviewFingerprint,
    assets: [{
      cardIndex: 1,
      role,
      filename,
      relativePath: `work/platform-text-visual-previews/${renderFingerprint}/${filename}`,
      width: 1080,
      height: platform === "xiaohongshu" ? 1440 : 1920,
      svgBytes: 1024,
      copyFingerprint: platform === "xiaohongshu" ? "4".repeat(64) : "5".repeat(64),
      svgFingerprint: platform === "xiaohongshu" ? "6".repeat(64) : "7".repeat(64),
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

function readyPackage() {
  const sourceHandoffFingerprint = "8".repeat(64);
  const assetPlanFingerprint = "9".repeat(64);
  const renderFingerprint = "a".repeat(64);
  const bundleManifestFingerprint = "b".repeat(64);
  const visualReviewFingerprint = "c".repeat(64);
  const assetHandoffPlanFingerprint = "d".repeat(64);
  const packageItems = [
    packageItem("xiaohongshu", renderFingerprint, visualReviewFingerprint),
    packageItem("douyin", renderFingerprint, visualReviewFingerprint),
  ];
  const fingerprintPayload = {
    sourceHandoffFingerprint,
    assetPlanFingerprint,
    renderFingerprint,
    bundleManifestFingerprint,
    visualReviewFingerprint,
    assetHandoffPlanFingerprint,
    packageItems,
  };
  return {
    status: "platform_text_unified_draft_package_plan_ready",
    blockers: [],
    ...fingerprintPayload,
    draftPackagePlanFingerprint: hash(fingerprintPayload),
    platformCount: 2,
    assetCount: 2,
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

test("builds a deterministic two-platform creator-open authorization preview", () => {
  const draftPackage = readyPackage();
  const first = buildPlatformTextCreatorOpenAuthorizationPreview(draftPackage, ["xiaohongshu", "douyin"]);
  const repeat = buildPlatformTextCreatorOpenAuthorizationPreview(structuredClone(draftPackage), ["douyin", "xiaohongshu"]);

  assert.equal(first.status, "platform_text_creator_open_authorization_preview_ready");
  assert.equal(first.authorizationPreviewFingerprint, repeat.authorizationPreviewFingerprint);
  assert.deepEqual(first.openTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.match(first.requiredConfirmation, /^OPEN REVIEWED CREATOR PAGES [a-f0-9]{64}$/);
  assert.equal(first.targetCount, 2);
  assert.equal(first.eligibleForExplicitCreatorOpenAuthorization, true);
});

test("supports one selected platform while keeping account identity pending", () => {
  const result = buildPlatformTextCreatorOpenAuthorizationPreview(readyPackage(), ["xiaohongshu"]);

  assert.equal(result.targetCount, 1);
  assert.equal(result.openTargets[0].creatorEntryUrl, "https://creator.xiaohongshu.com/publish");
  assert.deepEqual(result.openTargets[0].accountIdentityCheck, {
    required: true,
    method: "visible_creator_header_manual_confirmation",
    expectedAccountIdentity: null,
    status: "pending_user_verification",
  });
  assert.equal(result.accountIdentityVerified, false);
  assert.equal(result.loginStateRead, false);
});

test("rejects changed packages, duplicates and unsupported targets", () => {
  const changed = readyPackage();
  changed.packageItems[0].title += "篡改";
  const changedResult = buildPlatformTextCreatorOpenAuthorizationPreview(changed, ["xiaohongshu"]);
  assert.ok(changedResult.blockers.includes("platform_text_unified_draft_package_plan_invalid_or_tampered"));

  const duplicate = buildPlatformTextCreatorOpenAuthorizationPreview(readyPackage(), ["douyin", "douyin"]);
  assert.ok(duplicate.blockers.includes("creator_open_target_duplicate"));

  const unsupported = buildPlatformTextCreatorOpenAuthorizationPreview(readyPackage(), ["tiktok"]);
  assert.ok(unsupported.blockers.includes("creator_open_target_not_in_current_package"));
});

test("never opens a browser, reads login state, uploads, saves or publishes", async () => {
  const result = buildPlatformTextCreatorOpenAuthorizationPreview(readyPackage(), ["xiaohongshu", "douyin"]);
  const source = await readFile(new URL("../bridge/platform-text-creator-open-authorization-preview.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-open-authorization-preview")));
  assert.equal(result.creatorOpenAuthorizationGranted, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});
