import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextUnifiedDraftPackagePlan } from "../bridge/platform-text-unified-draft-package-plan.mjs";
import { buildPlatformTextVisualAssetHandoffPlan } from "../bridge/platform-text-visual-asset-handoff-plan.mjs";
import { buildPlatformTextVisualAssetPlan } from "../bridge/platform-text-visual-asset-plan.mjs";
import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";
import { renderPlatformTextVisualSvgAssets } from "../bridge/platform-text-visual-svg-renderer.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function handoffItem(platform) {
  const content = {
    platform,
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？",
    body: "看到标题时先查来源。\n\n两条独立公开来源描述同一模拟事件，真实性仍待确认。",
    coverText: platform === "xiaohongshu" ? "双来源重要吗？" : "别只看一个来源？",
    hashtags: platform === "xiaohongshu" ? ["科技观察", "信息核验"] : ["科技资讯", "事实核验"],
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return {
    platform,
    creatorEntryUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish"
      : "https://creator.douyin.com/creator-micro/content/upload",
    interactionMode: "visible_browser_manual",
    contentMode: content.contentMode,
    title: content.title,
    body: content.body,
    coverText: content.coverText,
    hashtags: content.hashtags,
    sourceNote: content.sourceNote,
    draftFingerprint: hash(content),
    reviewFingerprint: "e".repeat(64),
    requiredHumanSteps: [
      "open_official_creator_page_after_separate_authorization",
      "verify_visible_account_identity",
      "prepare_and_review_visual_assets",
      "copy_reviewed_text_into_creator_form",
      "request_separate_authorization_before_saving_draft",
    ],
    visualAssets: [],
    draftSaveAuthorized: false,
  };
}

function readyChain() {
  const handoffItems = [handoffItem("xiaohongshu"), handoffItem("douyin")];
  const source = {
    draftPreviewFingerprint: "a".repeat(64),
    reviewFingerprint: "e".repeat(64),
    handoffItems,
  };
  const draftHandoffPlan = {
    status: "platform_text_draft_handoff_plan_ready",
    blockers: [],
    draftPreviewFingerprint: source.draftPreviewFingerprint,
    reviewFingerprint: source.reviewFingerprint,
    handoffFingerprint: hash(source),
    handoffItems,
    copyHandoffReady: true,
    eligibleForVisibleBrowserOpenAuthorization: true,
    visualAssetsRequired: true,
    assetUploadReady: false,
    readyForDraftHandoff: false,
  };
  const visualAssetPlan = buildPlatformTextVisualAssetPlan(draftHandoffPlan);
  const svgRender = renderPlatformTextVisualSvgAssets(visualAssetPlan);
  const bundleManifestFingerprint = "b".repeat(64);
  const bundleInspection = {
    status: "platform_text_svg_bundle_inspection_ready",
    blockers: [],
    bundleFound: true,
    integrityStatus: "verified_pending_human_visual_review",
    renderFingerprint: svgRender.renderFingerprint,
    bundleManifestFingerprint,
    bundleDirectory: `work/platform-text-visual-previews/${svgRender.renderFingerprint}`,
    assets: svgRender.assets.map(({ platform, cardIndex, role, filename, width, height, svgBytes, copyFingerprint, svgFingerprint }) => ({
      platform, cardIndex, role, filename, width, height, svgBytes, copyFingerprint, svgFingerprint,
      exactCopyMetadataVerified: true,
      integrityVerified: true,
    })),
    filesystemMutations: false,
    readyForHumanVisualReview: true,
    humanVisualReviewRequired: true,
    visualAssetsReady: false,
    assetUploadReady: false,
    readyForDraftHandoff: false,
    browserOpenPerformed: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
  const checks = Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true]));
  const fingerprintPlatforms = ["xiaohongshu", "douyin"].map((platform) => {
    const assets = bundleInspection.assets.filter((asset) => asset.platform === platform).map((asset) => ({
      cardIndex: asset.cardIndex,
      role: asset.role,
      filename: asset.filename,
      copyFingerprint: asset.copyFingerprint,
      svgFingerprint: asset.svgFingerprint,
    }));
    return {
      platform,
      assetCount: assets.length,
      assets,
      reviewNote: `${platform} 全部卡片已经人工打开并核对文案、尺寸与可读性。`,
      checks,
      status: "human_visual_reviewed_in_preview_not_persisted",
    };
  });
  const visualReviewFingerprint = hash({
    renderFingerprint: svgRender.renderFingerprint,
    bundleManifestFingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  const receipt = {
    receiptId: `ptvrp_${visualReviewFingerprint}`,
    renderFingerprint: svgRender.renderFingerprint,
    bundleManifestFingerprint,
    visualReviewFingerprint,
    idempotencyKey: `platform-text-visual-review:${visualReviewFingerprint}`,
    status: "active",
    createdAt: "2026-08-22T10:10:00.000Z",
    reviewedPlatforms: fingerprintPlatforms.map((review) => ({
      ...review,
      assets: review.assets.map((asset) => ({ ...asset, createdAt: "2026-08-22T10:10:00.000Z" })),
      status: "human_visual_reviewed_persisted",
      createdAt: "2026-08-22T10:10:00.000Z",
    })),
  };
  const visualReviewRead = {
    status: "platform_text_visual_review_read_ready",
    found: true,
    receipt,
    readFingerprint: hash(receipt),
    reviewedPlatforms: 2,
    reviewedAssets: bundleInspection.assets.length,
    durableHumanReview: true,
    durableVisualReviewInputReady: true,
  };
  const visualAssetHandoffPlan = buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead);
  return { draftHandoffPlan, visualAssetPlan, svgRender, bundleInspection, visualReviewRead, visualAssetHandoffPlan };
}

test("builds a deterministic unified two-platform draft package plan", () => {
  const chain = readyChain();
  const first = buildPlatformTextUnifiedDraftPackagePlan(chain);
  const repeat = buildPlatformTextUnifiedDraftPackagePlan(structuredClone(chain));

  assert.equal(first.status, "platform_text_unified_draft_package_plan_ready");
  assert.equal(first.draftPackagePlanFingerprint, repeat.draftPackagePlanFingerprint);
  assert.equal(first.platformCount, 2);
  assert.equal(first.assetCount, chain.svgRender.assets.length);
  assert.deepEqual(first.packageItems.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.copyHandoffReady, true);
  assert.equal(first.reviewedAssetReferencesReady, true);
  assert.equal(first.draftPackageInputsReady, true);
  assert.equal(first.eligibleForCreatorPageOpenAuthorization, true);
});

test("binds exact reviewed copy and assets through every upstream fingerprint", () => {
  const chain = readyChain();
  const result = buildPlatformTextUnifiedDraftPackagePlan(chain);

  for (const item of result.packageItems) {
    const copy = chain.draftHandoffPlan.handoffItems.find((candidate) => candidate.platform === item.platform);
    const assets = chain.visualAssetHandoffPlan.platformPlans.find((candidate) => candidate.platform === item.platform);
    assert.equal(item.title, copy.title);
    assert.equal(item.body, copy.body);
    assert.deepEqual(item.hashtags, copy.hashtags);
    assert.deepEqual(item.assets, assets.assets);
    assert.equal(item.packageStatus, "reviewed_inputs_ready_pending_creator_open_authorization");
  }
  assert.equal(result.sourceHandoffFingerprint, chain.draftHandoffPlan.handoffFingerprint);
  assert.equal(result.assetPlanFingerprint, chain.visualAssetPlan.assetPlanFingerprint);
  assert.equal(result.renderFingerprint, chain.svgRender.renderFingerprint);
  assert.equal(result.visualReviewFingerprint, chain.visualReviewRead.receipt.visualReviewFingerprint);
});

test("fails closed when any copy, render or reviewed asset stage is stale", () => {
  const changedCopy = readyChain();
  changedCopy.draftHandoffPlan.handoffItems[0].body += "篡改";
  assert.ok(buildPlatformTextUnifiedDraftPackagePlan(changedCopy).blockers.includes("platform_text_visual_asset_plan_invalid_or_stale"));

  const changedRender = readyChain();
  changedRender.svgRender.assets[0].svgFingerprint = "9".repeat(64);
  assert.ok(buildPlatformTextUnifiedDraftPackagePlan(changedRender).blockers.includes("platform_text_svg_render_invalid_or_stale"));

  const changedReview = readyChain();
  changedReview.visualAssetHandoffPlan.platformPlans[0].assets[0].svgFingerprint = "8".repeat(64);
  assert.ok(buildPlatformTextUnifiedDraftPackagePlan(changedReview).blockers.includes("platform_text_visual_asset_handoff_invalid_or_stale"));
});

test("stays authorization-only without opening, uploading, saving or publishing", async () => {
  const result = buildPlatformTextUnifiedDraftPackagePlan(readyChain());
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.assetsUnlocked, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
  assert.ok(routes.every((content) => !content.includes("platform-text-unified-draft-package-plan")));
});
