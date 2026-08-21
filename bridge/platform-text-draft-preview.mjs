import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PERFORMANCE_PROMISE = /(?:必爆|爆款保证|保证(?:播放|流量|涨粉)|百万播放|稳赚|guaranteed\s+(?:viral|views?)|(?:100k|1m)\s+views?)/i;
const PLATFORM_LIMITS = Object.freeze({
  xiaohongshu: Object.freeze({ title: 20, coverText: 16 }),
  douyin: Object.freeze({ title: 30, coverText: 16 }),
});

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanHashtags(value) {
  if (!Array.isArray(value)) return null;
  const hashtags = value.map((tag) => cleanText(tag, 24)?.replace(/^#+/, "")).filter(Boolean);
  if (hashtags.length < 2 || hashtags.length > 8) return null;
  if (hashtags.some((tag) => !tag || /\s/.test(tag))) return null;
  return new Set(hashtags.map((tag) => tag.toLowerCase())).size === hashtags.length ? hashtags : null;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeBlueprint(value, expectedFingerprint) {
  if (!value || value.acceptanceReadFingerprint == null || !HASH.test(value.acceptanceReadFingerprint)) return null;
  if (!HASH.test(value.acceptanceFingerprint ?? "") || !Array.isArray(value.targets) || value.targets.length === 0) return null;
  if (!Array.isArray(value.approvedClaimBlocks) || value.approvedClaimBlocks.length === 0) return null;
  if (!Array.isArray(value.sourceLedger) || value.sourceLedger.length !== value.approvedClaimBlocks.length * 2) return null;
  if (typeof value.platformStructures !== "object" || value.platformStructures == null) return null;
  const recomputed = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (recomputed !== expectedFingerprint) return null;

  const sourceByRef = new Map();
  for (const source of value.sourceLedger) {
    if (
      !cleanText(source?.sourceRef, 256)
      || sourceByRef.has(source.sourceRef)
      || !["original", "independent"].includes(source?.evidenceRole)
      || !publicUrl(source?.canonicalUrl)
    ) return null;
    sourceByRef.set(source.sourceRef, source);
  }
  for (const block of value.approvedClaimBlocks) {
    if (
      block?.blockType !== "exact_human_accepted_claim"
      || block?.rewriteAllowed !== false
      || !cleanText(block?.blockId, 256)
      || !cleanText(block?.exactApprovedWording, 2_000)
      || !cleanText(block?.uncertaintyNote, 500)
      || !Array.isArray(block?.sourceRefs)
      || block.sourceRefs.length !== 2
    ) return null;
    const roles = new Set(block.sourceRefs.map((sourceRef) => sourceByRef.get(sourceRef)?.evidenceRole));
    if (roles.size !== 2 || !roles.has("original") || !roles.has("independent")) return null;
  }
  return { blueprint: value, sourceByRef };
}

function safeSubmission(platform, value) {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits || !value || typeof value !== "object") return { blocker: "submission_missing" };
  const title = cleanText(value.title, limits.title);
  const coverText = cleanText(value.coverText, limits.coverText);
  const openingHook = cleanText(value.openingHook, 160);
  const closingPrompt = cleanText(value.closingPrompt, 80);
  const hashtags = cleanHashtags(value.hashtags);
  if (!title) return { blocker: "title_invalid" };
  if (!coverText) return { blocker: "cover_text_invalid" };
  if (!openingHook) return { blocker: "opening_hook_invalid" };
  if (!closingPrompt) return { blocker: "closing_prompt_invalid" };
  if (!hashtags) return { blocker: "hashtags_invalid" };
  if (PERFORMANCE_PROMISE.test([title, coverText, openingHook, closingPrompt].join(" "))) return { blocker: "performance_promise" };
  return { submission: { title, coverText, openingHook, closingPrompt, hashtags } };
}

function formatDraft(platform, blueprint, sourceByRef, submission) {
  const sourceRefs = [];
  const claimSections = blueprint.approvedClaimBlocks.map((block, index) => {
    sourceRefs.push(...block.sourceRefs);
    return [
      `${index + 1}. ${block.exactApprovedWording}`,
      `核验备注：${block.uncertaintyNote}`,
      `引用：${block.sourceRefs.map((sourceRef) => `[${sourceRef}]`).join(" ")}`,
    ].join("\n");
  });
  const uniqueSourceRefs = [...new Set(sourceRefs)];
  const sourceLines = uniqueSourceRefs.map((sourceRef) => {
    const source = sourceByRef.get(sourceRef);
    const roleLabel = source.evidenceRole === "original" ? "原始来源" : "独立来源";
    return `[${sourceRef}] ${roleLabel}：${source.canonicalUrl}`;
  });
  const sourceNote = sourceLines.join("\n");
  const body = [
    submission.openingHook,
    ...claimSections,
    "资料来源：\n" + sourceNote,
    submission.closingPrompt,
  ].join("\n\n");
  const content = {
    platform,
    contentMode: blueprint.platformStructures[platform].contentMode,
    title: submission.title,
    body,
    coverText: submission.coverText,
    hashtags: submission.hashtags,
    sourceNote,
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return {
    ...content,
    draftFingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_draft_preview_blocked",
    blockers: [],
    platformDrafts: {},
    platformDraftCount: 0,
    blueprintFingerprint: null,
    previewFingerprint: null,
    readyForHumanDraftReview: false,
    humanPackagingClaimsUnchecked: true,
    acceptedClaimWordingPreserved: false,
    factsVerified: false,
    draftPreviewBuilt: false,
    draftGenerated: false,
    draftSaved: false,
    modelCalls: 0,
    databaseWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextDraftPreview(blueprintResult, submissions = {}, {
  confirmedBlueprintFingerprint = null,
} = {}) {
  const blockers = [];
  if (blueprintResult?.status !== "accepted_claim_draft_blueprint_ready" || blueprintResult?.readyForHumanCopyDrafting !== true) {
    blockers.push("accepted_claim_blueprint_not_ready");
  }
  if (!HASH.test(blueprintResult?.blueprintFingerprint ?? "")) blockers.push("accepted_claim_blueprint_fingerprint_invalid");
  if (confirmedBlueprintFingerprint !== blueprintResult?.blueprintFingerprint) blockers.push("accepted_claim_blueprint_confirmation_mismatch");
  const checkedBlueprint = safeBlueprint(blueprintResult?.blueprint, blueprintResult?.blueprintFingerprint);
  if (!checkedBlueprint) blockers.push("accepted_claim_blueprint_tampered");
  const targetPlatforms = Array.isArray(blueprintResult?.targetPlatforms) ? blueprintResult.targetPlatforms : [];
  if (
    !checkedBlueprint
    || JSON.stringify(targetPlatforms) !== JSON.stringify(checkedBlueprint.blueprint.targets)
    || targetPlatforms.some((platform) => !PLATFORM_LIMITS[platform] || !checkedBlueprint.blueprint.platformStructures?.[platform])
  ) blockers.push("accepted_claim_blueprint_targets_mismatch");

  const platformInputs = new Map();
  for (const platform of targetPlatforms) {
    const checked = safeSubmission(platform, submissions?.[platform]);
    if (!checked.submission) blockers.push(`${platform}:${checked.blocker}`);
    else platformInputs.set(platform, checked.submission);
  }
  const normalizedTitles = [...platformInputs.values()].map((submission) => submission.title.toLowerCase());
  if (normalizedTitles.length > 1 && new Set(normalizedTitles).size !== normalizedTitles.length) blockers.push("platform_titles_not_distinct");
  if (blockers.length || !checkedBlueprint) return safeResult({ blockers: [...new Set(blockers)] });

  const platformDrafts = Object.fromEntries(targetPlatforms.map((platform) => [
    platform,
    formatDraft(platform, checkedBlueprint.blueprint, checkedBlueprint.sourceByRef, platformInputs.get(platform)),
  ]));
  const previewFingerprint = createHash("sha256").update(JSON.stringify({
    blueprintFingerprint: blueprintResult.blueprintFingerprint,
    platformDrafts,
  })).digest("hex");

  return safeResult({
    status: "platform_text_draft_preview_ready",
    platformDrafts,
    platformDraftCount: Object.keys(platformDrafts).length,
    blueprintFingerprint: blueprintResult.blueprintFingerprint,
    previewFingerprint,
    readyForHumanDraftReview: true,
    acceptedClaimWordingPreserved: true,
    draftPreviewBuilt: true,
  });
}
