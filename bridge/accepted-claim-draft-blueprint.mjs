import { createHash } from "node:crypto";

import { HUMAN_CLAIM_ACCEPTANCE_CHECKS } from "./human-claim-acceptance-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const TARGET_ORDER = Object.freeze(["xiaohongshu", "douyin"]);
const SUPPORTED_TARGETS = new Set(TARGET_ORDER);
const REQUIRED_ROLES = new Set(["original", "independent"]);

const PLATFORM_STRUCTURES = Object.freeze({
  xiaohongshu: Object.freeze({
    contentMode: "text_image_carousel_structure",
    requestedFields: Object.freeze(["title", "body", "coverText", "hashtags", "sourceNote"]),
    sectionOrder: Object.freeze(["cover", "opening_hook", "approved_claim_cards", "uncertainty_notes", "source_note", "closing_prompt", "hashtags"]),
  }),
  douyin: Object.freeze({
    contentMode: "text_image_post_structure",
    requestedFields: Object.freeze(["title", "body", "coverText", "hashtags", "sourceNote"]),
    sectionOrder: Object.freeze(["cover", "opening_hook", "approved_claim_cards", "uncertainty_notes", "source_note", "interaction_prompt", "hashtags"]),
  }),
});

const CONSTRAINTS = Object.freeze([
  "use_only_exact_human_accepted_claim_wording",
  "keep_original_and_independent_source_refs_per_claim",
  "preserve_human_uncertainty_notes",
  "do_not_turn_source_sentences_into_new_claims",
  "no_performance_promises",
  "human_review_required_before_draft_handoff",
]);

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanTargets(value) {
  if (!Array.isArray(value)) return [];
  const rank = new Map(TARGET_ORDER.map((target, index) => [target, index]));
  return [...new Set(value.map((target) => cleanText(target, 32)?.toLowerCase()).filter(Boolean))]
    .sort((left, right) => (rank.get(left) ?? 99) - (rank.get(right) ?? 99) || left.localeCompare(right));
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeClaims(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const claimIds = new Set();
  const claims = [];
  for (const claim of value) {
    if (
      !HASH.test(claim?.claimId ?? "")
      || claimIds.has(claim.claimId)
      || claim?.status !== "human_accepted_persisted"
      || HUMAN_CLAIM_ACCEPTANCE_CHECKS.some((check) => claim?.acceptanceChecks?.[check] !== true)
    ) return null;
    claimIds.add(claim.claimId);
    const exactApprovedWording = cleanText(claim.proposedClaim, 2_000);
    const uncertaintyNote = cleanText(claim.reviewNote, 500);
    if (!exactApprovedWording || !uncertaintyNote || !Array.isArray(claim.sources) || claim.sources.length !== 2) return null;

    const roles = new Set();
    const sources = [];
    for (const source of claim.sources) {
      const evidenceRole = cleanText(source?.evidenceRole, 32);
      const canonicalUrl = publicUrl(source?.canonicalUrl);
      if (
        !REQUIRED_ROLES.has(evidenceRole)
        || roles.has(evidenceRole)
        || !HASH.test(source?.candidateId ?? "")
        || !cleanText(source?.evidenceId, 256)
        || !cleanText(source?.sourceId, 256)
        || !cleanText(source?.sourceSentence, 2_000)
        || !canonicalUrl
      ) return null;
      roles.add(evidenceRole);
      sources.push({
        candidateId: source.candidateId,
        evidenceId: source.evidenceId.trim(),
        sourceId: source.sourceId.trim(),
        evidenceRole,
        canonicalUrl,
        supportingSentence: source.sourceSentence.replace(/\s+/g, " ").trim(),
      });
    }
    if ([...REQUIRED_ROLES].some((role) => !roles.has(role))) return null;
    claims.push({
      claimId: claim.claimId,
      exactApprovedWording,
      uncertaintyNote,
      sources: sources.sort((left, right) => left.evidenceRole.localeCompare(right.evidenceRole)),
    });
  }
  return claims.sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function blockedResult(blockers, targets) {
  return {
    status: "accepted_claim_draft_blueprint_blocked",
    blockers: [...new Set(blockers)],
    blueprint: null,
    blueprintFingerprint: null,
    targetPlatforms: targets.filter((target) => SUPPORTED_TARGETS.has(target)),
    acceptedClaimCount: 0,
    readyForHumanCopyDrafting: false,
    factsVerified: false,
    readyForCopyGeneration: false,
    platformDrafts: {},
    draftGenerated: false,
    draftSaved: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export function buildAcceptedClaimDraftBlueprint(acceptanceRead, {
  editorialAngle = null,
  targets = ["xiaohongshu", "douyin"],
} = {}) {
  const blockers = [];
  const normalizedTargets = cleanTargets(targets);
  const angle = cleanText(editorialAngle, 160);
  const receipt = acceptanceRead?.receipt;
  const claims = safeClaims(receipt?.claims);

  if (
    acceptanceRead?.status !== "human_claim_acceptance_read_ready"
    || acceptanceRead?.found !== true
    || acceptanceRead?.durableHumanAcceptance !== true
    || acceptanceRead?.draftResearchInputReady !== true
  ) blockers.push("human_claim_acceptance_read_not_ready");
  if (!HASH.test(acceptanceRead?.readFingerprint ?? "")) blockers.push("human_claim_acceptance_read_fingerprint_invalid");
  if (
    receipt?.status !== "active"
    || !HASH.test(receipt?.acceptanceFingerprint ?? "")
    || !HASH.test(receipt?.claimSelectionFingerprint ?? "")
    || receipt?.receiptId !== `hcap_${receipt?.acceptanceFingerprint}`
  ) blockers.push("human_claim_acceptance_receipt_invalid");
  if (!claims) blockers.push("human_claim_acceptance_claims_invalid");
  if (!angle) blockers.push("editorial_angle_required");
  if (normalizedTargets.length === 0) blockers.push("target_platform_required");
  if (normalizedTargets.some((target) => !SUPPORTED_TARGETS.has(target))) blockers.push("target_platform_unsupported");
  if (blockers.length) return blockedResult(blockers, normalizedTargets);

  const sourceLedger = [];
  const approvedClaimBlocks = claims.map((claim, claimIndex) => {
    const sourceRefs = claim.sources.map((source) => {
      const sourceRef = `claim-${claimIndex + 1}-${source.evidenceRole}`;
      sourceLedger.push({ sourceRef, claimId: claim.claimId, ...source });
      return sourceRef;
    });
    return {
      blockId: `claim-${claimIndex + 1}`,
      claimId: claim.claimId,
      blockType: "exact_human_accepted_claim",
      exactApprovedWording: claim.exactApprovedWording,
      uncertaintyNote: claim.uncertaintyNote,
      sourceRefs,
      rewriteAllowed: false,
    };
  });
  const emptyDraftFields = {
    title: null,
    body: null,
    coverText: null,
    hashtags: [],
    sourceNote: null,
  };
  const platformStructures = Object.fromEntries(normalizedTargets.map((target) => [target, {
    platform: target,
    ...PLATFORM_STRUCTURES[target],
    editorialAngle: angle,
    approvedClaimBlockIds: approvedClaimBlocks.map((block) => block.blockId),
    draftFields: { ...emptyDraftFields },
    generated: false,
  }]));
  const blueprint = {
    acceptanceReadFingerprint: acceptanceRead.readFingerprint,
    acceptanceFingerprint: receipt.acceptanceFingerprint,
    editorialAngle: angle,
    angleOrigin: "human_provided",
    targets: normalizedTargets,
    approvedClaimBlocks,
    sourceLedger,
    platformStructures,
    constraints: CONSTRAINTS,
  };

  return {
    status: "accepted_claim_draft_blueprint_ready",
    blockers: [],
    blueprint,
    blueprintFingerprint: createHash("sha256").update(JSON.stringify(blueprint)).digest("hex"),
    targetPlatforms: normalizedTargets,
    acceptedClaimCount: approvedClaimBlocks.length,
    readyForHumanCopyDrafting: true,
    factsVerified: false,
    readyForCopyGeneration: false,
    platformDrafts: Object.fromEntries(normalizedTargets.map((target) => [target, null])),
    draftGenerated: false,
    draftSaved: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}
