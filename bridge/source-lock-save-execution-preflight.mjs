import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TICKET_VALIDITY_MS = 5 * 60_000;
const EXPECTED_CONSTRAINTS = Object.freeze({
  singleUse: true,
  exactSavePlanFingerprintRequired: true,
  explicitExecuteRequestRequired: true,
  executionPreflightRequired: true,
  liveDatabaseBindingRequired: true,
  databaseWriteAllowed: false,
  draftUnlockAllowed: false,
  publishAllowed: false,
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeTimestamp(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function validTarget(target, ticket) {
  return typeof target?.leadId === "string"
    && Boolean(target.leadId.trim())
    && target.leadId.length <= 200
    && typeof target?.title === "string"
    && Boolean(target.title.trim())
    && target.title.length <= 500
    && target?.reviewFingerprint === ticket.sourceReviewFingerprint
    && target?.savePlanFingerprint === ticket.sourceSavePlanFingerprint
    && target?.evidenceCount === 2
    && JSON.stringify(target?.evidenceRoles) === JSON.stringify(["independent", "original"])
    && target?.operation === "persist_one_reviewed_source_lock_after_single_use_authorization"
    && target?.targetStatus === "preview_only_not_authorized"
    && target?.requiresExactSavePlanFingerprint === true
    && target?.writeAllowed === false;
}

function validAuthorization(value) {
  const ticket = value?.authorizationTicket;
  const issuedAt = safeTimestamp(ticket?.issuedAt);
  const expiresAt = safeTimestamp(ticket?.expiresAt);
  if (
    value?.status !== "source_lock_save_authorization_accepted"
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || value?.eligible !== true
    || value?.authorizationAccepted !== true
    || !HASH.test(value?.authorizedPreviewFingerprint ?? "")
    || value?.sourceLockSaveAuthorizationGranted !== true
    || value?.singleUseAuthorization !== true
    || value?.ticketConsumed !== false
    || value?.ticketRevoked !== false
    || value?.executionPreflightRequired !== true
    || value?.executionEligible !== false
    || value?.liveSaveRouteConnected !== false
    || value?.writeAllowedByContract !== false
    || value?.databaseWriteAttempted !== false
    || value?.databaseWrites !== false
    || value?.persisted !== false
    || value?.sourceLocksCreated !== 0
    || value?.draftsUnlocked !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
    || ticket?.status !== "authorized_pending_execution_preflight"
    || !HASH.test(ticket?.ticketFingerprint ?? "")
    || ticket?.authorizationPreviewFingerprint !== value.authorizedPreviewFingerprint
    || !HASH.test(ticket?.sourceSavePlanFingerprint ?? "")
    || !HASH.test(ticket?.sourceReviewFingerprint ?? "")
    || issuedAt === null
    || expiresAt === null
    || expiresAt - issuedAt !== TICKET_VALIDITY_MS
    || JSON.stringify(ticket?.constraints) !== JSON.stringify(EXPECTED_CONSTRAINTS)
    || !validTarget(ticket?.saveTarget, ticket)
  ) return null;

  const ticketPayload = {
    authorizationPreviewFingerprint: ticket.authorizationPreviewFingerprint,
    sourceSavePlanFingerprint: ticket.sourceSavePlanFingerprint,
    sourceReviewFingerprint: ticket.sourceReviewFingerprint,
    saveTarget: ticket.saveTarget,
    issuedAt: ticket.issuedAt,
    expiresAt: ticket.expiresAt,
    constraints: ticket.constraints,
  };
  return hash(ticketPayload) === ticket.ticketFingerprint ? { expiresAt, issuedAt, ticket } : null;
}

function safeResult(fields = {}) {
  return {
    status: "source_lock_save_execution_preflight_blocked",
    blockers: [],
    checkedAt: null,
    sourceAuthorizationPreviewFingerprint: null,
    sourceAuthorizationTicketFingerprint: null,
    sourceSavePlanFingerprint: null,
    authorizationIssuedAt: null,
    authorizationExpiresAt: null,
    millisecondsUntilExpiry: 0,
    storageStatus: "unknown",
    targetBinding: null,
    writerAdapterPresent: false,
    liveSaveRouteConnected: false,
    remainingTicketUses: 0,
    authorizationWindowValid: false,
    eligibleForExplicitExecutionAuthorization: false,
    executionAuthorizationGranted: false,
    readyForSingleSaveInvocation: false,
    authorizationTicketConsumed: false,
    databaseBindingRead: false,
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

export function preflightSourceLockSaveExecution({
  authorization,
  preflightRequested = false,
  checkedAt = null,
  observedTicketConsumptionCount = 0,
  storageStatus = "unknown",
  targetBinding = null,
  writerAdapterPresent = false,
  liveSaveRouteConnected = false,
} = {}) {
  const blockers = [];
  const validated = validAuthorization(authorization);
  if (!validated) blockers.push("source_lock_save_authorization_invalid_or_tampered");
  if (preflightRequested !== true) blockers.push("source_lock_save_execution_preflight_not_requested");
  const checkedTimestamp = safeTimestamp(checkedAt);
  if (checkedTimestamp === null) blockers.push("source_lock_save_execution_preflight_timestamp_invalid");
  if (!Number.isInteger(observedTicketConsumptionCount) || observedTicketConsumptionCount < 0) {
    blockers.push("source_lock_save_ticket_consumption_count_invalid");
  } else if (observedTicketConsumptionCount !== 0) {
    blockers.push("source_lock_save_authorization_ticket_already_consumed");
  }
  if (storageStatus !== "verified") blockers.push("source_lock_storage_not_verified");
  if (targetBinding !== "DB") blockers.push("source_lock_target_binding_mismatch");
  if (writerAdapterPresent !== true) blockers.push("source_lock_writer_adapter_missing");
  if (liveSaveRouteConnected !== true) blockers.push("source_lock_live_save_route_not_connected");
  if (validated && checkedTimestamp !== null) {
    if (checkedTimestamp < validated.issuedAt) blockers.push("source_lock_save_authorization_not_yet_valid");
    if (checkedTimestamp >= validated.expiresAt) blockers.push("source_lock_save_authorization_expired");
  }
  if (blockers.length || !validated || checkedTimestamp === null) {
    return safeResult({
      blockers: [...new Set(blockers)],
      checkedAt: checkedTimestamp === null ? null : checkedAt,
      storageStatus,
      targetBinding,
      writerAdapterPresent: writerAdapterPresent === true,
      liveSaveRouteConnected: liveSaveRouteConnected === true,
    });
  }

  return safeResult({
    status: "source_lock_save_execution_preflight_ready",
    checkedAt,
    sourceAuthorizationPreviewFingerprint: authorization.authorizedPreviewFingerprint,
    sourceAuthorizationTicketFingerprint: validated.ticket.ticketFingerprint,
    sourceSavePlanFingerprint: validated.ticket.sourceSavePlanFingerprint,
    authorizationIssuedAt: validated.ticket.issuedAt,
    authorizationExpiresAt: validated.ticket.expiresAt,
    millisecondsUntilExpiry: validated.expiresAt - checkedTimestamp,
    storageStatus,
    targetBinding,
    writerAdapterPresent: true,
    liveSaveRouteConnected: true,
    remainingTicketUses: 1,
    authorizationWindowValid: true,
    eligibleForExplicitExecutionAuthorization: true,
  });
}
