import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessPlatformTextCreatorAccountConfirmation } from "../bridge/platform-text-creator-account-confirmation-gate.mjs";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readyPreview() {
  const contractFingerprint = "a".repeat(64);
  const identityCandidates = [
    {
      platform: "xiaohongshu",
      pageUrl: "https://creator.xiaohongshu.com/publish/publish?target=note",
      identityLabel: "测试小红书账号",
      accountHandle: "redacted-xhs-id",
      observationSource: "visible_creator_page_header",
      visibilityConfirmed: true,
      confirmationStatus: "human_confirmation_pending",
      confirmationQuestion: "请确认当前可见的小红书账号是否为本次目标账号",
    },
    {
      platform: "douyin",
      pageUrl: "https://creator.douyin.com/creator-micro/content/upload",
      identityLabel: "测试抖音账号",
      accountHandle: null,
      observationSource: "visible_creator_page_header",
      visibilityConfirmed: true,
      confirmationStatus: "human_confirmation_pending",
      confirmationQuestion: "请确认当前可见的抖音账号是否为本次目标账号",
    },
  ];
  const fingerprintPayload = {
    contractFingerprint,
    identityCandidates: identityCandidates.map((candidate) => ({
      platform: candidate.platform,
      pageUrl: candidate.pageUrl,
      identityLabel: candidate.identityLabel,
      accountHandle: candidate.accountHandle,
      observationSource: candidate.observationSource,
      visibilityConfirmed: candidate.visibilityConfirmed,
      confirmationStatus: candidate.confirmationStatus,
    })),
  };
  return {
    status: "platform_text_creator_account_identity_confirmation_pending",
    eligible: true,
    blockers: [],
    contractFingerprint,
    identityPreviewFingerprint: hash(fingerprintPayload),
    observedAccountCount: identityCandidates.length,
    identityCandidates,
    requiresHumanConfirmation: true,
    accountIdentityObservedFromVisiblePage: true,
    accountIdentityVerified: false,
    upstreamBrowserOpenConfirmed: true,
    browserOpenPerformedByPreview: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
  };
}

function confirmations(preview) {
  return preview.identityCandidates.map((candidate) => ({
    platform: candidate.platform,
    pageUrl: candidate.pageUrl,
    identityLabel: candidate.identityLabel,
    accountHandle: candidate.accountHandle,
    decision: "confirmed_current_target_account",
    confirmationSource: "human_visible_page_review",
  }));
}

function confirm(preview, overrides = {}) {
  return assessPlatformTextCreatorAccountConfirmation({
    preview,
    confirmationRequested: true,
    confirmedIdentityPreviewFingerprint: preview.identityPreviewFingerprint,
    accountConfirmations: confirmations(preview),
    ...overrides,
  });
}

test("accepts exact per-platform human account confirmations deterministically", () => {
  const preview = readyPreview();
  const first = confirm(preview);
  const repeat = confirm(structuredClone(preview));

  assert.equal(first.status, "platform_text_creator_account_confirmation_accepted");
  assert.equal(first.eligible, true);
  assert.equal(first.accountIdentityVerified, true);
  assert.equal(first.confirmedAccountCount, 2);
  assert.equal(first.identityConfirmationFingerprint, repeat.identityConfirmationFingerprint);
  assert.deepEqual(first.confirmedAccounts.map(({ platform }) => platform), ["xiaohongshu", "douyin"]);
  assert.equal(first.draftFormFillAuthorizationEligible, true);
});

test("blocks missing intent, stale preview fingerprints and incomplete confirmations", () => {
  const preview = readyPreview();
  const missingIntent = confirm(preview, { confirmationRequested: false });
  const stale = confirm(preview, { confirmedIdentityPreviewFingerprint: "f".repeat(64) });
  const incomplete = confirm(preview, { accountConfirmations: confirmations(preview).slice(0, 1) });

  assert.ok(missingIntent.blockers.includes("creator_account_confirmation_not_requested"));
  assert.ok(stale.blockers.includes("creator_account_identity_preview_fingerprint_mismatch"));
  assert.ok(incomplete.blockers.includes("creator_account_confirmation_incomplete_or_mismatched"));
  assert.equal(missingIntent.accountIdentityVerified, false);
  assert.equal(stale.draftFormFillAuthorizationEligible, false);
});

test("rejects mismatched labels and a tampered preview", () => {
  const preview = readyPreview();
  const mismatched = confirmations(preview);
  mismatched[0].identityLabel = "另一个账号";
  const wrongAccount = confirm(preview, { accountConfirmations: mismatched });
  assert.ok(wrongAccount.blockers.includes("creator_account_confirmation_incomplete_or_mismatched"));

  const tamperedPreview = readyPreview();
  tamperedPreview.identityCandidates[0].pageUrl = "https://example.invalid/fake";
  const tampered = confirm(tamperedPreview);
  assert.ok(tampered.blockers.includes("platform_text_creator_account_identity_preview_invalid_or_tampered"));
  assert.equal(tampered.accountIdentityVerified, false);
});

test("supports one explicitly confirmed Douyin target", () => {
  const preview = readyPreview();
  preview.identityCandidates = preview.identityCandidates.slice(1);
  preview.observedAccountCount = 1;
  preview.identityPreviewFingerprint = hash({
    contractFingerprint: preview.contractFingerprint,
    identityCandidates: preview.identityCandidates.map((candidate) => ({
      platform: candidate.platform,
      pageUrl: candidate.pageUrl,
      identityLabel: candidate.identityLabel,
      accountHandle: candidate.accountHandle,
      observationSource: candidate.observationSource,
      visibilityConfirmed: candidate.visibilityConfirmed,
      confirmationStatus: candidate.confirmationStatus,
    })),
  });
  const result = confirm(preview);

  assert.equal(result.eligible, true);
  assert.equal(result.confirmedAccountCount, 1);
  assert.equal(result.confirmedAccounts[0].platform, "douyin");
});

test("does not open pages, read login state, upload, save, publish or connect routes", async () => {
  const result = confirm(readyPreview());
  const source = await readFile(new URL("../bridge/platform-text-creator-account-confirmation-gate.mjs", import.meta.url), "utf8");
  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(source.includes("fetch("), false);
  assert.ok(routes.every((content) => !content.includes("platform-text-creator-account-confirmation-gate")));
  assert.equal(result.browserOpenPerformedByGate, false);
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
