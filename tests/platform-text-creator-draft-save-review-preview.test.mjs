import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorDraftSaveReviewPreview } from "../bridge/platform-text-creator-draft-save-review-preview.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contractTarget(platform) {
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
    operation: "save_current_visible_creator_form_as_draft_only",
  };
}

function readyInputs(platforms = ["xiaohongshu", "douyin"]) {
  const contractTargets = platforms.map(contractTarget);
  const contractPayload = {
    authorizationPreviewFingerprint: "a".repeat(64),
    sourceContractFingerprint: "b".repeat(64),
    sourceReviewConfirmationFingerprint: "c".repeat(64),
    contractTargets,
    constraints: {
      visibleBrowserOnly: true,
      sameVisiblePageAndAccountRequired: true,
      loginAllowed: false,
      fieldEditsAllowed: false,
      assetEditsAllowed: false,
      draftSaveAllowed: true,
      publishAllowed: false,
    },
  };
  const contractFingerprint = hash(contractPayload);
  const authorization = {
    status: "platform_text_creator_draft_save_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: contractPayload.authorizationPreviewFingerprint,
    executionContract: {
      ...contractPayload,
      contractFingerprint,
      status: "authorized_not_executed",
    },
    draftSaveAuthorizationGranted: true,
    browserInteractionAllowedByContract: true,
    sameVisiblePageAndAccountRequiredByContract: true,
    fieldEditsAllowedByContract: false,
    assetEditsAllowedByContract: false,
    draftSaveAllowedByContract: true,
    publishAllowedByContract: false,
    browserInteractionPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    draftSaveTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
  const savedTargets = contractTargets.map((target) => ({
    platform: target.platform,
    finalUrl: target.pageUrl,
    draftReference: `simulated-${target.platform}-draft`,
    fieldFingerprint: target.expectedFieldFingerprint,
    assetFingerprints: [...target.expectedAssetFingerprints],
    status: "draft_save_reported_visible_not_published",
    publishAllowed: false,
  }));
  const execution = {
    status: "platform_text_creator_drafts_save_reported_not_published",
    blockers: [],
    contractFingerprint,
    saveAttempts: savedTargets.length,
    savedCount: savedTargets.length,
    savedTargets,
    failedTarget: null,
    allTargetsSaved: true,
    browserInteractionPerformed: true,
    sameVisiblePageAndAccountConfirmed: true,
    loginStateRead: false,
    loginTriggered: false,
    fieldEditsTriggered: false,
    assetEditsTriggered: false,
    draftSaveTriggered: true,
    draftSaved: true,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: true,
    businessResult: false,
  };
  return { authorization, execution };
}

test("builds a deterministic human-review preview for two reported draft saves", () => {
  const inputs = readyInputs();
  const first = buildPlatformTextCreatorDraftSaveReviewPreview(inputs);
  const repeat = buildPlatformTextCreatorDraftSaveReviewPreview(structuredClone(inputs));

  assert.equal(first.status, "platform_text_creator_saved_drafts_human_review_pending");
  assert.equal(first.draftSaveReviewPreviewFingerprint, repeat.draftSaveReviewPreviewFingerprint);
  assert.equal(first.targetCount, 2);
  assert.deepEqual(first.reviewTargets.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(first.reviewTargets.every((target) => target.reviewStatus === "human_visible_draft_review_pending"));
  assert.equal(first.requiredConfirmation, `REVIEW SAVED CREATOR DRAFTS ${first.draftSaveReviewPreviewFingerprint}`);
  assert.equal(first.eligibleForHumanVisibleDraftReview, true);
  assert.equal(first.visibleHumanDraftReviewCompleted, false);
});

test("binds each checklist to the exact account, reference, fields and assets", () => {
  const inputs = readyInputs();
  const result = buildPlatformTextCreatorDraftSaveReviewPreview(inputs);

  for (const [index, target] of result.reviewTargets.entries()) {
    const contract = inputs.authorization.executionContract.contractTargets[index];
    const saved = inputs.execution.savedTargets[index];
    assert.deepEqual(target.confirmedAccount, contract.confirmedAccount);
    assert.equal(target.draftReference, saved.draftReference);
    assert.equal(target.expectedFieldFingerprint, contract.expectedFieldFingerprint);
    assert.deepEqual(target.expectedAssetFingerprints, contract.expectedAssetFingerprints);
    assert.ok(target.requiredChecks.includes("draft_is_visible_in_creator_draft_manager"));
    assert.ok(target.requiredChecks.includes("publication_remains_untriggered"));
  }
});

test("rejects partial, published or stale executions", () => {
  const partial = readyInputs();
  partial.execution.status = "platform_text_creator_draft_save_execution_partial_failed";
  assert.deepEqual(buildPlatformTextCreatorDraftSaveReviewPreview(partial).blockers, [
    "creator_draft_save_execution_invalid_incomplete_or_tampered",
  ]);

  const published = readyInputs();
  published.execution.publishTriggered = true;
  assert.equal(buildPlatformTextCreatorDraftSaveReviewPreview(published).eligibleForHumanVisibleDraftReview, false);

  const stale = readyInputs();
  stale.execution.contractFingerprint = "f".repeat(64);
  assert.equal(buildPlatformTextCreatorDraftSaveReviewPreview(stale).status,
    "platform_text_creator_draft_save_review_preview_blocked");
});

test("rejects changed authorization bindings and reported draft contents", () => {
  const changedContract = readyInputs();
  changedContract.authorization.executionContract.contractTargets[0].expectedFieldFingerprint = "f".repeat(64);
  assert.equal(buildPlatformTextCreatorDraftSaveReviewPreview(changedContract).eligibleForHumanVisibleDraftReview, false);

  const changedResult = readyInputs();
  changedResult.execution.savedTargets[0].assetFingerprints = ["f".repeat(64)];
  assert.equal(buildPlatformTextCreatorDraftSaveReviewPreview(changedResult).targetCount, 0);

  const unsafeReference = readyInputs();
  unsafeReference.execution.savedTargets[0].draftReference = " ";
  assert.equal(buildPlatformTextCreatorDraftSaveReviewPreview(unsafeReference).status,
    "platform_text_creator_draft_save_review_preview_blocked");
});

test("supports one target and remains read-only and disconnected from browser routes", async () => {
  const result = buildPlatformTextCreatorDraftSaveReviewPreview(readyInputs(["douyin"]));
  const source = await readFile(new URL("../bridge/platform-text-creator-draft-save-review-preview.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(result.targetCount, 1);
  assert.equal(result.draftReviewAccepted, false);
  assert.equal(result.browserInteractionPerformedByPreview, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.draftSaveTriggeredByPreview, false);
  assert.equal(result.draftSavedByPreview, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("puppeteer"), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-draft-save-review-preview")));
});
