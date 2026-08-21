import { createHash } from "node:crypto";

export const REQUIRED_SCRIPT_REVIEW_CHECKS = Object.freeze([
  "source_lock_bound",
  "claim_usage_mapped",
  "facts_match_source_lock",
  "no_uncited_factual_claims",
  "uncertainty_preserved",
  "source_notes_present",
  "platform_safety_checked",
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildScriptReviewDraft({ artifact = {}, sourceLockFingerprint = null } = {}) {
  const outputFingerprint = normalizeText(artifact.outputFingerprint) || null;
  const plannedSourceLockFingerprint = normalizeText(sourceLockFingerprint) || null;
  const blockers = [];
  if (!outputFingerprint) blockers.push("script_output_fingerprint_missing");
  if (!plannedSourceLockFingerprint) blockers.push("planned_source_lock_missing");
  if (!artifact.sourceLockProvenancePresent) blockers.push("source_lock_provenance_missing");
  if (artifact.sourceLockProvenancePresent && normalizeText(artifact.sourceLockFingerprint) !== plannedSourceLockFingerprint) blockers.push("source_lock_provenance_mismatch");
  const checks = REQUIRED_SCRIPT_REVIEW_CHECKS.map((id) => ({ id, confirmed: false }));
  const reviewDraftFingerprint = outputFingerprint && plannedSourceLockFingerprint
    ? createHash("sha256").update(JSON.stringify({
        outputFingerprint,
        plannedSourceLockFingerprint,
        checks: REQUIRED_SCRIPT_REVIEW_CHECKS,
      })).digest("hex")
    : null;

  return {
    status: blockers.length > 0 ? "draft_blocked" : "draft_ready",
    reviewable: Boolean(outputFingerprint && plannedSourceLockFingerprint),
    blockers,
    outputFingerprint,
    plannedSourceLockFingerprint,
    reviewDraftFingerprint,
    checks,
    confirmedChecks: 0,
    totalChecks: checks.length,
    reviewedAt: null,
    persisted: false,
    databaseWrites: false,
    semanticVerification: "not_run",
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
