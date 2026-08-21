import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PLATFORM_TEXT_VISUAL_REVIEW_CHECKS,
  PLATFORM_TEXT_VISUAL_REVIEW_CONFIRMATION,
  buildPlatformTextVisualReviewPreview,
} from "../bridge/platform-text-visual-review-preview.mjs";

function readyInspection() {
  const renderFingerprint = "a".repeat(64);
  return {
    status: "platform_text_svg_bundle_inspection_ready",
    blockers: [],
    bundleFound: true,
    integrityStatus: "verified_pending_human_visual_review",
    renderFingerprint,
    bundleManifestFingerprint: "b".repeat(64),
    bundleDirectory: `work/platform-text-visual-previews/${renderFingerprint}`,
    assets: [
      {
        platform: "xiaohongshu",
        cardIndex: 1,
        role: "cover",
        filename: "xiaohongshu-01-cover.svg",
        width: 1080,
        height: 1440,
        svgBytes: 1024,
        copyFingerprint: "c".repeat(64),
        svgFingerprint: "d".repeat(64),
        exactCopyMetadataVerified: true,
        integrityVerified: true,
      },
      {
        platform: "douyin",
        cardIndex: 1,
        role: "cover",
        filename: "douyin-01-cover.svg",
        width: 1080,
        height: 1920,
        svgBytes: 1200,
        copyFingerprint: "e".repeat(64),
        svgFingerprint: "f".repeat(64),
        exactCopyMetadataVerified: true,
        integrityVerified: true,
      },
    ],
    fileReads: 12,
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
}

function completeReviews() {
  return ["xiaohongshu", "douyin"].map((platform) => ({
    platform,
    approve: true,
    reviewNote: `${platform} 所有信息卡已逐张打开并人工确认可读性与原文一致。`,
    checks: Object.fromEntries(PLATFORM_TEXT_VISUAL_REVIEW_CHECKS.map((check) => [check, true])),
  }));
}

function options(inspection) {
  return {
    confirmedRenderFingerprint: inspection.renderFingerprint,
    confirmedBundleManifestFingerprint: inspection.bundleManifestFingerprint,
    confirmation: PLATFORM_TEXT_VISUAL_REVIEW_CONFIRMATION,
  };
}

test("builds a deterministic non-persisted visual review receipt preview", () => {
  const inspection = readyInspection();
  const first = buildPlatformTextVisualReviewPreview(inspection, completeReviews(), options(inspection));
  const repeat = buildPlatformTextVisualReviewPreview(structuredClone(inspection), completeReviews(), options(inspection));

  assert.equal(first.status, "platform_text_visual_review_preview_ready");
  assert.equal(first.visualReviewFingerprint, repeat.visualReviewFingerprint);
  assert.equal(first.receiptPreview.receiptId, `ptvrp_${first.visualReviewFingerprint}`);
  assert.equal(first.idempotencyKey, `platform-text-visual-review:${first.visualReviewFingerprint}`);
  assert.equal(first.reviewedPlatformCountInPreview, 2);
  assert.equal(first.reviewedAssetCountInPreview, 2);
  assert.equal(first.eligibleForAuthorizedVisualReviewSave, true);
  assert.equal(first.receiptPreview.status, "preview_not_persisted");
});

test("requires current render and manifest fingerprints plus every human check", () => {
  const inspection = readyInspection();
  const reviews = completeReviews();
  reviews[0].approve = false;
  reviews[1].checks.text_legibility_approved = false;
  const result = buildPlatformTextVisualReviewPreview(inspection, reviews, {
    confirmedRenderFingerprint: "0".repeat(64),
    confirmedBundleManifestFingerprint: "1".repeat(64),
    confirmation: null,
  });

  assert.ok(result.blockers.includes("render_fingerprint_confirmation_mismatch"));
  assert.ok(result.blockers.includes("bundle_manifest_fingerprint_confirmation_mismatch"));
  assert.ok(result.blockers.includes("platform_text_visual_review_confirmation_invalid"));
  assert.ok(result.blockers.includes("xiaohongshu:explicit_platform_visual_approval_required"));
  assert.ok(result.blockers.includes("douyin:human_visual_review_checks_incomplete"));
  assert.equal(result.receiptPreview, null);
});

test("rejects tampered inspection boundaries and incomplete platform reviews", () => {
  const inspection = readyInspection();
  inspection.assets[0].integrityVerified = false;
  inspection.visualAssetsReady = true;
  const result = buildPlatformTextVisualReviewPreview(inspection, [completeReviews()[0]], options(inspection));

  assert.ok(result.blockers.includes("platform_text_svg_bundle_inspection_invalid_or_tampered"));
  assert.ok(result.blockers.includes("platform_text_visual_reviews_incomplete"));
  assert.equal(result.eligibleForAuthorizedVisualReviewSave, false);
});

test("binds review notes and inspected asset hashes to the preview fingerprint", () => {
  const inspection = readyInspection();
  const reviews = completeReviews();
  const first = buildPlatformTextVisualReviewPreview(inspection, reviews, options(inspection));
  const changedNote = structuredClone(reviews);
  changedNote[0].reviewNote += " 封面层级也已复查。";
  const second = buildPlatformTextVisualReviewPreview(inspection, changedNote, options(inspection));
  const changedAsset = structuredClone(inspection);
  changedAsset.assets[0].svgFingerprint = "9".repeat(64);
  const third = buildPlatformTextVisualReviewPreview(changedAsset, reviews, options(changedAsset));

  assert.notEqual(first.visualReviewFingerprint, second.visualReviewFingerprint);
  assert.notEqual(first.visualReviewFingerprint, third.visualReviewFingerprint);
});

test("does not persist review, unlock assets, save drafts or connect routes", async () => {
  const inspection = readyInspection();
  const result = buildPlatformTextVisualReviewPreview(inspection, completeReviews(), options(inspection));

  assert.equal(result.persistenceAuthorizationRequired, true);
  assert.equal(result.persistenceAuthorizationGranted, false);
  assert.equal(result.visualReviewPersisted, false);
  assert.equal(result.humanVisualReviewCompleted, false);
  assert.equal(result.visualAssetsReady, false);
  assert.equal(result.assetUploadReady, false);
  assert.equal(result.readyForDraftHandoff, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.browserOpenPerformed, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.externalCalls, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.businessResult, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/social-draft-handoff.mjs", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((content) => !content.includes("platform-text-visual-review-preview")));
});
