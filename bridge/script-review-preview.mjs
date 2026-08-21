import { createHash } from "node:crypto";

import { REQUIRED_SCRIPT_REVIEW_CHECKS } from "./script-review-draft.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateScriptReviewPreview({ draft = {}, request = {} } = {}) {
  const blockers = [];
  const checks = request.checks && typeof request.checks === "object" && !Array.isArray(request.checks)
    ? request.checks
    : {};
  const submittedCheckIds = Object.keys(checks);
  const unexpectedChecks = submittedCheckIds.filter((id) => !REQUIRED_SCRIPT_REVIEW_CHECKS.includes(id));

  if (!normalizeText(draft.outputFingerprint)) blockers.push("current_output_fingerprint_missing");
  if (normalizeText(request.outputFingerprint) !== normalizeText(draft.outputFingerprint)) blockers.push("output_fingerprint_mismatch");
  if (normalizeText(request.plannedSourceLockFingerprint) !== normalizeText(draft.plannedSourceLockFingerprint)) blockers.push("source_lock_fingerprint_mismatch");
  if (normalizeText(request.reviewDraftFingerprint) !== normalizeText(draft.reviewDraftFingerprint)) blockers.push("review_draft_fingerprint_mismatch");
  if (unexpectedChecks.length > 0) blockers.push("unexpected_review_checks");
  if (REQUIRED_SCRIPT_REVIEW_CHECKS.some((id) => checks[id] !== true)) blockers.push("human_checks_incomplete");
  if (request.confirmCurrentFingerprints !== true) blockers.push("fingerprint_confirmation_missing");

  const previewComplete = blockers.length === 0;
  const previewFingerprint = previewComplete
    ? createHash("sha256").update(JSON.stringify({
        outputFingerprint: draft.outputFingerprint,
        plannedSourceLockFingerprint: draft.plannedSourceLockFingerprint,
        reviewDraftFingerprint: draft.reviewDraftFingerprint,
        checks: REQUIRED_SCRIPT_REVIEW_CHECKS,
      })).digest("hex")
    : null;

  return {
    status: previewComplete ? "preview_complete" : "preview_blocked",
    previewComplete,
    blockers,
    previewFingerprint,
    confirmedChecks: REQUIRED_SCRIPT_REVIEW_CHECKS.filter((id) => checks[id] === true).length,
    totalChecks: REQUIRED_SCRIPT_REVIEW_CHECKS.length,
    eligibleForAuthorizedSave: previewComplete,
    acceptanceBlockers: ["review_not_persisted", ...(draft.blockers?.includes("source_lock_provenance_missing") ? ["source_lock_provenance_missing"] : [])],
    previewOnly: true,
    acceptanceRecorded: false,
    downstreamUnlocked: false,
    persisted: false,
    databaseWrites: false,
    semanticVerification: previewComplete ? "human_attestation_preview" : "not_run",
    automatedFactVerification: false,
    scriptContentsReturned: false,
    modelCalls: 0,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}

