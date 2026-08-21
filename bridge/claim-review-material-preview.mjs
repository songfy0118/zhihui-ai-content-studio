import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ROLES = new Set(["original", "independent"]);
const ROLE_ORDER = new Map([["original", 0], ["independent", 1]]);
const MINIMUM_CANDIDATE_CHARS = 36;
const MAXIMUM_CANDIDATE_CHARS = 240;
const MAXIMUM_CANDIDATES_PER_SOURCE = 5;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeResult(fields = {}) {
  return {
    status: "claim_review_material_preview_blocked",
    blockers: [],
    sourceMaterials: [],
    reviewQuestions: [],
    candidateCount: 0,
    candidateMaterialFingerprint: null,
    readyForHumanClaimReview: false,
    sourceBodiesPersisted: false,
    rawArticleTextReturned: false,
    factsVerified: false,
    claimsAccepted: 0,
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

function normalizeSentence(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractCandidates(document) {
  const sentences = document.text.match(/[^.!?。！？\r\n]+[.!?。！？]?/gu) ?? [];
  const candidates = [];
  for (const sentence of sentences) {
    const normalized = normalizeSentence(sentence);
    if (normalized.length < MINIMUM_CANDIDATE_CHARS) continue;
    const text = normalized.slice(0, MAXIMUM_CANDIDATE_CHARS);
    candidates.push({
      candidateId: hash(`${document.evidenceId}\n${document.textHash}\n${candidates.length}\n${text}`),
      status: "unreviewed_source_sentence",
      evidenceId: document.evidenceId,
      sourceId: document.sourceId,
      evidenceRole: document.evidenceRole,
      canonicalUrl: document.canonicalUrl,
      text,
      truncated: normalized.length > MAXIMUM_CANDIDATE_CHARS,
    });
    if (candidates.length === MAXIMUM_CANDIDATES_PER_SOURCE) break;
  }
  return candidates;
}

function validateBrief(briefPreview, blockers) {
  if (briefPreview?.status !== "text_draft_brief_preview_ready" || !briefPreview?.brief) {
    blockers.push("text_draft_brief_preview_not_ready");
    return null;
  }
  if (!HASH.test(briefPreview.briefFingerprint ?? "")) {
    blockers.push("text_draft_brief_fingerprint_invalid");
    return null;
  }
  if (hash(JSON.stringify(briefPreview.brief)) !== briefPreview.briefFingerprint) {
    blockers.push("text_draft_brief_tampered");
    return null;
  }
  const evidence = briefPreview.brief.evidence;
  if (!Array.isArray(evidence) || evidence.length !== 2) {
    blockers.push("text_draft_brief_evidence_invalid");
    return null;
  }
  return evidence;
}

function validateDocuments(acquisitionResult, evidence, blockers) {
  if (acquisitionResult?.status !== "public_article_acquisition_complete" || acquisitionResult?.sourceBodiesFetched !== true) {
    blockers.push("public_article_acquisition_not_complete");
  }
  if (!Array.isArray(acquisitionResult?.documents) || acquisitionResult.documents.length !== 2) {
    blockers.push("public_article_documents_invalid");
    return [];
  }

  const roles = new Set();
  const documents = [];
  for (const document of acquisitionResult.documents) {
    const role = document?.evidenceRole;
    if (!REQUIRED_ROLES.has(role) || roles.has(role)) {
      blockers.push("public_article_evidence_roles_invalid");
      continue;
    }
    roles.add(role);
    if (
      typeof document.evidenceId !== "string"
      || typeof document.sourceId !== "string"
      || typeof document.canonicalUrl !== "string"
      || typeof document.text !== "string"
      || document.ephemeral !== true
      || !HASH.test(document.textHash ?? "")
      || hash(document.text) !== document.textHash
    ) {
      blockers.push(`public_article_document_invalid:${document?.sourceId ?? "unknown"}`);
      continue;
    }
    const briefEvidence = evidence?.find((item) => item.evidenceId === document.evidenceId);
    if (
      !briefEvidence
      || briefEvidence.sourceId !== document.sourceId
      || briefEvidence.evidenceRole !== role
      || briefEvidence.canonicalUrl !== document.canonicalUrl
    ) {
      blockers.push(`public_article_brief_mapping_mismatch:${document.sourceId}`);
      continue;
    }
    documents.push(document);
  }
  if (roles.size !== REQUIRED_ROLES.size) blockers.push("public_article_evidence_roles_incomplete");
  return documents.sort((left, right) => ROLE_ORDER.get(left.evidenceRole) - ROLE_ORDER.get(right.evidenceRole));
}

export function buildClaimReviewMaterialPreview(acquisitionResult, briefPreview) {
  const blockers = [];
  const evidence = validateBrief(briefPreview, blockers);
  const documents = validateDocuments(acquisitionResult, evidence, blockers);
  if (blockers.length) return safeResult({ blockers: [...new Set(blockers)] });

  const sourceMaterials = documents.map((document) => ({
    evidenceId: document.evidenceId,
    sourceId: document.sourceId,
    evidenceRole: document.evidenceRole,
    canonicalUrl: document.canonicalUrl,
    textHash: document.textHash,
    candidates: extractCandidates(document),
  }));
  const candidateCount = sourceMaterials.reduce((total, material) => total + material.candidates.length, 0);
  if (sourceMaterials.some((material) => material.candidates.length === 0)) {
    return safeResult({
      blockers: ["review_sentence_candidates_missing"],
      sourceMaterials,
      candidateCount,
    });
  }

  const fingerprintInput = {
    briefFingerprint: briefPreview.briefFingerprint,
    sources: sourceMaterials.map((material) => ({
      evidenceId: material.evidenceId,
      evidenceRole: material.evidenceRole,
      textHash: material.textHash,
      candidates: material.candidates.map(({ candidateId, text, truncated }) => ({ candidateId, text, truncated })),
    })),
  };

  return safeResult({
    status: "claim_review_material_preview_ready",
    sourceMaterials,
    reviewQuestions: Array.isArray(briefPreview.brief.researchTasks)
      ? briefPreview.brief.researchTasks.map(({ id, question }) => ({ id, question }))
      : [],
    candidateCount,
    candidateMaterialFingerprint: hash(JSON.stringify(fingerprintInput)),
    readyForHumanClaimReview: true,
  });
}
