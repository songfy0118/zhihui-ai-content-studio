import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextDraftHandoffPlan } from "../bridge/platform-text-draft-handoff-plan.mjs";
import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "../bridge/platform-text-draft-review-preview.mjs";
import { buildPlatformTextVisualAssetPlan } from "../bridge/platform-text-visual-asset-plan.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function draft(platform, body) {
  const content = {
    platform,
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？",
    body,
    coverText: platform === "xiaohongshu" ? "双来源重要吗？" : "别只看一个来源？",
    hashtags: platform === "xiaohongshu" ? ["科技观察", "信息核验"] : ["科技资讯", "事实核验"],
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return { ...content, draftFingerprint: hash(content) };
}

function readyHandoff(body = "看到标题时你会先查来源吗？\n\n1. 两条模拟来源描述同一虚构测试。\n核验备注：真实性尚未确认。\n\n资料来源：\n[1] https://official.example/release\n[2] https://independent.example/report\n\n你会核验吗？") {
  const blueprintFingerprint = "a".repeat(64);
  const platformDrafts = {
    xiaohongshu: draft("xiaohongshu", body),
    douyin: draft("douyin", body),
  };
  const draftPreview = {
    status: "platform_text_draft_preview_ready",
    readyForHumanDraftReview: true,
    draftPreviewBuilt: true,
    blueprintFingerprint,
    platformDrafts,
    previewFingerprint: hash({ blueprintFingerprint, platformDrafts }),
  };
  const checks = Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true]));
  const fingerprintPlatforms = Object.values(platformDrafts).map((value) => ({
    platform: value.platform,
    draftFingerprint: value.draftFingerprint,
    reviewNote: `${value.platform} 文案、来源与不确定性说明已逐项人工检查。`,
    checks,
    status: "human_reviewed_in_preview_not_persisted",
  }));
  const reviewFingerprint = hash({
    draftPreviewFingerprint: draftPreview.previewFingerprint,
    blueprintFingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  const receipt = {
    receiptId: `ptdrp_${reviewFingerprint}`,
    draftPreviewFingerprint: draftPreview.previewFingerprint,
    blueprintFingerprint,
    reviewFingerprint,
    idempotencyKey: `platform-text-draft-review:${reviewFingerprint}`,
    status: "active",
    createdAt: "2026-08-21T20:45:00.000Z",
    reviewedPlatforms: fingerprintPlatforms.map((review) => ({
      ...review,
      status: "human_reviewed_persisted",
      createdAt: "2026-08-21T20:45:00.000Z",
    })),
  };
  return buildPlatformTextDraftHandoffPlan(draftPreview, {
    status: "platform_text_draft_review_read_ready",
    found: true,
    receipt,
    readFingerprint: hash(receipt),
    durableHumanReview: true,
    durableReviewInputReady: true,
  });
}

test("builds deterministic Xiaohongshu 3:4 and Douyin 9:16 visual card plans", () => {
  const handoff = readyHandoff();
  const first = buildPlatformTextVisualAssetPlan(handoff);
  const second = buildPlatformTextVisualAssetPlan(handoff);

  assert.deepEqual(first, second);
  assert.equal(first.status, "platform_text_visual_asset_plan_ready");
  assert.match(first.assetPlanFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.platformPlans.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.deepEqual(first.platformPlans[0].canvas, { width: 1080, height: 1440, aspectRatio: "3:4", safeMargin: 96 });
  assert.deepEqual(first.platformPlans[1].canvas, { width: 1080, height: 1920, aspectRatio: "9:16", safeMargin: 108 });
});

test("preserves every reviewed character in cover, body and caption fields", () => {
  const handoff = readyHandoff();
  const result = buildPlatformTextVisualAssetPlan(handoff);

  for (const plan of result.platformPlans) {
    const source = handoff.handoffItems.find((item) => item.platform === plan.platform);
    assert.equal(plan.cards[0].primaryText, source.coverText);
    assert.equal(plan.cards[0].secondaryText, source.title);
    assert.equal(plan.cards.filter(({ role }) => role === "body").map(({ exactText }) => exactText).join(""), source.body);
    assert.deepEqual(plan.caption, {
      title: source.title,
      body: source.body,
      hashtags: source.hashtags,
      sourceNote: source.sourceNote,
    });
  }
  assert.equal(result.exactCopyOnly, true);
});

test("rejects a tampered handoff and copy beyond the eight-body-card budget", () => {
  const tampered = structuredClone(readyHandoff());
  tampered.handoffItems[0].title += "篡改";
  assert.deepEqual(
    buildPlatformTextVisualAssetPlan(tampered).blockers,
    ["platform_text_draft_handoff_plan_invalid_or_tampered"],
  );

  const oversized = buildPlatformTextVisualAssetPlan(readyHandoff("字".repeat(320 * 8 + 1)));
  assert.deepEqual(oversized.blockers, ["platform_copy_exceeds_visual_card_budget:douyin"]);
  assert.equal(oversized.platformPlans.length, 0);
});

test("plans assets without generating files, calling models, opening browsers or publishing", () => {
  const result = buildPlatformTextVisualAssetPlan(readyHandoff());

  assert.equal(result.assetsGenerated, 0);
  assert.deepEqual(result.generatedFiles, []);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("remains disconnected from routes and the executable Xiaohongshu pilot", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/social-draft-handoff.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((content) => !content.includes("platform-text-visual-asset-plan")));
});
