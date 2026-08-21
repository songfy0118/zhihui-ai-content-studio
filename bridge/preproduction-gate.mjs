import { REQUIRED_SCRIPT_REVIEW_CHECKS } from "./script-review-draft.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function assessPreproductionGate({ artifact = {}, sourceLockFingerprint = null, reviewRecord = null } = {}) {
  const outputFingerprint = normalizeText(artifact.outputFingerprint) || null;
  const artifactSourceLockFingerprint = normalizeText(artifact.sourceLockFingerprint) || null;
  const plannedSourceLockFingerprint = normalizeText(sourceLockFingerprint) || null;
  const durableSourceLockBinding = Boolean(
    reviewRecord?.persisted === true
    && reviewRecord?.status === "accepted"
    && normalizeText(reviewRecord.outputFingerprint) === outputFingerprint
    && normalizeText(reviewRecord.sourceLockFingerprint) === plannedSourceLockFingerprint,
  );
  const blockers = [];

  if (artifact.scriptOutputPresent !== true) blockers.push("script_output_missing");
  if (!outputFingerprint) blockers.push("script_output_fingerprint_missing");
  if (!plannedSourceLockFingerprint) blockers.push("source_lock_fingerprint_missing");
  if ((artifact.sourceLockProvenancePresent !== true || !artifactSourceLockFingerprint) && !durableSourceLockBinding) {
    blockers.push("source_lock_provenance_missing");
  } else if (plannedSourceLockFingerprint && artifactSourceLockFingerprint !== plannedSourceLockFingerprint) {
    blockers.push("source_lock_fingerprint_mismatch");
  }

  if (!reviewRecord) {
    blockers.push("review_record_missing");
  } else {
    if (reviewRecord.persisted !== true) blockers.push("review_not_persisted");
    if (reviewRecord.status !== "accepted") blockers.push("review_status_not_accepted");
    if (normalizeText(reviewRecord.outputFingerprint) !== outputFingerprint) blockers.push("review_output_fingerprint_mismatch");
    if (normalizeText(reviewRecord.sourceLockFingerprint) !== plannedSourceLockFingerprint) blockers.push("review_source_lock_fingerprint_mismatch");
    if (!REQUIRED_SCRIPT_REVIEW_CHECKS.every((id) => reviewRecord.checks?.[id] === true)) blockers.push("review_checks_incomplete");
  }

  const ready = blockers.length === 0;
  return {
    status: ready ? "ready_for_character_storyboard_plan" : "blocked",
    ready,
    blockers,
    outputFingerprint,
    plannedSourceLockFingerprint,
    sourceLockBound: durableSourceLockBinding || Boolean(
      artifact.sourceLockProvenancePresent === true
      && artifactSourceLockFingerprint
      && artifactSourceLockFingerprint === plannedSourceLockFingerprint,
    ),
    persistedReviewAccepted: durableSourceLockBinding,
    planningAllowed: ready,
    authorizationRequired: true,
    runtimeVerification: "not_run",
    executionAllowed: false,
    characterGenerationTriggered: false,
    storyboardGenerationTriggered: false,
    localMiniDramaCalls: 0,
    lumenXCalls: 0,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}
