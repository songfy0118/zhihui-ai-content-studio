import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { renderPlatformTextVisualSvgAssets } from "../bridge/platform-text-visual-svg-renderer.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function platformPlan(platform, body) {
  const title = platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？";
  const canvas = platform === "xiaohongshu"
    ? { width: 1080, height: 1440, aspectRatio: "3:4", safeMargin: 96 }
    : { width: 1080, height: 1920, aspectRatio: "9:16", safeMargin: 108 };
  const coverText = platform === "xiaohongshu" ? "双来源重要吗？" : "别只看一个来源？";
  const cards = [
    { cardIndex: 1, role: "cover", primaryText: coverText, secondaryText: title, renderStatus: "planned_not_generated" },
    { cardIndex: 2, role: "body", exactText: body, textStart: 0, textEnd: body.length, renderStatus: "planned_not_generated" },
  ];
  return {
    platform,
    canvas,
    style: {
      layout: "editorial_information_cards",
      background: "editorial_dark",
      typography: "headline_body_source",
      motion: "not_applicable_to_static_cards",
    },
    caption: {
      title,
      body,
      hashtags: platform === "xiaohongshu" ? ["科技观察", "信息核验"] : ["科技资讯", "事实核验"],
      sourceNote: "[1] https://official.example/release\n[2] https://independent.example/report",
    },
    draftFingerprint: platform === "xiaohongshu" ? "c".repeat(64) : "d".repeat(64),
    reviewFingerprint: "e".repeat(64),
    cards,
    plannedAssetCount: cards.length,
    renderStatus: "planned_not_generated",
  };
}

function readyPlan(body = "看到标题时先查来源。\n\n<script>alert(\"x\")</script> & 该内容仅为模拟测试。") {
  const sourceHandoffFingerprint = "b".repeat(64);
  const platformPlans = [platformPlan("xiaohongshu", body), platformPlan("douyin", body)];
  return {
    status: "platform_text_visual_asset_plan_ready",
    blockers: [],
    sourceHandoffFingerprint,
    assetPlanFingerprint: hash({ sourceHandoffFingerprint, platformPlans }),
    platformPlans,
    plannedAssetCount: platformPlans.reduce((total, plan) => total + plan.plannedAssetCount, 0),
    exactCopyOnly: true,
    assetsGenerated: 0,
    generatedFiles: [],
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
}

test("renders deterministic in-memory SVG assets at each platform canvas size", () => {
  const plan = readyPlan();
  const first = renderPlatformTextVisualSvgAssets(plan);
  const second = renderPlatformTextVisualSvgAssets(plan);

  assert.deepEqual(first, second);
  assert.equal(first.status, "platform_text_visual_svg_render_ready");
  assert.equal(first.assetsRendered, 4);
  assert.match(first.renderFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.assets.map(({ width, height }) => [width, height]), [
    [1080, 1440], [1080, 1440], [1080, 1920], [1080, 1920],
  ]);
  assert.ok(first.assets.every(({ svgFingerprint, svgBytes }) => /^[a-f0-9]{64}$/.test(svgFingerprint) && svgBytes > 500));
  assert.ok(first.assets.every(({ svg }) => svg.includes("Noto Sans SC") && svg.includes("Microsoft YaHei")));
});

test("embeds lossless reviewed copy metadata and escapes active SVG markup", () => {
  const plan = readyPlan();
  const result = renderPlatformTextVisualSvgAssets(plan);

  for (const asset of result.assets) {
    const encoded = asset.svg.match(/data-exact-copy-base64url="([^"]+)"/)?.[1];
    assert.ok(encoded);
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const source = plan.platformPlans.find(({ platform }) => platform === asset.platform).cards[asset.cardIndex - 1];
    const expected = source.role === "cover"
      ? JSON.stringify({ primaryText: source.primaryText, secondaryText: source.secondaryText })
      : source.exactText;
    assert.equal(decoded, expected);
  }
  const bodySvg = result.assets.find(({ platform, role }) => platform === "xiaohongshu" && role === "body").svg;
  assert.ok(bodySvg.includes("&lt;script&gt;"));
  assert.ok(bodySvg.includes("&amp;"));
  assert.ok(!bodySvg.includes("<script>"));
});

test("rejects a tampered asset plan and text that exceeds the SVG layout", () => {
  const tampered = readyPlan();
  tampered.platformPlans[0].caption.body += "篡改";
  assert.deepEqual(
    renderPlatformTextVisualSvgAssets(tampered).blockers,
    ["platform_text_visual_asset_plan_invalid_or_tampered"],
  );

  const overflow = readyPlan(Array.from({ length: 21 }, () => "一").join("\n"));
  assert.deepEqual(
    renderPlatformTextVisualSvgAssets(overflow).blockers,
    ["card_text_exceeds_svg_layout:xiaohongshu:2"],
  );
});

test("keeps files, models, platform drafts and publication closed pending visual review", () => {
  const result = renderPlatformTextVisualSvgAssets(readyPlan());

  assert.equal(result.visualPreviewReady, true);
  assert.equal(result.readyForHumanVisualReview, true);
  assert.equal(result.humanVisualReviewRequired, true);
  assert.equal(result.filesWritten, false);
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
  assert.ok(routes.every((content) => !content.includes("platform-text-visual-svg-renderer")));
});
