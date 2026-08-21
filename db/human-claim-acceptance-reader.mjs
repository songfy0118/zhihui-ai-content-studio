import { createHash } from "node:crypto";

import { HUMAN_CLAIM_ACCEPTANCE_CHECKS } from "../bridge/human-claim-acceptance-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ROLES = new Set(["original", "independent"]);

export const READ_HUMAN_CLAIM_ACCEPTANCE_SQL = `SELECT
  r.id AS receipt_id,
  r.claim_selection_fingerprint,
  r.acceptance_fingerprint,
  r.idempotency_key,
  r.status AS receipt_status,
  r.created_at AS receipt_created_at,
  i.claim_id,
  i.proposed_claim,
  i.review_note,
  i.acceptance_checks_json,
  i.created_at AS claim_created_at,
  s.candidate_id,
  s.evidence_id,
  s.source_id,
  s.evidence_role,
  s.canonical_url,
  s.source_sentence,
  s.created_at AS source_created_at
FROM human_claim_acceptance_receipts r
LEFT JOIN human_claim_acceptance_items i ON i.receipt_id = r.id
LEFT JOIN human_claim_acceptance_sources s
  ON s.receipt_id = r.id AND s.claim_id = i.claim_id
WHERE r.acceptance_fingerprint = ?
ORDER BY i.claim_id, s.evidence_role`;

function safeResult(fields = {}) {
  return {
    status: "human_claim_acceptance_read_blocked",
    blockers: [],
    found: false,
    receipt: null,
    readFingerprint: null,
    humanAcceptedClaims: 0,
    durableHumanAcceptance: false,
    draftResearchInputReady: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    factsVerified: false,
    readyForCopyGeneration: false,
    draftGenerated: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseChecks(value) {
  try {
    const checks = JSON.parse(value);
    return HUMAN_CLAIM_ACCEPTANCE_CHECKS.every((check) => checks?.[check] === true)
      ? Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, true]))
      : null;
  } catch {
    return null;
  }
}

function mapReceipt(rows, expectedFingerprint) {
  const first = rows[0];
  const common = [
    "receipt_id", "claim_selection_fingerprint", "acceptance_fingerprint",
    "idempotency_key", "receipt_status", "receipt_created_at",
  ];
  if (rows.some((row) => common.some((field) => row?.[field] !== first?.[field]))) {
    return { blocker: "human_claim_acceptance_receipt_rows_inconsistent" };
  }
  if (
    first?.receipt_id !== `hcap_${expectedFingerprint}`
    || first?.acceptance_fingerprint !== expectedFingerprint
    || first?.idempotency_key !== `human-claim-acceptance:${expectedFingerprint}`
    || first?.receipt_status !== "active"
    || !HASH.test(first?.claim_selection_fingerprint ?? "")
    || !text(first?.receipt_created_at)
  ) return { blocker: "human_claim_acceptance_receipt_invalid" };

  const claimRows = new Map();
  for (const row of rows) {
    if (!HASH.test(row?.claim_id ?? "")) return { blocker: "human_claim_acceptance_claim_invalid" };
    const group = claimRows.get(row.claim_id) ?? [];
    group.push(row);
    claimRows.set(row.claim_id, group);
  }
  if (claimRows.size === 0 || claimRows.size > 8) return { blocker: "human_claim_acceptance_claim_count_invalid" };

  const claims = [];
  for (const [claimId, grouped] of claimRows) {
    if (grouped.length !== 2) return { blocker: `human_claim_acceptance_source_count_invalid:${claimId}` };
    const claimFirst = grouped[0];
    const claimFields = ["proposed_claim", "review_note", "acceptance_checks_json", "claim_created_at"];
    if (grouped.some((row) => claimFields.some((field) => row?.[field] !== claimFirst?.[field]))) {
      return { blocker: `human_claim_acceptance_claim_rows_inconsistent:${claimId}` };
    }
    const proposedClaim = text(claimFirst.proposed_claim);
    const reviewNote = text(claimFirst.review_note);
    const acceptanceChecks = parseChecks(claimFirst.acceptance_checks_json);
    if (!proposedClaim || !reviewNote || !acceptanceChecks || !text(claimFirst.claim_created_at)) {
      return { blocker: `human_claim_acceptance_claim_invalid:${claimId}` };
    }

    const roles = new Set();
    const sources = [];
    for (const row of grouped) {
      const evidenceRole = text(row.evidence_role);
      const canonicalUrl = publicUrl(row.canonical_url);
      if (!REQUIRED_ROLES.has(evidenceRole) || roles.has(evidenceRole)) {
        return { blocker: `human_claim_acceptance_source_role_invalid:${claimId}` };
      }
      if (
        !HASH.test(row?.candidate_id ?? "")
        || !text(row.evidence_id)
        || !text(row.source_id)
        || !canonicalUrl
        || !text(row.source_sentence)
        || !text(row.source_created_at)
      ) return { blocker: `human_claim_acceptance_source_invalid:${claimId}` };
      roles.add(evidenceRole);
      sources.push({
        candidateId: row.candidate_id,
        evidenceId: row.evidence_id.trim(),
        sourceId: row.source_id.trim(),
        evidenceRole,
        canonicalUrl,
        sourceSentence: row.source_sentence.trim(),
        createdAt: row.source_created_at.trim(),
      });
    }
    if ([...REQUIRED_ROLES].some((role) => !roles.has(role))) {
      return { blocker: `human_claim_acceptance_source_roles_incomplete:${claimId}` };
    }
    claims.push({
      claimId,
      proposedClaim,
      reviewNote,
      acceptanceChecks,
      status: "human_accepted_persisted",
      createdAt: claimFirst.claim_created_at.trim(),
      sources,
    });
  }

  return {
    receipt: {
      receiptId: first.receipt_id,
      claimSelectionFingerprint: first.claim_selection_fingerprint,
      acceptanceFingerprint: first.acceptance_fingerprint,
      idempotencyKey: first.idempotency_key,
      status: first.receipt_status,
      createdAt: first.receipt_created_at.trim(),
      claims,
    },
  };
}

export function createHumanClaimAcceptanceReader(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async readByAcceptanceFingerprint(acceptanceFingerprint) {
      if (!HASH.test(acceptanceFingerprint ?? "")) {
        return safeResult({ blockers: ["human_claim_acceptance_fingerprint_invalid"] });
      }

      let queryResult;
      try {
        queryResult = await d1.prepare(READ_HUMAN_CLAIM_ACCEPTANCE_SQL).bind(acceptanceFingerprint).all();
      } catch {
        return safeResult({
          status: "human_claim_acceptance_read_failed",
          blockers: ["human_claim_acceptance_query_failed"],
          databaseReadAttempted: true,
        });
      }
      const rows = Array.isArray(queryResult?.results) ? queryResult.results : [];
      if (rows.length === 0) {
        return safeResult({
          status: "human_claim_acceptance_not_found",
          blockers: ["human_claim_acceptance_not_found"],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }

      const mapped = mapReceipt(rows, acceptanceFingerprint);
      if (!mapped.receipt) {
        return safeResult({
          blockers: [mapped.blocker],
          databaseReadAttempted: true,
          databaseReads: 1,
        });
      }
      const readFingerprint = createHash("sha256").update(JSON.stringify(mapped.receipt)).digest("hex");
      return safeResult({
        status: "human_claim_acceptance_read_ready",
        blockers: [],
        found: true,
        receipt: mapped.receipt,
        readFingerprint,
        humanAcceptedClaims: mapped.receipt.claims.length,
        durableHumanAcceptance: true,
        draftResearchInputReady: true,
        databaseReadAttempted: true,
        databaseReads: 1,
      });
    },
  };
}
