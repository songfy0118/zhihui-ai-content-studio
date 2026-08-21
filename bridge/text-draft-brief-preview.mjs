import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TARGET_ORDER = Object.freeze(["xiaohongshu", "douyin"]);
const SUPPORTED_TARGETS = new Set(TARGET_ORDER);
const REQUIRED_EVIDENCE_ROLES = new Set(["original", "independent"]);

const RESEARCH_TASKS = Object.freeze([
  { id: "event_scope", question: "事件主体、动作、时间和适用范围分别是什么？" },
  { id: "numbers_and_dates", question: "每个数字、日期和比较基准能否定位到明确来源？" },
  { id: "affected_groups", question: "哪些人或组织受到直接影响，哪些只是推测？" },
  { id: "uncertainty", question: "两条来源有哪些不确定、冲突或尚未确认的信息？" },
  { id: "context", question: "需要哪些历史背景才能避免标题断章取义？" },
  { id: "claim_source_map", question: "最终每条事实断言分别引用哪一条来源？" },
].map((task) => Object.freeze(task)));

const PLATFORM_FIELDS = Object.freeze({
  xiaohongshu: Object.freeze(["title", "body", "coverText", "hashtags", "sourceNote"]),
  douyin: Object.freeze(["title", "body", "coverText", "hashtags", "sourceNote"]),
});

const CONSTRAINTS = Object.freeze([
  "metadata_is_not_fact_verification",
  "source_bodies_must_be_researched_before_copy_generation",
  "every_factual_claim_requires_a_source_reference",
  "uncertainty_must_be_preserved",
  "no_performance_promises",
  "human_review_required_before_draft_handoff",
]);

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanTargets(value) {
  if (!Array.isArray(value)) return [];
  const rank = new Map(TARGET_ORDER.map((target, index) => [target, index]));
  return [...new Set(value.map((target) => cleanText(target, 32)?.toLowerCase()).filter(Boolean))]
    .sort((left, right) => (rank.get(left) ?? 99) - (rank.get(right) ?? 99) || left.localeCompare(right));
}

function safeEvidence(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const roles = new Set();
  const items = [];
  for (const evidence of value) {
    const evidenceRole = cleanText(evidence?.evidenceRole, 32);
    let canonicalUrl;
    try {
      const parsed = new URL(evidence?.canonicalUrl);
      canonicalUrl = ["http:", "https:"].includes(parsed.protocol) && parsed.hostname ? parsed.toString() : null;
    } catch {
      canonicalUrl = null;
    }
    const item = {
      evidenceId: cleanText(evidence?.evidenceId, 256),
      sourceId: cleanText(evidence?.sourceId, 256),
      sourceName: cleanText(evidence?.sourceName, 256),
      title: cleanText(evidence?.title, 1_000),
      canonicalUrl,
      publishedAt: cleanText(evidence?.publishedAt, 64),
      evidenceRole,
    };
    if (!REQUIRED_EVIDENCE_ROLES.has(evidenceRole) || roles.has(evidenceRole) || Object.values(item).some((field) => field === null)) return null;
    roles.add(evidenceRole);
    items.push(item);
  }
  return roles.size === REQUIRED_EVIDENCE_ROLES.size
    ? items.sort((left, right) => left.evidenceRole.localeCompare(right.evidenceRole))
    : null;
}

export function buildTextDraftBriefPreview(sourceLockRead, {
  editorialAngle = null,
  targets = ["xiaohongshu", "douyin"],
} = {}) {
  const blockers = [];
  const angle = cleanText(editorialAngle, 160);
  const normalizedTargets = cleanTargets(targets);
  const record = sourceLockRead?.record;
  const evidence = safeEvidence(record?.evidence);

  if (sourceLockRead?.status !== "source_lock_read_ready" || sourceLockRead?.found !== true) blockers.push("source_lock_read_not_ready");
  if (!HASH.test(sourceLockRead?.readFingerprint ?? "")) blockers.push("source_lock_read_fingerprint_invalid");
  if (!HASH.test(record?.savePlanFingerprint ?? "") || !HASH.test(record?.reviewFingerprint ?? "") || record?.status !== "active") blockers.push("source_lock_record_invalid");
  if (!cleanText(record?.id, 256) || !cleanText(record?.leadId, 256) || !cleanText(record?.title, 1_000)) blockers.push("source_lock_identity_invalid");
  if (!evidence) blockers.push("source_lock_evidence_invalid");
  if (!angle) blockers.push("editorial_angle_required");
  if (normalizedTargets.length === 0) blockers.push("target_platform_required");
  if (normalizedTargets.some((target) => !SUPPORTED_TARGETS.has(target))) blockers.push("target_platform_unsupported");

  const ready = blockers.length === 0;
  const brief = ready ? {
    sourceLockId: record.id.trim(),
    sourceLockReadFingerprint: sourceLockRead.readFingerprint,
    savePlanFingerprint: record.savePlanFingerprint,
    workingTitle: record.title.trim(),
    editorialAngle: angle,
    angleOrigin: "human_provided",
    targets: normalizedTargets,
    evidence,
    researchTasks: RESEARCH_TASKS,
    requestedPlatformFields: Object.fromEntries(normalizedTargets.map((target) => [target, PLATFORM_FIELDS[target]])),
    constraints: CONSTRAINTS,
  } : null;
  const briefFingerprint = brief ? createHash("sha256").update(JSON.stringify(brief)).digest("hex") : null;

  return {
    status: ready ? "text_draft_brief_preview_ready" : "text_draft_brief_preview_blocked",
    readyForHumanResearch: ready,
    blockers,
    brief,
    briefFingerprint,
    sourceMetadataOnly: true,
    sourceBodiesFetched: false,
    factualClaims: [],
    factsVerified: false,
    readyForCopyGeneration: false,
    platformDrafts: Object.fromEntries(normalizedTargets.filter((target) => SUPPORTED_TARGETS.has(target)).map((target) => [target, null])),
    draftGenerated: false,
    draftSaved: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}
