import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ROLES = new Set(["original", "independent"]);

export const READ_SOURCE_LOCK_SQL = `SELECT
  sl.id,
  sl.lead_id,
  sl.title AS lock_title,
  sl.review_fingerprint,
  sl.save_plan_fingerprint,
  sl.status,
  sl.created_at,
  sl.updated_at,
  sle.evidence_id,
  sle.source_id,
  sle.source_name,
  sle.title AS evidence_title,
  sle.canonical_url,
  sle.published_at,
  sle.evidence_role
FROM source_locks sl
LEFT JOIN source_lock_evidence sle ON sle.source_lock_id = sl.id
WHERE sl.save_plan_fingerprint = ?
ORDER BY sle.evidence_role`;

function safeResult(fields = {}) {
  return {
    found: false,
    record: null,
    readFingerprint: null,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    factsVerified: false,
    draftInputReady: false,
    externalCalls: false,
    publishTriggered: false,
    ...fields,
  };
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function mapRecord(rows, expectedFingerprint) {
  if (rows.length !== 2) return { blocker: "source_lock_evidence_count_invalid" };
  const first = rows[0];
  const commonFields = ["id", "lead_id", "lock_title", "review_fingerprint", "save_plan_fingerprint", "status", "created_at", "updated_at"];
  if (rows.some((row) => commonFields.some((field) => row?.[field] !== first?.[field]))) return { blocker: "source_lock_rows_inconsistent" };
  if (!text(first.id) || !text(first.lead_id) || !text(first.lock_title) || !text(first.created_at) || !text(first.updated_at) || first.status !== "active") return { blocker: "source_lock_record_invalid" };
  if (!HASH.test(first.review_fingerprint ?? "") || first.save_plan_fingerprint !== expectedFingerprint) return { blocker: "source_lock_fingerprint_invalid" };

  const roles = new Set();
  const evidence = [];
  for (const row of rows) {
    const role = text(row.evidence_role);
    const url = publicUrl(row.canonical_url);
    if (!REQUIRED_ROLES.has(role) || roles.has(role)) return { blocker: "source_lock_evidence_role_invalid" };
    if (!text(row.evidence_id) || !text(row.source_id) || !text(row.source_name) || !text(row.evidence_title) || !url) return { blocker: "source_lock_evidence_invalid" };
    roles.add(role);
    evidence.push({
      evidenceId: row.evidence_id.trim(),
      sourceId: row.source_id.trim(),
      sourceName: row.source_name.trim(),
      title: row.evidence_title.trim(),
      canonicalUrl: url,
      publishedAt: text(row.published_at),
      evidenceRole: role,
    });
  }
  if (roles.size !== REQUIRED_ROLES.size) return { blocker: "source_lock_evidence_role_invalid" };

  return {
    record: {
      id: first.id.trim(),
      leadId: first.lead_id.trim(),
      title: first.lock_title.trim(),
      reviewFingerprint: first.review_fingerprint,
      savePlanFingerprint: first.save_plan_fingerprint,
      status: first.status,
      createdAt: first.created_at.trim(),
      updatedAt: first.updated_at.trim(),
      evidence,
    },
  };
}

export function createSourceLockReader(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async readBySavePlanFingerprint(savePlanFingerprint) {
      if (!HASH.test(savePlanFingerprint ?? "")) return safeResult({ status: "source_lock_read_blocked", blockers: ["source_lock_save_plan_fingerprint_invalid"] });

      let queryResult;
      try {
        queryResult = await d1.prepare(READ_SOURCE_LOCK_SQL).bind(savePlanFingerprint).all();
      } catch {
        return safeResult({ status: "source_lock_read_failed", blockers: ["source_lock_query_failed"], databaseReadAttempted: true });
      }
      const rows = Array.isArray(queryResult?.results) ? queryResult.results : [];
      if (rows.length === 0) return safeResult({ status: "source_lock_not_found", blockers: ["source_lock_not_found"], databaseReadAttempted: true, databaseReads: 1 });

      const mapped = mapRecord(rows, savePlanFingerprint);
      if (!mapped.record) return safeResult({ status: "source_lock_read_blocked", blockers: [mapped.blocker], databaseReadAttempted: true, databaseReads: 1 });
      const readFingerprint = createHash("sha256").update(JSON.stringify(mapped.record)).digest("hex");
      return safeResult({
        status: "source_lock_read_ready",
        blockers: [],
        found: true,
        record: mapped.record,
        readFingerprint,
        databaseReadAttempted: true,
        databaseReads: 1,
      });
    },
  };
}
