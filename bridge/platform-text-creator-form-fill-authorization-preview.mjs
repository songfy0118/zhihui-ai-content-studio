import { createHash } from "node:crypto";

import { assessPlatformTextCreatorOpenAuthorization } from "./platform-text-creator-open-authorization-gate.mjs";
import { buildPlatformTextCreatorOpenAuthorizationPreview } from "./platform-text-creator-open-authorization-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameOrigin(url, expectedOrigin) {
  try {
    return new URL(url).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function safeText(value, maximumLength = 120) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function expectedOpenAuthorization(draftPackagePlan, authorization) {
  const targets = authorization?.executionContract?.contractTargets;
  if (!Array.isArray(targets)) return null;
  const platforms = targets.map((target) => target?.platform);
  const preview = buildPlatformTextCreatorOpenAuthorizationPreview(draftPackagePlan, platforms);
  if (preview.status !== "platform_text_creator_open_authorization_preview_ready") return null;
  return assessPlatformTextCreatorOpenAuthorization({
    preview,
    executeRequested: true,
    confirmation: preview.requiredConfirmation,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
  });
}

function safeAccountConfirmation(value, contractFingerprint, targetPlatforms) {
  if (
    value?.status !== "platform_text_creator_account_confirmation_accepted"
    || value?.eligible !== true
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.sourceContractFingerprint !== contractFingerprint
    || !HASH.test(value?.confirmedIdentityPreviewFingerprint ?? "")
    || !HASH.test(value?.identityConfirmationFingerprint ?? "")
    || !Array.isArray(value?.confirmedAccounts)
    || value.confirmedAccounts.length !== targetPlatforms.length
    || value?.confirmedAccountCount !== value.confirmedAccounts.length
    || value?.accountIdentityVerified !== true
    || value?.draftFormFillAuthorizationEligible !== true
    || value?.browserOpenPerformedByGate !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggered !== false
    || value?.draftSaved !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
  ) return null;

  const accounts = [];
  for (const [index, account] of value.confirmedAccounts.entries()) {
    const platform = targetPlatforms[index];
    const identityLabel = safeText(account?.identityLabel);
    const accountHandle = account?.accountHandle == null ? null : safeText(account.accountHandle);
    if (
      account?.platform !== platform
      || !CREATOR_ORIGINS[platform]
      || !sameOrigin(account?.pageUrl, CREATOR_ORIGINS[platform])
      || !identityLabel
      || identityLabel !== account.identityLabel
      || (account?.accountHandle != null && (!accountHandle || accountHandle !== account.accountHandle))
      || account?.decision !== "confirmed_current_target_account"
      || account?.confirmationSource !== "human_visible_page_review"
      || account?.confirmationStatus !== "human_confirmed"
    ) return null;
    accounts.push(account);
  }

  const confirmationPayload = {
    sourceContractFingerprint: value.sourceContractFingerprint,
    identityPreviewFingerprint: value.confirmedIdentityPreviewFingerprint,
    confirmedAccounts: value.confirmedAccounts,
  };
  return hash(confirmationPayload) === value.identityConfirmationFingerprint ? accounts : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_form_fill_authorization_preview_blocked",
    blockers: [],
    sourceDraftPackagePlanFingerprint: null,
    sourceCreatorOpenContractFingerprint: null,
    sourceAccountConfirmationFingerprint: null,
    formFillAuthorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    fillTargets: [],
    targetCount: 0,
    reviewedAssetCount: 0,
    eligibleForExplicitFormFillAuthorization: false,
    formFillAuthorizationGranted: false,
    browserInteractionPerformed: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    formFieldsFilled: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextCreatorFormFillAuthorizationPreview({
  draftPackagePlan,
  creatorOpenAuthorization,
  accountConfirmation,
} = {}) {
  const blockers = [];
  const expectedAuthorization = expectedOpenAuthorization(draftPackagePlan, creatorOpenAuthorization);
  if (!expectedAuthorization || !same(expectedAuthorization, creatorOpenAuthorization)) {
    blockers.push("creator_open_authorization_invalid_or_stale_for_current_draft_package");
  }
  const contractFingerprint = expectedAuthorization?.executionContract?.contractFingerprint;
  const contractTargets = expectedAuthorization?.executionContract?.contractTargets ?? [];
  const targetPlatforms = contractTargets.map((target) => target.platform);
  const accounts = contractFingerprint
    ? safeAccountConfirmation(accountConfirmation, contractFingerprint, targetPlatforms)
    : null;
  if (!accounts) blockers.push("creator_account_confirmation_invalid_or_stale");
  if (blockers.length || !accounts) return safeResult({ blockers });

  const fillTargets = contractTargets.map((contractTarget, index) => {
    const item = draftPackagePlan.packageItems.find((candidate) => candidate.platform === contractTarget.platform);
    const account = accounts[index];
    return {
      platform: item.platform,
      creatorEntryUrl: item.creatorEntryUrl,
      visiblePageUrl: account.pageUrl,
      confirmedAccount: {
        identityLabel: account.identityLabel,
        accountHandle: account.accountHandle,
        identityConfirmationFingerprint: accountConfirmation.identityConfirmationFingerprint,
      },
      operation: "prefill_reviewed_creator_form_after_separate_authorization",
      exactReviewedFields: {
        contentMode: item.contentMode,
        title: item.title,
        body: item.body,
        coverText: item.coverText,
        hashtags: [...item.hashtags],
        sourceNote: item.sourceNote,
      },
      reviewedAssets: item.assets.map((asset) => ({ ...asset })),
      reviewedAssetCount: item.assetCount,
      draftFingerprint: item.draftFingerprint,
      draftReviewFingerprint: item.draftReviewFingerprint,
      visualReviewFingerprint: item.visualReviewFingerprint,
      targetStatus: "preview_only_not_authorized",
      saveDraftAllowed: false,
      publishAllowed: false,
    };
  });
  const fingerprintPayload = {
    sourceDraftPackagePlanFingerprint: draftPackagePlan.draftPackagePlanFingerprint,
    sourceCreatorOpenContractFingerprint: contractFingerprint,
    sourceAccountConfirmationFingerprint: accountConfirmation.identityConfirmationFingerprint,
    fillTargets,
  };
  const formFillAuthorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "platform_text_creator_form_fill_authorization_preview_ready",
    ...fingerprintPayload,
    formFillAuthorizationPreviewFingerprint,
    requiredConfirmation: `PREFILL REVIEWED CREATOR FORMS ${formFillAuthorizationPreviewFingerprint}`,
    targetCount: fillTargets.length,
    reviewedAssetCount: fillTargets.reduce((total, target) => total + target.reviewedAssetCount, 0),
    eligibleForExplicitFormFillAuthorization: true,
  });
}
