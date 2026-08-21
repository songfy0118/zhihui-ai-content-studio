import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const ROLE_ORDER = new Map([["original", 0], ["independent", 1]]);
const REQUIRED_ROLES = new Set(ROLE_ORDER.keys());
const MAXIMUM_CLAIMS = 8;
const MINIMUM_CLAIM_CHARS = 12;
const MAXIMUM_CLAIM_CHARS = 320;

export const HUMAN_CLAIM_SELECTION_CHECKS = Object.freeze([
  "source_sentences_read",
  "claim_scope_matches_selected_sentences",
  "numbers_and_dates_checked",
  "uncertainty_or_conflict_recorded",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "human_claim_selection_plan_blocked",
    blockers: [],
    plannedClaims: [],
    plannedClaimCount: 0,
    candidateMaterialFingerprint: null,
    claimSelectionFingerprint: null,
    readyForHumanClaimAcceptanceRequest: false,
    claimAcceptanceRequired: true,
    claimAcceptanceGranted: false,
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

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= MINIMUM_CLAIM_CHARS && normalized.length <= maxLength ? normalized : null;
}

function materialFingerprint(materialPreview) {
  const sources = materialPreview?.sourceMaterials;
  if (!HASH.test(materialPreview?.briefFingerprint ?? "") || !Array.isArray(sources)) return null;
  const fingerprintInput = {
    briefFingerprint: materialPreview.briefFingerprint,
    sources: sources.map((material) => ({
      evidenceId: material.evidenceId,
      evidenceRole: material.evidenceRole,
      textHash: material.textHash,
      candidates: material.candidates?.map(({ candidateId, text, truncated }) => ({ candidateId, text, truncated })),
    })),
  };
  return hash(JSON.stringify(fingerprintInput));
}

function indexCandidates(materialPreview, blockers) {
  const index = new Map();
  const roles = new Set();
  if (!Array.isArray(materialPreview?.sourceMaterials) || materialPreview.sourceMaterials.length !== 2) {
    blockers.push("claim_review_sources_invalid");
    return index;
  }
  for (const material of materialPreview.sourceMaterials) {
    if (!REQUIRED_ROLES.has(material?.evidenceRole) || roles.has(material.evidenceRole) || !HASH.test(material?.textHash ?? "")) {
      blockers.push("claim_review_source_invalid");
      continue;
    }
    roles.add(material.evidenceRole);
    if (!Array.isArray(material.candidates) || material.candidates.length === 0 || material.candidates.length > 5) {
      blockers.push(`claim_review_candidates_invalid:${material?.sourceId ?? "unknown"}`);
      continue;
    }
    for (const candidate of material.candidates) {
      if (
        !HASH.test(candidate?.candidateId ?? "")
        || candidate.status !== "unreviewed_source_sentence"
        || candidate.evidenceId !== material.evidenceId
        || candidate.sourceId !== material.sourceId
        || candidate.evidenceRole !== material.evidenceRole
        || candidate.canonicalUrl !== material.canonicalUrl
        || typeof candidate.text !== "string"
        || candidate.text.length < MINIMUM_CLAIM_CHARS
        || candidate.text.length > 240
        || index.has(candidate.candidateId)
      ) {
        blockers.push(`claim_review_candidate_invalid:${candidate?.candidateId ?? "missing"}`);
        continue;
      }
      index.set(candidate.candidateId, candidate);
    }
  }
  if (roles.size !== REQUIRED_ROLES.size) blockers.push("claim_review_source_roles_incomplete");
  return index;
}

export function buildHumanClaimSelectionPlan(materialPreview, decisions = [], {
  confirmedMaterialFingerprint = null,
} = {}) {
  const blockers = [];
  if (materialPreview?.status !== "claim_review_material_preview_ready" || materialPreview?.readyForHumanClaimReview !== true) blockers.push("claim_review_material_not_ready");
  if (!HASH.test(materialPreview?.candidateMaterialFingerprint ?? "")) blockers.push("claim_review_material_fingerprint_invalid");
  const recomputedFingerprint = materialFingerprint(materialPreview);
  if (recomputedFingerprint !== materialPreview?.candidateMaterialFingerprint) blockers.push("claim_review_material_tampered");
  if (!confirmedMaterialFingerprint) blockers.push("claim_review_material_confirmation_required");
  if (confirmedMaterialFingerprint && confirmedMaterialFingerprint !== materialPreview?.candidateMaterialFingerprint) blockers.push("claim_review_material_confirmation_mismatch");

  const candidateIndex = indexCandidates(materialPreview, blockers);
  if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > MAXIMUM_CLAIMS) blockers.push("claim_selection_decisions_invalid");
  const seenDecisionIds = new Set();
  const plannedClaims = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    const decisionId = typeof decision?.decisionId === "string" ? decision.decisionId.trim() : "";
    const proposedClaim = cleanText(decision?.proposedClaim, MAXIMUM_CLAIM_CHARS);
    const selectedIds = Array.isArray(decision?.supportingCandidateIds) ? [...new Set(decision.supportingCandidateIds)] : [];
    const claimBlockers = [];
    if (!decisionId || decisionId.length > 128 || seenDecisionIds.has(decisionId)) claimBlockers.push("decision_id_invalid");
    seenDecisionIds.add(decisionId);
    if (!proposedClaim) claimBlockers.push("proposed_claim_invalid");
    if (selectedIds.length !== 2 || selectedIds.length !== decision?.supportingCandidateIds?.length) claimBlockers.push("supporting_candidates_must_be_two_unique_items");
    const candidates = selectedIds.map((candidateId) => candidateIndex.get(candidateId)).filter(Boolean);
    if (candidates.length !== selectedIds.length) claimBlockers.push("supporting_candidate_not_current");
    const roles = new Set(candidates.map((candidate) => candidate.evidenceRole));
    if (roles.size !== REQUIRED_ROLES.size || [...REQUIRED_ROLES].some((role) => !roles.has(role))) claimBlockers.push("both_source_roles_required");
    const checks = Object.fromEntries(HUMAN_CLAIM_SELECTION_CHECKS.map((check) => [check, decision?.checks?.[check] === true]));
    for (const check of HUMAN_CLAIM_SELECTION_CHECKS) {
      if (!checks[check]) claimBlockers.push(`human_check_missing:${check}`);
    }
    if (claimBlockers.length) {
      blockers.push(...claimBlockers.map((blocker) => `${decisionId || "missing"}:${blocker}`));
      continue;
    }
    const sources = candidates
      .sort((left, right) => ROLE_ORDER.get(left.evidenceRole) - ROLE_ORDER.get(right.evidenceRole))
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        evidenceId: candidate.evidenceId,
        sourceId: candidate.sourceId,
        evidenceRole: candidate.evidenceRole,
        canonicalUrl: candidate.canonicalUrl,
        sourceSentence: candidate.text,
        reviewStatus: candidate.status,
      }));
    plannedClaims.push({
      decisionId,
      claimId: hash(`${materialPreview.candidateMaterialFingerprint}\n${decisionId}\n${proposedClaim}\n${sources.map((source) => source.candidateId).join("\n")}`),
      proposedClaim,
      status: "human_claim_selection_planned_not_accepted",
      humanChecks: checks,
      sources,
    });
  }

  if (blockers.length || plannedClaims.length === 0) return safeResult({ blockers: [...new Set(blockers)] });
  plannedClaims.sort((left, right) => left.decisionId.localeCompare(right.decisionId));
  const claimSelectionFingerprint = hash(JSON.stringify({
    candidateMaterialFingerprint: materialPreview.candidateMaterialFingerprint,
    claims: plannedClaims,
  }));
  return safeResult({
    status: "human_claim_selection_plan_ready",
    plannedClaims,
    plannedClaimCount: plannedClaims.length,
    candidateMaterialFingerprint: materialPreview.candidateMaterialFingerprint,
    claimSelectionFingerprint,
    readyForHumanClaimAcceptanceRequest: true,
  });
}
