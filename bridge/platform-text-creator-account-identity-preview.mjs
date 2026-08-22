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

function safeExecution(value) {
  if (
    value?.status !== "platform_text_creator_pages_opened_identity_pending"
    || value?.allTargetsOpened !== true
    || value?.browserOpenPerformed !== true
    || value?.accountIdentityVerificationRequired !== true
    || value?.accountIdentityVerified !== false
    || value?.loginStateRead !== false
    || value?.loginTriggered !== false
    || value?.uploadTriggered !== false
    || value?.draftSaved !== false
    || value?.databaseWrites !== false
    || value?.filesystemMutations !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
    || !HASH.test(value?.contractFingerprint ?? "")
    || !Array.isArray(value?.openedTargets)
    || value.openedTargets.length < 1
    || value.openedTargets.length > 2
    || value?.openedCount !== value.openedTargets.length
    || value?.openAttempts !== value.openedTargets.length
  ) return null;

  const seen = new Set();
  let previousPlatformRank = -1;
  for (const target of value.openedTargets) {
    const platformRank = PLATFORM_ORDER.get(target?.platform);
    if (
      !CREATOR_ORIGINS[target?.platform]
      || seen.has(target.platform)
      || platformRank <= previousPlatformRank
      || target?.status !== "opened_visible_account_identity_pending"
      || target?.accountIdentityVerificationRequired !== true
      || !sameOrigin(target?.requestedUrl, CREATOR_ORIGINS[target.platform])
      || !sameOrigin(target?.finalUrl, CREATOR_ORIGINS[target.platform])
    ) return null;
    seen.add(target.platform);
    previousPlatformRank = platformRank;
  }
  return value.openedTargets;
}

function blockedResult(blockers) {
  return {
    status: "platform_text_creator_account_identity_preview_blocked",
    eligible: false,
    blockers,
    identityPreviewFingerprint: null,
    observedAccountCount: 0,
    identityCandidates: [],
    requiresHumanConfirmation: true,
    accountIdentityObservedFromVisiblePage: false,
    accountIdentityVerified: false,
    upstreamBrowserOpenConfirmed: false,
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

export function buildPlatformTextCreatorAccountIdentityPreview(openExecution, visibleObservations) {
  const openedTargets = safeExecution(openExecution);
  if (!openedTargets) {
    return blockedResult(["platform_text_creator_open_execution_invalid_or_incomplete"]);
  }
  if (!Array.isArray(visibleObservations)) {
    return blockedResult(["visible_account_identity_observations_required"]);
  }

  const observations = new Map();
  for (const observation of visibleObservations) {
    const platform = observation?.platform;
    const expectedOrigin = CREATOR_ORIGINS[platform];
    const identityLabel = safeText(observation?.identityLabel);
    const accountHandle = observation?.accountHandle == null ? null : safeText(observation.accountHandle);
    if (
      !expectedOrigin
      || observations.has(platform)
      || observation?.observationSource !== "visible_creator_page_header"
      || observation?.visibilityConfirmed !== true
      || !sameOrigin(observation?.pageUrl, expectedOrigin)
      || !identityLabel
      || (observation?.accountHandle != null && !accountHandle)
    ) {
      return blockedResult(["visible_account_identity_observation_invalid_or_tampered"]);
    }
    observations.set(platform, {
      platform,
      pageUrl: observation.pageUrl,
      identityLabel,
      accountHandle,
      observationSource: observation.observationSource,
      visibilityConfirmed: true,
    });
  }

  const blockers = openedTargets
    .filter((target) => !observations.has(target.platform))
    .map((target) => `visible_account_identity_missing:${target.platform}`);
  if (blockers.length || observations.size !== openedTargets.length) {
    return blockedResult(blockers.length ? blockers : ["visible_account_identity_target_mismatch"]);
  }

  const identityCandidates = openedTargets.map((target) => ({
    ...observations.get(target.platform),
    confirmationStatus: "human_confirmation_pending",
    confirmationQuestion: `请确认当前可见的${target.platform === "xiaohongshu" ? "小红书" : "抖音"}账号是否为本次目标账号`,
  }));
  const fingerprintPayload = {
    contractFingerprint: openExecution.contractFingerprint,
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
    contractFingerprint: openExecution.contractFingerprint,
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
