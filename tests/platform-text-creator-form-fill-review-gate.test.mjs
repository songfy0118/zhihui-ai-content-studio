import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorFormFillReviewConfirmation } from "../bridge/platform-text-creator-form-fill-review-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewTarget(platform) {
  return {
    platform,
    pageUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/publish/publish?target=note"
      : "https://creator.douyin.com/creator-micro/content/upload",
    confirmedAccount: {
      identityLabel: platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
      accountHandle: null,
    },
    expectedFieldFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    expectedTitle: platform === "xiaohongshu" ? "为什么要核对两个来源？" : "一条消息为什么需要两个来源？",
    expectedCoverText: "先核对来源",
    expectedHashtags: ["科技观察", "信息核验"],
    expectedAssetFingerprints: [platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64)],
    expectedAssetCount: 1,
    requiredChecks: [
      "visible_account_matches_confirmed_account",
      "visible_title_body_cover_and_hashtags_match_reviewed_fields",
      "visible_assets_match_reviewed_asset_fingerprints",
      "draft_remains_unsaved",
      "publication_remains_untriggered",
    ],
    reviewStatus: "human_visible_review_pending",
  };
}

function readyPreview(platforms = ["xiaohongshu", "douyin"]) {
  const reviewTargets = platforms.map(reviewTarget);
  const fingerprintPayload = {
    sourceContractFingerprint: "a".repeat(64),
    reviewTargets,
  };
  const formFillReviewPreviewFingerprint = hash(fingerprintPayload);
  return {
    status: "platform_text_creator_form_fill_human_review_pending",
    blockers: [],
    ...fingerprintPayload,
    formFillReviewPreviewFingerprint,
    requiredConfirmation: `REVIEW PREFILLED CREATOR FORMS ${formFillReviewPreviewFingerprint}`,
    targetCount: reviewTargets.length,
    eligibleForHumanVisibleReview: true,
    visibleHumanReviewCompleted: false,
    eligibleForDraftSaveAuthorization: false,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformedByPreview: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggeredByPreview: false,
    formFieldsFilledByPreview: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

function decisionsFor(preview) {
  return preview.reviewTargets.map((target) => ({
    platform: target.platform,
    decision: "confirmed_prefilled_form_matches_reviewed_inputs",
    confirmationSource: "human_visible_creator_form_review",
    checks: {
      visibleAccountMatchesConfirmedAccount: true,
      visibleTitleBodyCoverAndHashtagsMatchReviewedFields: true,
      visibleAssetsMatchReviewedAssetFingerprints: true,
      draftRemainsUnsaved: true,
      publicationRemainsUntriggered: true,
    },
  }));
}

function confirm(preview, overrides = {}) {
  return assessPlatformTextCreatorFormFillReviewConfirmation({
    preview,
    reviewRequested: true,
    confirmation: preview.requiredConfirmation,
    confirmedReviewPreviewFingerprint: preview.formFillReviewPreviewFingerprint,
    decisions: decisionsFor(preview),
    ...overrides,
  });
}

test("accepts exact human confirmation for both visible prefilled forms", () => {
  const preview = readyPreview();
  const first = confirm(preview);
  const repeat = confirm(structuredClone(preview));

  assert.equal(first.status, "platform_text_creator_form_fill_review_confirmation_accepted");
  assert.equal(first.reviewConfirmationFingerprint, repeat.reviewConfirmationFingerprint);
  assert.equal(first.confirmedReviewCount, 2);
  assert.deepEqual(first.confirmedReviews.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.visibleHumanReviewCompleted, true);
  assert.equal(first.draftSaveAuthorizationPreviewEligible, true);
  assert.equal(first.draftSaveAuthorizationGranted, false);
});

test("blocks missing intent, wrong confirmation and stale fingerprints", () => {
  const preview = readyPreview();
  const missing = confirm(preview, { reviewRequested: false });
  const wrong = confirm(preview, { confirmation: "REVIEW SOMETHING ELSE" });
  const stale = confirm(preview, { confirmedReviewPreviewFingerprint: "f".repeat(64) });

  assert.ok(missing.blockers.includes("creator_form_fill_review_not_requested"));
  assert.ok(wrong.blockers.includes("creator_form_fill_review_confirmation_invalid"));
  assert.ok(stale.blockers.includes("creator_form_fill_review_preview_fingerprint_mismatch"));
  assert.equal(stale.visibleHumanReviewCompleted, false);
});

test("blocks incomplete checks, reordered decisions and a tampered preview", () => {
  const preview = readyPreview();
  const incomplete = decisionsFor(preview);
  incomplete[0].checks.draftRemainsUnsaved = false;
  assert.ok(confirm(preview, { decisions: incomplete }).blockers.includes(
    "creator_form_fill_review_decisions_invalid_or_incomplete",
  ));

  const reordered = decisionsFor(preview).reverse();
  assert.ok(confirm(preview, { decisions: reordered }).blockers.includes(
    "creator_form_fill_review_decisions_invalid_or_incomplete",
  ));

  const tampered = readyPreview();
  tampered.reviewTargets[0].expectedTitle += "篡改";
  assert.ok(confirm(tampered).blockers.includes("creator_form_fill_review_preview_invalid_or_tampered"));
});

test("supports one explicitly reviewed Douyin form", () => {
  const result = confirm(readyPreview(["douyin"]));

  assert.equal(result.confirmedReviewCount, 1);
  assert.equal(result.confirmedReviews[0].platform, "douyin");
  assert.equal(result.draftSaveAuthorizationPreviewEligible, true);
});

test("does not open pages, save drafts, publish or connect routes", async () => {
  const result = confirm(readyPreview());
  const source = await readFile(new URL("../bridge/platform-text-creator-form-fill-review-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.draftSaveAuthorizationGranted, false);
  assert.equal(result.browserInteractionPerformedByGate, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggeredByGate, false);
  assert.equal(result.formFieldsFilledByGate, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-form-fill-review-gate")));
});
