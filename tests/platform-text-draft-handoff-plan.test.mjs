import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextDraftHandoffPlan } from "../bridge/platform-text-draft-handoff-plan.mjs";
import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "../bridge/platform-text-draft-review-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function draft(platform, values) {
  const content = {
    platform,
    contentMode: platform === "xiaohongshu" ? "text_image_carousel_structure" : "text_image_post_structure",
    title: values.title,
    body: `${values.opening}\n\n1. 两条模拟来源描述同一虚构测试。\n核验备注：真实性尚未确认。\n\n资料来源：\n[1] https://official.example/release\n[2] https://independent.example/report\n\n${values.closing}`,
    coverText: values.coverText,
    hashtags: values.hashtags,
    sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return { ...content, draftFingerprint: hash(content) };
}

function readyInputs() {
  const blueprintFingerprint = "a".repeat(64);
  const platformDrafts = {
    xiaohongshu: draft("xiaohongshu", { title: "为什么要核对两个来源？", opening: "一条消息为何要看两遍？", closing: "你会核验吗？", coverText: "双来源重要吗？", hashtags: ["科技观察", "信息核验"] }),
    douyin: draft("douyin", { title: "一条消息为什么需要两个来源？", opening: "看到标题时你会先查来源吗？", closing: "你还想核验什么？", coverText: "别只看一个来源？", hashtags: ["科技资讯", "事实核验"] }),
  };
  const draftPreview = {
    status: "platform_text_draft_preview_ready",
    readyForHumanDraftReview: true,
    draftPreviewBuilt: true,
    blueprintFingerprint,
    platformDrafts,
    previewFingerprint: hash({ blueprintFingerprint, platformDrafts }),
  };
  const reviewChecks = Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true]));
  const fingerprintPlatforms = Object.values(platformDrafts).map((value) => ({
    platform: value.platform,
    draftFingerprint: value.draftFingerprint,
    reviewNote: `${value.platform} 文案、来源与不确定性说明已逐项人工检查。`,
    checks: reviewChecks,
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
    createdAt: "2026-08-21T20:35:00.000Z",
    reviewedPlatforms: fingerprintPlatforms.map((review) => ({ ...review, status: "human_reviewed_persisted", createdAt: "2026-08-21T20:35:00.000Z" })),
  };
  const reviewRead = {
    status: "platform_text_draft_review_read_ready",
    found: true,
    receipt,
    readFingerprint: hash(receipt),
    durableHumanReview: true,
    durableReviewInputReady: true,
  };
  return { draftPreview, reviewRead };
}

test("builds a deterministic two-platform visible-browser handoff plan", () => {
  const { draftPreview, reviewRead } = readyInputs();
  const result = buildPlatformTextDraftHandoffPlan(draftPreview, reviewRead);

  assert.equal(result.status, "platform_text_draft_handoff_plan_ready");
  assert.equal(result.copyHandoffReady, true);
  assert.equal(result.eligibleForVisibleBrowserOpenAuthorization, true);
  assert.match(result.handoffFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.handoffItems.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(result.handoffItems[0].creatorEntryUrl, "https://creator.xiaohongshu.com/publish");
  assert.equal(result.handoffItems[1].creatorEntryUrl, "https://creator.douyin.com/creator-micro/content/upload");
});

test("preserves the exact reviewed copy while requiring visual assets and a separate save authorization", () => {
  const { draftPreview, reviewRead } = readyInputs();
  const result = buildPlatformTextDraftHandoffPlan(draftPreview, reviewRead);

  for (const item of result.handoffItems) {
    const source = draftPreview.platformDrafts[item.platform];
    assert.equal(item.title, source.title);
    assert.equal(item.body, source.body);
    assert.deepEqual(item.hashtags, source.hashtags);
    assert.deepEqual(item.visualAssets, []);
    assert.equal(item.draftSaveAuthorized, false);
  }
  assert.equal(result.visualAssetsRequired, true);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.readyForDraftHandoff, false);
});

test("rejects changed draft copy and stale durable review fingerprints", () => {
  const { draftPreview, reviewRead } = readyInputs();
  draftPreview.platformDrafts.xiaohongshu.body += "\n篡改";
  const changedDraft = buildPlatformTextDraftHandoffPlan(draftPreview, reviewRead);
  assert.ok(changedDraft.blockers.includes("platform_text_draft_preview_invalid_or_tampered"));

  const fresh = readyInputs();
  fresh.reviewRead.receipt.reviewedPlatforms[0].draftFingerprint = "f".repeat(64);
  fresh.reviewRead.readFingerprint = hash(fresh.reviewRead.receipt);
  const staleReview = buildPlatformTextDraftHandoffPlan(fresh.draftPreview, fresh.reviewRead);
  assert.ok(staleReview.blockers.includes("durable_platform_text_draft_review_invalid_or_stale"));
});

test("does not open browsers, upload assets, save drafts or publish", () => {
  const { draftPreview, reviewRead } = readyInputs();
  const result = buildPlatformTextDraftHandoffPlan(draftPreview, reviewRead);

  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});

test("remains disconnected from API routes and the executable Xiaohongshu pilot", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/social-draft-handoff.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((content) => !content.includes("platform-text-draft-handoff-plan")));
});
