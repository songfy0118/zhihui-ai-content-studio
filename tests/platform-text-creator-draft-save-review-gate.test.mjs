import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorDraftSaveReviewConfirmation } from "../bridge/platform-text-creator-draft-save-review-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewTarget(platform) {
  return {
    platform,
    pageUrl: platform === "xiaohongshu"
      ? "https://creator.xiaohongshu.com/new/note-manager"
      : "https://creator.douyin.com/creator-micro/content/manage",
    confirmedAccount: {
      identityLabel: platform === "xiaohongshu" ? "测试小红书账号" : "测试抖音账号",
      accountHandle: null,
    },
    draftReference: `simulated-${platform}-draft`,
    expectedFieldFingerprint: platform === "xiaohongshu" ? "1".repeat(64) : "2".repeat(64),
    expectedAssetFingerprints: [platform === "xiaohongshu" ? "3".repeat(64) : "4".repeat(64)],
    requiredChecks: [
      "visible_account_matches_confirmed_account",
      "draft_reference_matches_execution_result",
      "draft_is_visible_in_creator_draft_manager",
      "draft_content_and_assets_match_reviewed_fingerprints",
      "publication_remains_untriggered",
    ],
    reviewStatus: "human_visible_draft_review_pending",
  };
}

function readyPreview(platforms = ["xiaohongshu", "douyin"]) {
  const reviewTargets = platforms.map(reviewTarget);
  const fingerprintPayload = {
    sourceContractFingerprint: "a".repeat(64),
    reviewTargets,
  };
  const draftSaveReviewPreviewFingerprint = hash(fingerprintPayload);
  return {
    status: "platform_text_creator_saved_drafts_human_review_pending",
    blockers: [],
    sourceContractFingerprint: fingerprintPayload.sourceContractFingerprint,
    draftSaveReviewPreviewFingerprint,
    requiredConfirmation: `REVIEW SAVED CREATOR DRAFTS ${draftSaveReviewPreviewFingerprint}`,
    reviewTargets,
    targetCount: reviewTargets.length,
    eligibleForHumanVisibleDraftReview: true,
    visibleHumanDraftReviewCompleted: false,
    draftReviewAccepted: false,
    browserInteractionPerformedByPreview: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggeredByPreview: false,
    draftSavedByPreview: false,
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
    decision: "confirmed_saved_draft_matches_reviewed_inputs",
    confirmationSource: "human_visible_creator_draft_manager_review",
    checks: {
      visibleAccountMatchesConfirmedAccount: true,
      draftReferenceMatchesExecutionResult: true,
      draftIsVisibleInCreatorDraftManager: true,
      draftContentAndAssetsMatchReviewedFingerprints: true,
      publicationRemainsUntriggered: true,
    },
  }));
}

function acceptedInput(preview = readyPreview()) {
  return {
    preview,
    reviewRequested: true,
    confirmation: preview.requiredConfirmation,
    confirmedReviewPreviewFingerprint: preview.draftSaveReviewPreviewFingerprint,
    decisions: decisionsFor(preview),
  };
}

test("accepts exact human draft-manager confirmation for both platforms", () => {
  const input = acceptedInput();
  const first = assessPlatformTextCreatorDraftSaveReviewConfirmation(input);
  const repeat = assessPlatformTextCreatorDraftSaveReviewConfirmation(structuredClone(input));

  assert.equal(first.status, "platform_text_creator_draft_save_review_confirmation_accepted");
  assert.equal(first.draftSaveReviewConfirmationFingerprint, repeat.draftSaveReviewConfirmationFingerprint);
  assert.equal(first.confirmedDraftCount, 2);
  assert.deepEqual(first.confirmedDrafts.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.visibleHumanDraftReviewCompleted, true);
  assert.equal(first.draftSaveVerifiedByHuman, true);
  assert.equal(first.manualPublishDecisionRequired, true);
  assert.equal(first.publicationAuthorizationGranted, false);
});

test("blocks missing intent, wrong confirmation and stale preview fingerprints", () => {
  const preview = readyPreview();
  const result = assessPlatformTextCreatorDraftSaveReviewConfirmation({
    preview,
    reviewRequested: false,
    confirmation: "wrong",
    confirmedReviewPreviewFingerprint: "f".repeat(64),
    decisions: decisionsFor(preview),
  });

  assert.deepEqual(result.blockers, [
    "creator_draft_save_review_not_requested",
    "creator_draft_save_review_confirmation_invalid",
    "creator_draft_save_review_preview_fingerprint_mismatch",
  ]);
  assert.equal(result.draftSaveVerifiedByHuman, false);
  assert.equal(result.publicationAuthorizationGranted, false);
});

test("blocks incomplete checks, reordered decisions and a tampered preview", () => {
  const incompletePreview = readyPreview();
  const incomplete = acceptedInput(incompletePreview);
  incomplete.decisions[0].checks.draftIsVisibleInCreatorDraftManager = false;
  assert.ok(assessPlatformTextCreatorDraftSaveReviewConfirmation(incomplete).blockers.includes(
    "creator_draft_save_review_decisions_invalid_or_incomplete",
  ));

  const reorderedPreview = readyPreview();
  const reordered = acceptedInput(reorderedPreview);
  reordered.decisions.reverse();
  assert.equal(assessPlatformTextCreatorDraftSaveReviewConfirmation(reordered).confirmedDraftCount, 0);

  const tamperedPreview = readyPreview();
  tamperedPreview.reviewTargets[0].draftReference = "changed-reference";
  assert.ok(assessPlatformTextCreatorDraftSaveReviewConfirmation(acceptedInput(tamperedPreview)).blockers.includes(
    "creator_draft_save_review_preview_invalid_or_tampered",
  ));
});

test("supports one confirmed Douyin draft while keeping publication manual and unauthorized", () => {
  const preview = readyPreview(["douyin"]);
  const result = assessPlatformTextCreatorDraftSaveReviewConfirmation(acceptedInput(preview));

  assert.equal(result.confirmedDraftCount, 1);
  assert.equal(result.confirmedDrafts[0].platform, "douyin");
  assert.equal(result.confirmedDrafts[0].confirmationStatus,
    "human_confirmed_saved_draft_visible_not_published");
  assert.equal(result.manualPublishDecisionRequired, true);
  assert.equal(result.publicationAuthorizationGranted, false);
  assert.equal(result.publishTriggered, false);
});

test("confirmation gate performs no browser, draft, publication or route action", async () => {
  const result = assessPlatformTextCreatorDraftSaveReviewConfirmation(acceptedInput());
  const source = await readFile(new URL("../bridge/platform-text-creator-draft-save-review-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.browserInteractionPerformedByGate, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.draftSaveTriggeredByGate, false);
  assert.equal(result.draftSavedByGate, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-draft-save-review-gate")));
});
