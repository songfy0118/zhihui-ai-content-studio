import { createHash } from "node:crypto";

import { REQUIRED_SCRIPT_REVIEW_CHECKS } from "./script-review-draft.mjs";
import { validateScriptReviewPreview } from "./script-review-preview.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildScriptReviewAcceptance({ draft = {}, request = {}, sourceIdeaId = null, dramaId = null, reviewedAt = null } = {}) {
  const preview = validateScriptReviewPreview({ draft, request });
  const blockers = [...preview.blockers];
  if (!normalizeText(sourceIdeaId)) blockers.push("source_idea_id_missing");
  if (!Number.isInteger(Number(dramaId)) || Number(dramaId) <= 0) blockers.push("drama_id_invalid");
  if (request.confirmPersistedAcceptance !== true) blockers.push("persisted_acceptance_confirmation_missing");
  if (normalizeText(request.previewFingerprint) !== normalizeText(preview.previewFingerprint)) blockers.push("preview_fingerprint_mismatch");
  if (draft.blockers?.includes("source_lock_provenance_mismatch")) blockers.push("source_lock_provenance_mismatch");

  if (blockers.length > 0) {
    return {
      ok: false,
      status: "acceptance_blocked",
      blockers: [...new Set(blockers)],
      record: null,
      databaseWrites: false,
      downstreamUnlocked: false,
      modelCalls: 0,
      externalCalls: false,
      costIncurred: false,
      generatedMedia: false,
      publishTriggered: false,
    };
  }

  const checks = Object.fromEntries(REQUIRED_SCRIPT_REVIEW_CHECKS.map((id) => [id, true]));
  const acceptanceFingerprint = createHash("sha256").update(JSON.stringify({
    sourceIdeaId: normalizeText(sourceIdeaId),
    dramaId: Number(dramaId),
    outputFingerprint: draft.outputFingerprint,
    sourceLockFingerprint: draft.plannedSourceLockFingerprint,
    reviewDraftFingerprint: draft.reviewDraftFingerprint,
    previewFingerprint: preview.previewFingerprint,
    checks: REQUIRED_SCRIPT_REVIEW_CHECKS,
  })).digest("hex");
  const timestamp = normalizeText(reviewedAt) || new Date().toISOString();

  return {
    ok: true,
    status: "ready_to_persist",
    blockers: [],
    record: {
      id: `sra_${acceptanceFingerprint}`,
      sourceIdeaId: normalizeText(sourceIdeaId),
      dramaId: Number(dramaId),
      outputFingerprint: draft.outputFingerprint,
      sourceLockFingerprint: draft.plannedSourceLockFingerprint,
      reviewDraftFingerprint: draft.reviewDraftFingerprint,
      previewFingerprint: preview.previewFingerprint,
      checklist: JSON.stringify(checks),
      status: "accepted",
      reviewedAt: timestamp,
      createdAt: timestamp,
    },
    confirmedChecks: REQUIRED_SCRIPT_REVIEW_CHECKS.length,
    databaseWrites: false,
    downstreamUnlocked: false,
    modelCalls: 0,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
  };
}
