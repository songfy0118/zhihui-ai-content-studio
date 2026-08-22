import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ORIGINS = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com",
  douyin: "https://creator.douyin.com",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sameOrigin(url, expectedOrigin) {
  try {
    return new URL(url).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function safeText(value, maximumLength = 120) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function fingerprintCandidate(candidate) {
  return {
    platform: candidate.platform,
    pageUrl: candidate.pageUrl,
    identityLabel: candidate.identityLabel,
    accountHandle: candidate.accountHandle,
    observationSource: candidate.observationSource,
    visibilityConfirmed: candidate.visibilityConfirmed,
    confirmationStatus: candidate.confirmationStatus,
  };
}

function safePreview(value) {
  if (
    value?.status !== "platform_text_creator_account_identity_confirmation_pending"
    || value?.eligible !== true
    || value?.requiresHumanConfirmation !== true
    || value?.accountIdentityObservedFromVisiblePage !== true
    || value?.accountIdentityVerified !== false
    || value?.upstreamBrowserOpenConfirmed !== true
    || value?.browserOpenPerformedByPreview !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggered !== false
    || value?.draftSaved !== false
    || value?.publishTriggered !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.externalCalls !== false
    || value?.businessResult !== false
    || !HASH.test(value?.contractFingerprint ?? "")
    || !HASH.test(value?.identityPreviewFingerprint ?? "")
    || !Array.isArray(value?.identityCandidates)
    || value.identityCandidates.length < 1
    || value.identityCandidates.length > 2
    || value?.observedAccountCount !== value.identityCandidates.length
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const candidate of value.identityCandidates) {
    const platform = candidate?.platform;
    const platformRank = PLATFORM_ORDER.get(platform);
    const identityLabel = safeText(candidate?.identityLabel);
    const accountHandle = candidate?.accountHandle == null ? null : safeText(candidate.accountHandle);
    const expectedQuestion = `请确认当前可见的${platform === "xiaohongshu" ? "小红书" : "抖音"}账号是否为本次目标账号`;
    if (
      !CREATOR_ORIGINS[platform]
      || seen.has(platform)
      || platformRank <= previousPlatformRank
      || !sameOrigin(candidate?.pageUrl, CREATOR_ORIGINS[platform])
      || !identityLabel
      || identityLabel !== candidate.identityLabel
      || (candidate?.accountHandle != null && (!accountHandle || accountHandle !== candidate.accountHandle))
      || candidate?.observationSource !== "visible_creator_page_header"
      || candidate?.visibilityConfirmed !== true
      || candidate?.confirmationStatus !== "human_confirmation_pending"
      || candidate?.confirmationQuestion !== expectedQuestion
    ) return null;
    seen.add(platform);
    previousPlatformRank = platformRank;
  }

  const fingerprintPayload = {
    contractFingerprint: value.contractFingerprint,
    identityCandidates: value.identityCandidates.map(fingerprintCandidate),
  };
  return hash(fingerprintPayload) === value.identityPreviewFingerprint ? value.identityCandidates : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_creator_account_confirmation_blocked",
    eligible: false,
    blockers: [],
    confirmedIdentityPreviewFingerprint: null,
    identityConfirmationFingerprint: null,
    confirmedAccountCount: 0,
    confirmedAccounts: [],
    accountIdentityVerified: false,
    draftFormFillAuthorizationEligible: false,
    browserOpenPerformedByGate: false,
    loginStateRead: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    businessResult: false,
    ...fields,
  };
}

function safeConfirmations(candidates, confirmations) {
  if (!Array.isArray(confirmations) || confirmations.length !== candidates.length) return null;
  return candidates.map((candidate, index) => {
    const confirmation = confirmations[index];
    if (
      confirmation?.platform !== candidate.platform
      || confirmation?.pageUrl !== candidate.pageUrl
      || confirmation?.identityLabel !== candidate.identityLabel
      || (confirmation?.accountHandle ?? null) !== candidate.accountHandle
      || confirmation?.decision !== "confirmed_current_target_account"
      || confirmation?.confirmationSource !== "human_visible_page_review"
    ) return null;
    return {
      platform: candidate.platform,
      pageUrl: candidate.pageUrl,
      identityLabel: candidate.identityLabel,
      accountHandle: candidate.accountHandle,
      decision: confirmation.decision,
      confirmationSource: confirmation.confirmationSource,
      confirmationStatus: "human_confirmed",
    };
  });
}

export function assessPlatformTextCreatorAccountConfirmation({
  preview,
  confirmationRequested = false,
  confirmedIdentityPreviewFingerprint = null,
  accountConfirmations = null,
} = {}) {
  const blockers = [];
  const candidates = safePreview(preview);
  if (!candidates) blockers.push("platform_text_creator_account_identity_preview_invalid_or_tampered");
  if (confirmationRequested !== true) blockers.push("creator_account_confirmation_not_requested");
  if (confirmedIdentityPreviewFingerprint !== preview?.identityPreviewFingerprint) {
    blockers.push("creator_account_identity_preview_fingerprint_mismatch");
  }
  const confirmedAccounts = candidates ? safeConfirmations(candidates, accountConfirmations) : null;
  if (!confirmedAccounts || confirmedAccounts.some((account) => account == null)) {
    blockers.push("creator_account_confirmation_incomplete_or_mismatched");
  }
  if (blockers.length) return safeResult({ blockers: [...new Set(blockers)] });

  const confirmationPayload = {
    identityPreviewFingerprint: preview.identityPreviewFingerprint,
    confirmedAccounts,
  };
  return safeResult({
    status: "platform_text_creator_account_confirmation_accepted",
    eligible: true,
    blockers: [],
    confirmedIdentityPreviewFingerprint: preview.identityPreviewFingerprint,
    identityConfirmationFingerprint: hash(confirmationPayload),
    confirmedAccountCount: confirmedAccounts.length,
    confirmedAccounts,
    accountIdentityVerified: true,
    draftFormFillAuthorizationEligible: true,
  });
}
