import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const EVIDENCE_ROLES = new Set(["original", "independent"]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validText(value, maximum = 10_000) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validSource(source) {
  return validText(source?.evidenceId, 200)
    && validText(source?.sourceId, 200)
    && validText(source?.sourceName, 200)
    && validText(source?.title, 500)
    && validHttpsUrl(source?.canonicalUrl)
    && EVIDENCE_ROLES.has(source?.evidenceRole)
    && (source?.publishedAt == null || Number.isFinite(Date.parse(source.publishedAt)));
}

function safeSavePlan(value) {
  if (
    value?.status !== "source_lock_save_plan_ready"
    || value?.readyForAuthorizationRequest !== true
    || !Array.isArray(value?.blockers)
    || value.blockers.length !== 0
    || !HASH.test(value?.reviewFingerprint ?? "")
    || !HASH.test(value?.savePlanFingerprint ?? "")
    || value?.plannedRecordCount !== 1
    || !Array.isArray(value?.plannedLocks)
    || value.plannedLocks.length !== value.plannedRecordCount
    || value?.authorizationRequired !== true
    || value?.authorizationGranted !== false
    || value?.singleUseAuthorizationRequired !== true
    || value?.writeAllowed !== false
    || value?.persisted !== false
    || value?.sourceLocksCreated !== 0
    || value?.factsVerified !== false
    || value?.draftsUnlocked !== 0
    || value?.databaseWrites !== false
    || value?.publishTriggered !== false
  ) return null;

  const lock = value.plannedLocks[0];
  const roles = new Set(lock?.sources?.map(({ evidenceRole }) => evidenceRole));
  if (
    !validText(lock?.leadId, 200)
    || !validText(lock?.title, 500)
    || lock?.reviewFingerprint !== value.reviewFingerprint
    || lock?.claimCount !== 0
    || lock?.factsVerified !== false
    || lock?.status !== "planned_not_saved"
    || !Array.isArray(lock?.sources)
    || lock.sources.length !== 2
    || roles.size !== 2
    || [...roles].some((role) => !EVIDENCE_ROLES.has(role))
    || lock.sources.some((source) => !validSource(source))
  ) return null;

  const expectedFingerprint = hash({
    reviewFingerprint: value.reviewFingerprint,
    locks: value.plannedLocks,
  });
  return expectedFingerprint === value.savePlanFingerprint ? lock : null;
}

function safeResult(fields = {}) {
  return {
    status: "source_lock_save_authorization_preview_blocked",
    blockers: [],
    sourceSavePlanFingerprint: null,
    sourceReviewFingerprint: null,
    authorizationPreviewFingerprint: null,
    requiredConfirmation: null,
    saveTarget: null,
    eligibleForExplicitSourceLockSaveAuthorization: false,
    singleUseAuthorizationRequired: true,
    sourceLockSaveAuthorizationGranted: false,
    liveSaveRouteConnected: false,
    writeAllowed: false,
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

export function buildSourceLockSaveAuthorizationPreview(savePlan) {
  const lock = safeSavePlan(savePlan);
  if (!lock) {
    return safeResult({ blockers: ["source_lock_save_plan_invalid_or_tampered"] });
  }

  const saveTarget = {
    leadId: lock.leadId,
    title: lock.title,
    reviewFingerprint: savePlan.reviewFingerprint,
    savePlanFingerprint: savePlan.savePlanFingerprint,
    evidenceCount: lock.sources.length,
    evidenceRoles: lock.sources.map(({ evidenceRole }) => evidenceRole).sort(),
    operation: "persist_one_reviewed_source_lock_after_single_use_authorization",
    targetStatus: "preview_only_not_authorized",
    requiresExactSavePlanFingerprint: true,
    writeAllowed: false,
  };
  const fingerprintPayload = {
    sourceSavePlanFingerprint: savePlan.savePlanFingerprint,
    sourceReviewFingerprint: savePlan.reviewFingerprint,
    saveTarget,
  };
  const authorizationPreviewFingerprint = hash(fingerprintPayload);
  return safeResult({
    status: "source_lock_save_authorization_preview_ready",
    ...fingerprintPayload,
    authorizationPreviewFingerprint,
    requiredConfirmation: `AUTHORIZE REVIEWED SOURCE LOCK SAVE ${authorizationPreviewFingerprint}`,
    eligibleForExplicitSourceLockSaveAuthorization: true,
  });
}
