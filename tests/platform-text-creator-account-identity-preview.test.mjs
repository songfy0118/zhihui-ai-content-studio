import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPlatformTextCreatorAccountIdentityPreview } from "../bridge/platform-text-creator-account-identity-preview.mjs";

function readyExecution() {
  return {
    status: "platform_text_creator_pages_opened_identity_pending",
    contractFingerprint: "a".repeat(64),
    openAttempts: 2,
    openedCount: 2,
    openedTargets: [
      {
        platform: "xiaohongshu",
        requestedUrl: "https://creator.xiaohongshu.com/publish",
        finalUrl: "https://creator.xiaohongshu.com/publish/publish?target=note",
        status: "opened_visible_account_identity_pending",
        accountIdentityVerificationRequired: true,
      },
      {
        platform: "douyin",
        requestedUrl: "https://creator.douyin.com/creator-micro/content/upload",
        finalUrl: "https://creator.douyin.com/creator-micro/content/upload",
        status: "opened_visible_account_identity_pending",
        accountIdentityVerificationRequired: true,
      },
    ],
    allTargetsOpened: true,
    browserOpenPerformed: true,
    accountIdentityVerificationRequired: true,
    accountIdentityVerified: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: true,
    publishTriggered: false,
    businessResult: false,
  };
}

function observations() {
  return [
    {
      platform: "xiaohongshu",
      pageUrl: "https://creator.xiaohongshu.com/publish/publish?target=note",
      identityLabel: "测试小红书账号",
      accountHandle: "redacted-xhs-id",
      observationSource: "visible_creator_page_header",
      visibilityConfirmed: true,
    },
    {
      platform: "douyin",
      pageUrl: "https://creator.douyin.com/creator-micro/content/upload",
      identityLabel: "测试抖音账号",
      observationSource: "visible_creator_page_header",
      visibilityConfirmed: true,
    },
  ];
}

test("builds a human-confirmation preview from explicit visible-page observations", () => {
  const result = buildPlatformTextCreatorAccountIdentityPreview(readyExecution(), observations());

  assert.equal(result.status, "platform_text_creator_account_identity_confirmation_pending");
  assert.equal(result.eligible, true);
  assert.equal(result.observedAccountCount, 2);
  assert.match(result.identityPreviewFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.identityCandidates.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.ok(result.identityCandidates.every(({ confirmationStatus }) => confirmationStatus === "human_confirmation_pending"));
  assert.equal(result.accountIdentityObservedFromVisiblePage, true);
  assert.equal(result.accountIdentityVerified, false);
});

test("blocks when a visible identity observation is missing", () => {
  const result = buildPlatformTextCreatorAccountIdentityPreview(readyExecution(), observations().slice(0, 1));

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, ["visible_account_identity_missing:douyin"]);
  assert.equal(result.accountIdentityObservedFromVisiblePage, false);
});

test("supports a single selected Douyin creator page", () => {
  const execution = readyExecution();
  execution.openAttempts = 1;
  execution.openedCount = 1;
  execution.openedTargets = execution.openedTargets.slice(1);
  const result = buildPlatformTextCreatorAccountIdentityPreview(execution, observations().slice(1));

  assert.equal(result.eligible, true);
  assert.equal(result.observedAccountCount, 1);
  assert.equal(result.identityCandidates[0].platform, "douyin");
  assert.equal(result.accountIdentityVerified, false);
});

test("rejects off-origin or duplicate visible observations", () => {
  const offOrigin = observations();
  offOrigin[0].pageUrl = "https://example.invalid/fake";
  const invalidOrigin = buildPlatformTextCreatorAccountIdentityPreview(readyExecution(), offOrigin);
  assert.deepEqual(invalidOrigin.blockers, ["visible_account_identity_observation_invalid_or_tampered"]);

  const duplicate = observations();
  duplicate[1] = { ...duplicate[0] };
  const invalidDuplicate = buildPlatformTextCreatorAccountIdentityPreview(readyExecution(), duplicate);
  assert.deepEqual(invalidDuplicate.blockers, ["visible_account_identity_observation_invalid_or_tampered"]);
});

test("does not log in, save, publish or connect the preview to routes", async () => {
  const result = buildPlatformTextCreatorAccountIdentityPreview(readyExecution(), observations());
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.ok(routes.every((content) => !content.includes("platform-text-creator-account-identity-preview")));
  assert.equal(result.browserOpenPerformedByPreview, false);
  assert.equal(result.loginStateRead, false);
  assert.equal(result.loginTriggered, false);
  assert.equal(result.uploadTriggered, false);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.filesystemMutations, false);
  assert.equal(result.externalCalls, false);
  assert.equal(result.businessResult, false);
});
