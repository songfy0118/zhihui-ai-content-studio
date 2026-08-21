import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const EVIDENCE_ROLES = new Set(["original", "independent"]);

export const SOURCE_LOCK_SAVE_CONFIRMATION = "SAVE_REVIEWED_SOURCE_LOCK";

export const INSPECT_SOURCE_LOCK_SQL = `SELECT
  sl.id,
  sl.review_fingerprint,
  sl.save_plan_fingerprint,
  sl.status,
  COUNT(sle.evidence_id) AS evidence_count,
  COUNT(DISTINCT sle.evidence_role) AS evidence_role_count
FROM source_locks sl
LEFT JOIN source_lock_evidence sle ON sle.source_lock_id = sl.id
WHERE sl.save_plan_fingerprint = ?
GROUP BY sl.id, sl.review_fingerprint, sl.save_plan_fingerprint, sl.status`;

export const INSERT_SOURCE_LOCK_SQL = `INSERT INTO source_locks (
  id, lead_id, title, review_fingerprint, save_plan_fingerprint, status, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`;

export const INSERT_SOURCE_LOCK_EVIDENCE_SQL = `INSERT INTO source_lock_evidence (
  source_lock_id, evidence_id, source_id, source_name, title, canonical_url,
  published_at, evidence_role, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function safeResult(fields = {}) {
  return {
    persisted: false,
    alreadyPersisted: false,
    sourceLocksCreated: 0,
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
    externalCalls: false,
    draftsUnlocked: 0,
    publishTriggered: false,
    ...fields,
  };
}

function validText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validatePlannedLock(lock, plan) {
  if (!validText(lock?.leadId) || !validText(lock?.title)) return false;
  if (lock?.reviewFingerprint !== plan.reviewFingerprint) return false;
  if (!Array.isArray(lock?.sources) || lock.sources.length !== 2) return false;
  const roles = new Set();
  for (const source of lock.sources) {
    if (!validText(source?.evidenceId) || !validText(source?.sourceId) || !validText(source?.sourceName) || !validText(source?.title) || !validText(source?.canonicalUrl)) return false;
    if (!EVIDENCE_ROLES.has(source.evidenceRole) || roles.has(source.evidenceRole)) return false;
    roles.add(source.evidenceRole);
  }
  return roles.size === EVIDENCE_ROLES.size;
}

export function assessSourceLockSaveRequest({
  plan,
  executeRequested = false,
  confirmation = null,
  authorizedSavePlanFingerprint = null,
} = {}) {
  const blockers = [];
  if (plan?.status !== "source_lock_save_plan_ready" || plan?.readyForAuthorizationRequest !== true) blockers.push("source_lock_save_plan_not_ready");
  if (!HASH.test(plan?.reviewFingerprint ?? "") || !HASH.test(plan?.savePlanFingerprint ?? "")) blockers.push("source_lock_fingerprint_invalid");
  if (executeRequested !== true) blockers.push("source_lock_save_execution_not_requested");
  if (confirmation !== SOURCE_LOCK_SAVE_CONFIRMATION) blockers.push("source_lock_save_confirmation_invalid");
  if (authorizedSavePlanFingerprint !== plan?.savePlanFingerprint) blockers.push("source_lock_save_fingerprint_mismatch");
  if (!Number.isInteger(plan?.plannedRecordCount) || plan.plannedRecordCount !== plan?.plannedLocks?.length) blockers.push("source_lock_record_count_mismatch");
  if (plan?.plannedRecordCount !== 1) blockers.push("source_lock_single_record_storage_required");
  if (!Array.isArray(plan?.plannedLocks) || plan.plannedLocks.some((lock) => !validatePlannedLock(lock, plan))) blockers.push("source_lock_record_invalid");

  return safeResult({
    status: blockers.length === 0 ? "source_lock_save_authorized" : "source_lock_save_blocked",
    eligible: blockers.length === 0,
    blockers,
    authorizedSavePlanFingerprint: blockers.length === 0 ? authorizedSavePlanFingerprint : null,
  });
}

function defaultIdFactory(lock, plan) {
  return `source-lock-${createHash("sha256").update(`${plan.savePlanFingerprint}:${lock.leadId}`).digest("hex").slice(0, 24)}`;
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("source_lock_timestamp_invalid");
  return date.toISOString();
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export function createSourceLockStore(d1, { now = () => new Date(), idFactory = defaultIdFactory } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessSourceLockSaveRequest(input);
      if (!gate.eligible) return gate;

      const { plan } = input;
      const existing = await d1.prepare(INSPECT_SOURCE_LOCK_SQL).bind(plan.savePlanFingerprint).first();
      if (existing) {
        const complete = existing.review_fingerprint === plan.reviewFingerprint
          && existing.status === "active"
          && Number(existing.evidence_count) === 2
          && Number(existing.evidence_role_count) === 2;
        if (!complete) return safeResult({ status: "source_lock_existing_record_incomplete", eligible: false, blockers: ["source_lock_existing_record_incomplete"] });
        return safeResult({ status: "source_lock_already_persisted", eligible: true, blockers: [], alreadyPersisted: true, sourceLockId: existing.id });
      }

      let timestamp;
      try {
        timestamp = timestampFrom(now);
      } catch {
        return safeResult({ status: "source_lock_save_blocked", eligible: false, blockers: ["source_lock_timestamp_invalid"] });
      }

      const statements = [];
      for (const lock of plan.plannedLocks) {
        const sourceLockId = idFactory(lock, plan);
        if (!validText(sourceLockId)) return safeResult({ status: "source_lock_save_blocked", eligible: false, blockers: ["source_lock_id_invalid"] });
        statements.push(d1.prepare(INSERT_SOURCE_LOCK_SQL).bind(
          sourceLockId,
          lock.leadId.trim(),
          lock.title.trim(),
          plan.reviewFingerprint,
          plan.savePlanFingerprint,
          timestamp,
          timestamp,
        ));
        for (const source of lock.sources) {
          statements.push(d1.prepare(INSERT_SOURCE_LOCK_EVIDENCE_SQL).bind(
            sourceLockId,
            source.evidenceId.trim(),
            source.sourceId.trim(),
            source.sourceName.trim(),
            source.title.trim(),
            source.canonicalUrl.trim(),
            source.publishedAt ?? null,
            source.evidenceRole,
            timestamp,
          ));
        }
      }

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({ status: "source_lock_atomic_batch_failed", eligible: false, blockers: ["source_lock_atomic_batch_failed"], databaseWriteAttempted: true });
      } catch {
        return safeResult({ status: "source_lock_atomic_batch_failed", eligible: false, blockers: ["source_lock_atomic_batch_failed"], databaseWriteAttempted: true });
      }

      return safeResult({
        status: "source_lock_persisted",
        eligible: true,
        blockers: [],
        persisted: true,
        sourceLocksCreated: plan.plannedRecordCount,
        databaseWriteAttempted: true,
        databaseWrites: true,
        sourceLockId: idFactory(plan.plannedLocks[0], plan),
      });
    },
  };
}
