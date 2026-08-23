import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const DEFAULT_TTL_SECONDS = 300;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validText(value, maximum = 10_000) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function safePreview(value) {
  if (
    value?.status !== "source_lock_save_authorization_preview_ready"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.sourceSavePlanFingerprint ?? "")
    || !HASH.test(value?.sourceReviewFingerprint ?? "")
    || !HASH.test(value?.authorizationPreviewFingerprint ?? "")
    || value?.requiredConfirmation !== `AUTHORIZE REVIEWED SOURCE LOCK SAVE ${value.authorizationPreviewFingerprint}`
    || value?.eligibleForExplicitSourceLockSaveAuthorization !== true
    || value?.singleUseAuthorizationRequired !== true
    || value?.sourceLockSaveAuthorizationGranted !== false
    || value?.liveSaveRouteConnected !== false
    || value?.writeAllowed !== false
    || value?.databaseWriteAttempted !== false
    || value?.databaseWrites !== false
    || value?.persisted !== false
    || value?.sourceLocksCreated !== 0
    || value?.draftsUnlocked !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
  ) return null;

  const target = value.saveTarget;
  if (
    !validText(target?.leadId, 200)
    || !validText(target?.title, 500)
    || target?.reviewFingerprint !== value.sourceReviewFingerprint
    || target?.savePlanFingerprint !== value.sourceSavePlanFingerprint
    || target?.evidenceCount !== 2
    || JSON.stringify(target?.evidenceRoles) !== JSON.stringify(["independent", "original"])
    || target?.operation !== "persist_one_reviewed_source_lock_after_single_use_authorization"
    || target?.targetStatus !== "preview_only_not_authorized"
    || target?.requiresExactSavePlanFingerprint !== true
    || target?.writeAllowed !== false
  ) return null;

  const fingerprintPayload = {
    sourceSavePlanFingerprint: value.sourceSavePlanFingerprint,
    sourceReviewFingerprint: value.sourceReviewFingerprint,
    saveTarget: value.saveTarget,
  };
  return hash(fingerprintPayload) === value.authorizationPreviewFingerprint ? target : null;
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeResult(fields = {}) {
  return {
    status: "source_lock_save_authorization_blocked",
    blockers: [],
    eligible: false,
    authorizationAccepted: false,
    authorizedPreviewFingerprint: null,
    authorizationTicket: null,
    sourceLockSaveAuthorizationGranted: false,
    singleUseAuthorization: true,
    ticketConsumed: false,
    ticketRevoked: false,
    executionPreflightRequired: true,
    executionEligible: false,
    liveSaveRouteConnected: false,
    writeAllowedByContract: false,
    databaseWriteAttempted: false,
    databaseWrites: false,
    persisted: false,
    sourceLocksCreated: 0,
    draftsUnlocked: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function assessSourceLockSaveAuthorization({
  preview,
  authorizationRequested = false,
  confirmation = null,
  authorizedPreviewFingerprint = null,
} = {}, {
  now = () => new Date(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
} = {}) {
  const blockers = [];
  const target = safePreview(preview);
  if (!target) blockers.push("source_lock_save_authorization_preview_invalid_or_tampered");
  if (authorizationRequested !== true) blockers.push("source_lock_save_authorization_not_requested");
  if (confirmation !== preview?.requiredConfirmation) blockers.push("source_lock_save_authorization_confirmation_invalid");
  if (authorizedPreviewFingerprint !== preview?.authorizationPreviewFingerprint) {
    blockers.push("source_lock_save_authorization_preview_fingerprint_mismatch");
  }
  let issuedAt = null;
  try {
    issuedAt = timestamp(now());
  } catch {
    issuedAt = null;
  }
  if (!issuedAt || !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 900) {
    blockers.push("source_lock_save_authorization_ticket_window_invalid");
  }
  if (blockers.length || !target || !issuedAt) return safeResult({ blockers: [...new Set(blockers)] });

  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1_000).toISOString();
  const ticketPayload = {
    authorizationPreviewFingerprint: preview.authorizationPreviewFingerprint,
    sourceSavePlanFingerprint: preview.sourceSavePlanFingerprint,
    sourceReviewFingerprint: preview.sourceReviewFingerprint,
    saveTarget: { ...target, evidenceRoles: [...target.evidenceRoles] },
    issuedAt: issuedAt.toISOString(),
    expiresAt,
    constraints: {
      singleUse: true,
      exactSavePlanFingerprintRequired: true,
      explicitExecuteRequestRequired: true,
      executionPreflightRequired: true,
      liveDatabaseBindingRequired: true,
      databaseWriteAllowed: false,
      draftUnlockAllowed: false,
      publishAllowed: false,
    },
  };
  return safeResult({
    status: "source_lock_save_authorization_accepted",
    eligible: true,
    authorizationAccepted: true,
    authorizedPreviewFingerprint: preview.authorizationPreviewFingerprint,
    authorizationTicket: {
      ...ticketPayload,
      ticketFingerprint: hash(ticketPayload),
      status: "authorized_pending_execution_preflight",
    },
    sourceLockSaveAuthorizationGranted: true,
  });
}
