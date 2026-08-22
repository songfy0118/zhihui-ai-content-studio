import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextVisualAssetHandoffPlan } from "../bridge/platform-text-visual-asset-handoff-plan.mjs";
import { PLATFORM_TEXT_VISUAL_REVIEW_CHECKS } from "../bridge/platform-text-visual-review-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyInputs() {
  const renderFingerprint = "a".repeat(64);
  const bundleManifestFingerprint = "b".repeat(64);
  const assets = [
    { platform: "xiaohongshu", width: 1080, height: 1440, svgBytes: 1024, copy: "c".repeat(64), svg: "d".repeat(64) },
    { platform: "douyin", width: 1080, height: 1920, svgBytes: 1200, copy: "e".repeat(64), svg: "f".repeat(64) },
  ].map(({ platform, width, height, svgBytes, copy, svg }) => ({
    platform,
    cardIndex: 1,
    role: "cover",
    filename: `${platform}-01-cover.svg`,
    width,
    height,
    svgBytes,
    copyFingerprint: copy,
    svgFingerprint: svg,
    exactCopyMetadataVerified: true,
    integrityVerified: true,
  }));
  const bundleInspection = {
    status: "platform_text_svg_bundle_inspection_ready",
    blockers: [],
    bundleFound: true,
    integrityStatus: "verified_pending_human_visual_review",
    renderFingerprint,
    bundleManifestFingerprint,
    bundleDirectory: `work/platform-text-visual-previews/${renderFingerprint}`,
    assets,
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
  const fingerprintPlatforms = assets.map((asset) => ({
    platform: asset.platform,
    assetCount: 1,
    assets: [{
      cardIndex: asset.cardIndex,
      role: asset.role,
      filename: asset.filename,
      copyFingerprint: asset.copyFingerprint,
      svgFingerprint: asset.svgFingerprint,
    }],
    reviewNote: `${asset.platform} 所有信息卡已逐张打开并人工确认可读性与原文一致。`,
    checks,
    status: "human_visual_reviewed_in_preview_not_persisted",
  }));
  const visualReviewFingerprint = hash({ renderFingerprint, bundleManifestFingerprint, reviewedPlatforms: fingerprintPlatforms });
  const receipt = {
    receiptId: `ptvrp_${visualReviewFingerprint}`,
    renderFingerprint,
    bundleManifestFingerprint,
    visualReviewFingerprint,
    idempotencyKey: `platform-text-visual-review:${visualReviewFingerprint}`,
    status: "active",
    createdAt: "2026-08-22T09:55:00.000Z",
    reviewedPlatforms: fingerprintPlatforms.map((review) => ({
      ...review,
      assets: review.assets.map((asset) => ({ ...asset, createdAt: "2026-08-22T09:55:00.000Z" })),
      status: "human_visual_reviewed_persisted",
      createdAt: "2026-08-22T09:55:00.000Z",
    })),
  };
  const visualReviewRead = {
    status: "platform_text_visual_review_read_ready",
    found: true,
    receipt,
    readFingerprint: hash(receipt),
    reviewedPlatforms: 2,
    reviewedAssets: 2,
    durableHumanReview: true,
    durableVisualReviewInputReady: true,
  };
  return { bundleInspection, visualReviewRead };
}

test("builds a deterministic two-platform reviewed asset handoff plan", () => {
  const { bundleInspection, visualReviewRead } = readyInputs();
  const first = buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead);
  const repeat = buildPlatformTextVisualAssetHandoffPlan(structuredClone(bundleInspection), structuredClone(visualReviewRead));

  assert.equal(first.status, "platform_text_visual_asset_handoff_plan_ready");
  assert.equal(first.assetHandoffPlanFingerprint, repeat.assetHandoffPlanFingerprint);
  assert.deepEqual(first.platformPlans.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.plannedAssetCount, 2);
  assert.equal(first.reviewedAssetReferencesPrepared, true);
  assert.equal(first.eligibleForAssetHandoffAuthorization, true);
  assert.equal(first.platformPlans[0].assets[0].relativePath, `${bundleInspection.bundleDirectory}/xiaohongshu-01-cover.svg`);
});

test("preserves inspected asset metadata without unlocking or uploading files", () => {
  const { bundleInspection, visualReviewRead } = readyInputs();
  const result = buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead);

  for (const plan of result.platformPlans) {
    const source = bundleInspection.assets.find((asset) => asset.platform === plan.platform);
    assert.equal(plan.assets[0].copyFingerprint, source.copyFingerprint);
    assert.equal(plan.assets[0].svgFingerprint, source.svgFingerprint);
    assert.equal(plan.assets[0].verificationStatus, "durable_human_visual_review_confirmed_current");
    assert.equal(plan.handoffStatus, "planned_not_authorized");
  }
  assert.equal(result.readyForAssetHandoff, false);
  assert.equal(result.assetsUnlocked, false);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.filesystemReads, 0);
  assert.equal(result.filesystemMutations, false);
});

test("rejects stale inspection assets and tampered durable review projections", () => {
  const stale = readyInputs();
  stale.bundleInspection.assets[0].svgFingerprint = "9".repeat(64);
  const staleResult = buildPlatformTextVisualAssetHandoffPlan(stale.bundleInspection, stale.visualReviewRead);
  assert.deepEqual(staleResult.blockers, ["durable_platform_text_visual_review_invalid_or_stale"]);

  const tampered = readyInputs();
  tampered.visualReviewRead.receipt.reviewedPlatforms[0].reviewNote += " 篡改";
  const tamperedResult = buildPlatformTextVisualAssetHandoffPlan(tampered.bundleInspection, tampered.visualReviewRead);
  assert.deepEqual(tamperedResult.blockers, ["durable_platform_text_visual_review_invalid_or_stale"]);
  assert.equal(tamperedResult.eligibleForAssetHandoffAuthorization, false);
});

test("remains a pure plan disconnected from routes, filesystem writes and publication", async () => {
  const { bundleInspection, visualReviewRead } = readyInputs();
  const result = buildPlatformTextVisualAssetHandoffPlan(bundleInspection, visualReviewRead);
  const source = await readFile(new URL("../bridge/platform-text-visual-asset-handoff-plan.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  for (const operation of ["writeFile(", "mkdir(", "rename(", "rm(", "unlink(", "fetch("]) {
    assert.equal(source.includes(operation), false, `unexpected side effect: ${operation}`);
  }
  assert.ok(routes.every((content) => !content.includes("platform-text-visual-asset-handoff-plan")));
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);
});
