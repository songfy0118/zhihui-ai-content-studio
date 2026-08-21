import { createHash } from "node:crypto";

import { HUMAN_CLAIM_SELECTION_CHECKS } from "./human-claim-selection-plan.mjs";

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ROLES = new Set(["original", "independent"]);
const MAXIMUM_REVIEW_NOTE_CHARS = 500;

export const HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION = "ACCEPT_SELECTED_CLAIMS_FOR_DRAFT_RESEARCH";
export const HUMAN_CLAIM_ACCEPTANCE_CHECKS = Object.freeze([
  "exact_claim_wording_approved",
  "two_source_citations_approved",
  "uncertainty_note_approved",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "human_claim_acceptance_preview_blocked",
    blockers: [],
    receiptPreview: null,
    acceptedClaimCountInPreview: 0,
    acceptanceFingerprint: null,
    idempotencyKey: null,
    readyForAuthorizedAcceptanceSave: false,
    persistenceAuthorizationRequired: true,
    persistenceAuthorizationGranted: false,
    persisted: false,
    claimsAccepted: 0,
    factsVerified: false,
    readyForCopyGeneration: false,
    platformDrafts: {},
    draftGenerated: false,
    draftSaved: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: 0,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function cleanNote(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 8 && normalized.length <= MAXIMUM_REVIEW_NOTE_CHARS ? normalized : null;
}

function validateSelectionPlan(plan, blockers) {
  if (plan?.status !== "human_claim_selection_plan_ready" || plan?.readyForHumanClaimAcceptanceRequest !== true) blockers.push("claim_selection_plan_not_ready");
  if (!HASH.test(plan?.candidateMaterialFingerprint ?? "")) blockers.push("candidate_material_fingerprint_invalid");
  if (!HASH.test(plan?.claimSelectionFingerprint ?? "")) blockers.push("claim_selection_fingerprint_invalid");
  if (!Array.isArray(plan?.plannedClaims) || plan.plannedClaims.length === 0 || plan.plannedClaims.length > 8) {
    blockers.push("planned_claims_invalid");
    return new Map();
  }

  const claimIndex = new Map();
  for (const claim of plan.plannedClaims) {
    const roles = new Set();
    const claimInvalid = (
      !HASH.test(claim?.claimId ?? "")
      || typeof claim?.decisionId !== "string"
      || !claim.decisionId.trim()
      || typeof claim?.proposedClaim !== "string"
      || claim.proposedClaim.trim().length < 12
      || claim.status !== "human_claim_selection_planned_not_accepted"
      || !Array.isArray(claim?.sources)
      || claim.sources.length !== 2
      || claimIndex.has(claim.claimId)
      || HUMAN_CLAIM_SELECTION_CHECKS.some((check) => claim?.humanChecks?.[check] !== true)
    );
    for (const source of Array.isArray(claim?.sources) ? claim.sources : []) {
      roles.add(source?.evidenceRole);
      if (
        !HASH.test(source?.candidateId ?? "")
        || typeof source?.evidenceId !== "string"
        || typeof source?.sourceId !== "string"
        || typeof source?.canonicalUrl !== "string"
        || typeof source?.sourceSentence !== "string"
        || source.reviewStatus !== "unreviewed_source_sentence"
      ) blockers.push(`planned_claim_source_invalid:${claim?.claimId ?? "missing"}`);
    }
    if (roles.size !== REQUIRED_ROLES.size || [...REQUIRED_ROLES].some((role) => !roles.has(role))) blockers.push(`planned_claim_source_roles_invalid:${claim?.claimId ?? "missing"}`);
    if (claimInvalid) blockers.push(`planned_claim_invalid:${claim?.claimId ?? "missing"}`);
    else claimIndex.set(claim.claimId, claim);
  }
  const recomputed = hash(JSON.stringify({
    candidateMaterialFingerprint: plan.candidateMaterialFingerprint,
    claims: plan.plannedClaims,
  }));
  if (recomputed !== plan.claimSelectionFingerprint) blockers.push("claim_selection_plan_tampered");
  return claimIndex;
}

export function buildHumanClaimAcceptancePreview(selectionPlan, decisions = [], {
  confirmedClaimSelectionFingerprint = null,
  confirmation = null,
} = {}) {
  const blockers = [];
  const claimIndex = validateSelectionPlan(selectionPlan, blockers);
  if (!confirmedClaimSelectionFingerprint) blockers.push("claim_selection_confirmation_required");
  if (confirmedClaimSelectionFingerprint && confirmedClaimSelectionFingerprint !== selectionPlan?.claimSelectionFingerprint) blockers.push("claim_selection_confirmation_mismatch");
  if (confirmation !== HUMAN_CLAIM_ACCEPTANCE_CONFIRMATION) blockers.push("claim_acceptance_confirmation_invalid");
  if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > claimIndex.size) blockers.push("claim_acceptance_decisions_invalid");

  const acceptedClaims = [];
  const seenClaimIds = new Set();
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    const claimId = typeof decision?.claimId === "string" ? decision.claimId : "";
    const claim = claimIndex.get(claimId);
    const decisionBlockers = [];
    if (!claim || seenClaimIds.has(claimId)) decisionBlockers.push("claim_not_current_or_duplicate");
    seenClaimIds.add(claimId);
    if (decision?.accept !== true) decisionBlockers.push("explicit_claim_acceptance_required");
    const reviewNote = cleanNote(decision?.reviewNote);
    if (!reviewNote) decisionBlockers.push("review_note_required");
    const checks = Object.fromEntries(HUMAN_CLAIM_ACCEPTANCE_CHECKS.map((check) => [check, decision?.checks?.[check] === true]));
    for (const check of HUMAN_CLAIM_ACCEPTANCE_CHECKS) {
      if (!checks[check]) decisionBlockers.push(`human_check_missing:${check}`);
    }
    if (decisionBlockers.length) {
      blockers.push(...decisionBlockers.map((blocker) => `${claimId || "missing"}:${blocker}`));
      continue;
    }
    acceptedClaims.push({
      claimId,
      proposedClaim: claim.proposedClaim,
      status: "human_accepted_in_preview_not_persisted",
      sources: claim.sources,
      reviewNote,
      acceptanceChecks: checks,
    });
  }
  if (blockers.length || acceptedClaims.length === 0) return safeResult({ blockers: [...new Set(blockers)] });
  acceptedClaims.sort((left, right) => left.claimId.localeCompare(right.claimId));
  const acceptanceFingerprint = hash(JSON.stringify({
    claimSelectionFingerprint: selectionPlan.claimSelectionFingerprint,
    acceptedClaims,
  }));
  return safeResult({
    status: "human_claim_acceptance_preview_ready",
    receiptPreview: {
      receiptId: `hcap_${acceptanceFingerprint}`,
      claimSelectionFingerprint: selectionPlan.claimSelectionFingerprint,
      acceptedClaims,
      status: "preview_not_persisted",
    },
    acceptedClaimCountInPreview: acceptedClaims.length,
    acceptanceFingerprint,
    idempotencyKey: `human-claim-acceptance:${acceptanceFingerprint}`,
    readyForAuthorizedAcceptanceSave: true,
  });
}
