import { createHash } from "node:crypto";

import { HUMAN_CLAIM_ACCEPTANCE_CHECKS } from "../bridge/human-claim-acceptance-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ROLES = new Set(["original", "independent"]);

export const HUMAN_CLAIM_ACCEPTANCE_SAVE_CONFIRMATION = "SAVE_HUMAN_CLAIM_ACCEPTANCE";

export const INSPECT_HUMAN_CLAIM_ACCEPTANCE_SQL = `SELECT
  r.id,
  r.claim_selection_fingerprint,
  r.acceptance_fingerprint,
  r.idempotency_key,
  r.status,
  (SELECT COUNT(*) FROM human_claim_acceptance_items i WHERE i.receipt_id = r.id) AS claim_count,
  (SELECT COUNT(*) FROM human_claim_acceptance_sources s WHERE s.receipt_id = r.id) AS source_count,
  (SELECT COUNT(DISTINCT s.evidence_role) FROM human_claim_acceptance_sources s WHERE s.receipt_id = r.id) AS source_role_count
FROM human_claim_acceptance_receipts r
WHERE r.acceptance_fingerprint = ?`;

const INSERT_RECEIPT_SQL = `INSERT INTO human_claim_acceptance_receipts (
  id, claim_selection_fingerprint, acceptance_fingerprint, idempotency_key, status, created_at
) VALUES (?, ?, ?, ?, 'active', ?)`;

const INSERT_ITEM_SQL = `INSERT INTO human_claim_acceptance_items (
  receipt_id, claim_id, proposed_claim, review_note, acceptance_checks_json, created_at
) VALUES (?, ?, ?, ?, ?, ?)`;

const INSERT_SOURCE_SQL = `INSERT INTO human_claim_acceptance_sources (
  receipt_id, claim_id, candidate_id, evidence_id, source_id, evidence_role,
  canonical_url, source_sentence, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "human_claim_acceptance_save_blocked",
    blockers: [],
    eligible: false,
    persisted: false,
    alreadyPersisted: false,
    acceptanceReceiptsCreated: 0,
    claimItemsCreated: 0,
    sourceLinksCreated: 0,
    databaseWriteAttempted: false,
    databaseWrites: false,
    atomicBatch: true,
    factsVerified: false,
    readyForCopyGeneration: false,
    draftsUnlocked: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function validatePreview(preview, blockers) {
  if (preview?.status !== "human_claim_acceptance_preview_ready" || preview?.readyForAuthorizedAcceptanceSave !== true) blockers.push("human_claim_acceptance_preview_not_ready");
  if (!HASH.test(preview?.acceptanceFingerprint ?? "")) blockers.push("human_claim_acceptance_fingerprint_invalid");
  const receipt = preview?.receiptPreview;
  const claims = receipt?.acceptedClaims;
  if (
    receipt?.receiptId !== `hcap_${preview?.acceptanceFingerprint}`
    || receipt?.status !== "preview_not_persisted"
    || !HASH.test(receipt?.claimSelectionFingerprint ?? "")
    || !Array.isArray(claims)
    || claims.length === 0
    || claims.length !== preview?.acceptedClaimCountInPreview
  ) {
    blockers.push("human_claim_acceptance_receipt_invalid");
    return;
  }
  const claimIds = new Set();
  for (const claim of claims) {
    const roles = new Set();
    if (
      !HASH.test(claim?.claimId ?? "")
      || claimIds.has(claim.claimId)
      || typeof claim?.proposedClaim !== "string"
      || typeof claim?.reviewNote !== "string"
      || claim.status !== "human_accepted_in_preview_not_persisted"
      || !Array.isArray(claim?.sources)
      || claim.sources.length !== 2
      || HUMAN_CLAIM_ACCEPTANCE_CHECKS.some((check) => claim?.acceptanceChecks?.[check] !== true)
    ) blockers.push(`human_claim_acceptance_item_invalid:${claim?.claimId ?? "missing"}`);
    claimIds.add(claim?.claimId);
    for (const source of Array.isArray(claim?.sources) ? claim.sources : []) {
      if (roles.has(source?.evidenceRole)) blockers.push(`human_claim_acceptance_source_role_duplicate:${claim?.claimId ?? "missing"}`);
      roles.add(source?.evidenceRole);
      if (
        !HASH.test(source?.candidateId ?? "")
        || typeof source?.evidenceId !== "string"
        || typeof source?.sourceId !== "string"
        || typeof source?.canonicalUrl !== "string"
        || typeof source?.sourceSentence !== "string"
      ) blockers.push(`human_claim_acceptance_source_invalid:${claim?.claimId ?? "missing"}`);
    }
    if (roles.size !== REQUIRED_ROLES.size || [...REQUIRED_ROLES].some((role) => !roles.has(role))) blockers.push(`human_claim_acceptance_source_roles_incomplete:${claim?.claimId ?? "missing"}`);
  }
  const recomputed = hash(JSON.stringify({
    claimSelectionFingerprint: receipt.claimSelectionFingerprint,
    acceptedClaims: claims,
  }));
  if (recomputed !== preview.acceptanceFingerprint) blockers.push("human_claim_acceptance_preview_tampered");
  if (preview.idempotencyKey !== `human-claim-acceptance:${preview.acceptanceFingerprint}`) blockers.push("human_claim_acceptance_idempotency_key_invalid");
}

export function assessHumanClaimAcceptanceSaveRequest({
  preview,
  executeRequested = false,
  confirmation = null,
  authorizedAcceptanceFingerprint = null,
} = {}) {
  const blockers = [];
  validatePreview(preview, blockers);
  if (executeRequested !== true) blockers.push("human_claim_acceptance_save_not_requested");
  if (confirmation !== HUMAN_CLAIM_ACCEPTANCE_SAVE_CONFIRMATION) blockers.push("human_claim_acceptance_save_confirmation_invalid");
  if (authorizedAcceptanceFingerprint !== preview?.acceptanceFingerprint) blockers.push("human_claim_acceptance_save_fingerprint_mismatch");
  return safeResult({
    status: blockers.length ? "human_claim_acceptance_save_blocked" : "human_claim_acceptance_save_authorized",
    blockers: [...new Set(blockers)],
    eligible: blockers.length === 0,
    authorizedAcceptanceFingerprint: blockers.length ? null : authorizedAcceptanceFingerprint,
  });
}

function timestampFrom(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("human_claim_acceptance_timestamp_invalid");
  return date.toISOString();
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

export function createHumanClaimAcceptanceStore(d1, { now = () => new Date() } = {}) {
  if (!d1 || typeof d1.prepare !== "function" || typeof d1.batch !== "function") throw new Error("d1_binding_required");

  return {
    async save(input = {}) {
      const gate = assessHumanClaimAcceptanceSaveRequest(input);
      if (!gate.eligible) return gate;
      const { preview } = input;
      const receipt = preview.receiptPreview;
      const existing = await d1.prepare(INSPECT_HUMAN_CLAIM_ACCEPTANCE_SQL).bind(preview.acceptanceFingerprint).first();
      if (existing) {
        const expectedClaims = receipt.acceptedClaims.length;
        const complete = existing.id === receipt.receiptId
          && existing.claim_selection_fingerprint === receipt.claimSelectionFingerprint
          && existing.idempotency_key === preview.idempotencyKey
          && existing.status === "active"
          && Number(existing.claim_count) === expectedClaims
          && Number(existing.source_count) === expectedClaims * 2
          && Number(existing.source_role_count) === 2;
        if (!complete) return safeResult({ status: "human_claim_acceptance_existing_record_incomplete", blockers: ["human_claim_acceptance_existing_record_incomplete"] });
        return safeResult({
          status: "human_claim_acceptance_already_persisted",
          eligible: true,
          alreadyPersisted: true,
          receiptId: existing.id,
        });
      }

      let timestamp;
      try {
        timestamp = timestampFrom(now);
      } catch {
        return safeResult({ blockers: ["human_claim_acceptance_timestamp_invalid"] });
      }
      const statements = [d1.prepare(INSERT_RECEIPT_SQL).bind(
        receipt.receiptId,
        receipt.claimSelectionFingerprint,
        preview.acceptanceFingerprint,
        preview.idempotencyKey,
        timestamp,
      )];
      for (const claim of receipt.acceptedClaims) {
        statements.push(d1.prepare(INSERT_ITEM_SQL).bind(
          receipt.receiptId,
          claim.claimId,
          claim.proposedClaim,
          claim.reviewNote,
          JSON.stringify(claim.acceptanceChecks),
          timestamp,
        ));
        for (const source of claim.sources) {
          statements.push(d1.prepare(INSERT_SOURCE_SQL).bind(
            receipt.receiptId,
            claim.claimId,
            source.candidateId,
            source.evidenceId,
            source.sourceId,
            source.evidenceRole,
            source.canonicalUrl,
            source.sourceSentence,
            timestamp,
          ));
        }
      }

      try {
        const results = await d1.batch(statements);
        const succeeded = Array.isArray(results)
          && results.length === statements.length
          && results.every((result) => result?.success === true && changes(result) === 1);
        if (!succeeded) return safeResult({ status: "human_claim_acceptance_atomic_batch_failed", blockers: ["human_claim_acceptance_atomic_batch_failed"], databaseWriteAttempted: true });
      } catch {
        return safeResult({ status: "human_claim_acceptance_atomic_batch_failed", blockers: ["human_claim_acceptance_atomic_batch_failed"], databaseWriteAttempted: true });
      }

      return safeResult({
        status: "human_claim_acceptance_persisted",
        eligible: true,
        persisted: true,
        receiptId: receipt.receiptId,
        acceptanceReceiptsCreated: 1,
        claimItemsCreated: receipt.acceptedClaims.length,
        sourceLinksCreated: receipt.acceptedClaims.length * 2,
        databaseWriteAttempted: true,
        databaseWrites: true,
      });
    },
  };
}
