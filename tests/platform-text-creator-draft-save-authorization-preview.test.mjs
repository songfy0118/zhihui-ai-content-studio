import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorDraftSaveAuthorizationPreview } from "../bridge/platform-text-creator-draft-save-authorization-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function confirmedReview(platform) {
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
    expectedAssetFingerprints: [platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64)],
    decision: "confirmed_prefilled_form_matches_reviewed_inputs",
    confirmationSource: "human_visible_creator_form_review",
    checks: {
      visibleAccountMatchesConfirmedAccount: true,
      visibleTitleBodyCoverAndHashtagsMatchReviewedFields: true,
      visibleAssetsMatchReviewedAssetFingerprints: true,
      draftRemainsUnsaved: true,
      publicationRemainsUntriggered: true,
    },
    confirmationStatus: "human_confirmed",
  };
}

function readyConfirmation(platforms = ["xiaohongshu", "douyin"]) {
  const confirmedReviews = platforms.map(confirmedReview);
  const confirmationPayload = {
    sourceContractFingerprint: "a".repeat(64),
    reviewPreviewFingerprint: "b".repeat(64),
    confirmedReviews,
  };
  return {
    status: "platform_text_creator_form_fill_review_confirmation_accepted",
    blockers: [],
    sourceContractFingerprint: confirmationPayload.sourceContractFingerprint,
    confirmedReviewPreviewFingerprint: confirmationPayload.reviewPreviewFingerprint,
    reviewConfirmationFingerprint: hash(confirmationPayload),
    confirmedReviews,
    confirmedReviewCount: confirmedReviews.length,
    visibleHumanReviewCompleted: true,
    draftSaveAuthorizationPreviewEligible: true,
    draftSaveAuthorizationGranted: false,
    browserInteractionPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggeredByGate: false,
    formFieldsFilledByGate: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

test("builds a deterministic two-platform draft-save authorization preview", () => {
  const confirmation = readyConfirmation();
  const first = buildPlatformTextCreatorDraftSaveAuthorizationPreview(confirmation);
  const repeat = buildPlatformTextCreatorDraftSaveAuthorizationPreview(structuredClone(confirmation));

  assert.equal(first.status, "platform_text_creator_draft_save_authorization_preview_ready");
  assert.equal(first.draftSaveAuthorizationPreviewFingerprint, repeat.draftSaveAuthorizationPreviewFingerprint);
  assert.equal(first.targetCount, 2);
  assert.deepEqual(first.saveTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.requiredConfirmation, `SAVE REVIEWED CREATOR DRAFTS ${first.draftSaveAuthorizationPreviewFingerprint}`);
  assert.equal(first.eligibleForExplicitDraftSaveAuthorization, true);
});

test("preserves exact reviewed account and fingerprint bindings while keeping save unauthorized", () => {
  const confirmation = readyConfirmation();
  const result = buildPlatformTextCreatorDraftSaveAuthorizationPreview(confirmation);

  for (const [index, target] of result.saveTargets.entries()) {
    const review = confirmation.confirmedReviews[index];
    assert.deepEqual(target.confirmedAccount, review.confirmedAccount);
    assert.equal(target.expectedFieldFingerprint, review.expectedFieldFingerprint);
    assert.deepEqual(target.expectedAssetFingerprints, review.expectedAssetFingerprints);
    assert.equal(target.operation, "save_current_visible_creator_form_as_draft_after_separate_authorization");
    assert.equal(target.targetStatus, "preview_only_not_authorized");
    assert.equal(target.draftSaveAllowed, false);
    assert.equal(target.publishAllowed, false);
  }
  assert.equal(result.draftSaveAuthorizationGranted, false);
  assert.equal(result.draftSaved, false);
});

test("rejects tampered reviews, stale fingerprints and incomplete review checks", () => {
  const changedReview = readyConfirmation();
  changedReview.confirmedReviews[0].expectedFieldFingerprint = "f".repeat(64);
  assert.ok(buildPlatformTextCreatorDraftSaveAuthorizationPreview(changedReview).blockers.includes(
    "creator_form_fill_review_confirmation_invalid_or_tampered",
  ));

  const stale = readyConfirmation();
  stale.reviewConfirmationFingerprint = "f".repeat(64);
  assert.equal(buildPlatformTextCreatorDraftSaveAuthorizationPreview(stale).eligibleForExplicitDraftSaveAuthorization, false);

  const incomplete = readyConfirmation();
  incomplete.confirmedReviews[0].checks.draftRemainsUnsaved = false;
  assert.equal(buildPlatformTextCreatorDraftSaveAuthorizationPreview(incomplete).status,
    "platform_text_creator_draft_save_authorization_preview_blocked");
});

test("supports one confirmed Douyin draft target", () => {
  const result = buildPlatformTextCreatorDraftSaveAuthorizationPreview(readyConfirmation(["douyin"]));

  assert.equal(result.targetCount, 1);
  assert.equal(result.saveTargets[0].platform, "douyin");
  assert.equal(result.saveTargets[0].requiresSameVisiblePageAndAccount, true);
});

test("does not open pages, save drafts, publish or connect routes", async () => {
  const result = buildPlatformTextCreatorDraftSaveAuthorizationPreview(readyConfirmation());
  const source = await readFile(new URL("../bridge/platform-text-creator-draft-save-authorization-preview.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.browserInteractionPerformed, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.draftSaveTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-draft-save-authorization-preview")));
});
