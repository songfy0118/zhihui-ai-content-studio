import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const CARD_TYPES = new Set([
  "hook",
  "comparison",
  "three_panel_schema",
  "process",
  "scenario",
  "caveat",
  "outlook",
  "sources",
]);
const RENDER_MODES = new Set(["deterministic_svg", "hybrid_svg_illustration"]);
const PLATFORM_CANVAS = Object.freeze({
  douyin: Object.freeze({ width: 1080, height: 1920, aspectRatio: "9:16", safeMargin: 108 }),
  xiaohongshu: Object.freeze({ width: 1080, height: 1440, aspectRatio: "3:4", safeMargin: 96 }),
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value, maximumLength) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maximumLength ? result : null;
}

function blocked(blockers) {
  return {
    status: "platform_infographic_storyboard_blocked",
    blockers,
    storyboardFingerprint: null,
    cards: [],
    assetsGenerated: 0,
    modelCalls: 0,
    externalCalls: false,
    browserOpenPerformed: false,
    publishTriggered: false,
  };
}

function normalizeClaims(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return null;
  const normalized = [];
  const ids = new Set();
  for (const claim of claims) {
    const id = cleanText(claim?.id, 80);
    const text = cleanText(claim?.text, 1_000);
    const sourceUrl = cleanText(claim?.sourceUrl, 2_000);
    if (!id || ids.has(id) || !text || !sourceUrl || !/^https?:\/\//u.test(sourceUrl) || claim?.sourceLocked !== true) {
      return null;
    }
    ids.add(id);
    normalized.push({ id, text, sourceUrl, sourceLocked: true });
  }
  return normalized;
}

function normalizeNumericFacts(value, claimIds) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const facts = [];
  for (const fact of value) {
    const label = cleanText(fact?.label, 60);
    const displayValue = cleanText(fact?.displayValue, 40);
    const claimId = cleanText(fact?.claimId, 80);
    if (!label || !displayValue || !claimId || !claimIds.has(claimId)) return null;
    facts.push({ label, displayValue, claimId });
  }
  return facts;
}

function promptForCard({ platform, card, canvas }) {
  const labels = card.exactLabels.map((label) => `“${label}”`).join("、");
  const drawing = card.drawInstructions.map((instruction, index) => `${index + 1}. ${instruction}`).join("\n");
  return [
    `画布：${canvas.width}×${canvas.height}，${canvas.aspectRatio} 竖版，四周至少 ${canvas.safeMargin}px 安全区。`,
    "目标：中文科技知识图解，不是纯文字海报；每页只解释一个核心判断。",
    `版式：${card.type}；信息层级依次为标题、视觉主体、证据注释。`,
    "风格：原创的学术手账与技术示意图融合；暖白纸张、细线框、低饱和蓝绿与橙色强调、充足留白。",
    `锁定文字：${labels}。锁定文字必须逐字保留，并由 SVG/HTML 排版，不交给图片模型重写。`,
    `具体绘制：\n${drawing}`,
    "插图规则：只有装饰性人物、设备或抽象场景可由图片模型生成；代码、数字、坐标、图表、箭头和标签必须确定性绘制。",
    "禁止：品牌水印、页码、内部审核提示、无来源的数字、密集长段落、伪造产品界面、照抄参考图构图。",
    `输出：${platform} 可读的高对比信息卡；手机缩略图下仍能识别标题和主图形。`,
  ].join("\n");
}

export function buildPlatformInfographicStoryboard(input) {
  const platform = cleanText(input?.platform, 30);
  const topic = cleanText(input?.topic, 120);
  const canvas = PLATFORM_CANVAS[platform];
  const claims = normalizeClaims(input?.claims);
  const sections = input?.sections;
  const blockers = [];
  if (!canvas) blockers.push("platform_not_supported");
  if (!topic) blockers.push("topic_invalid");
  if (!claims) blockers.push("source_locked_claims_invalid");
  if (!Array.isArray(sections) || sections.length < 3 || sections.length > 9) blockers.push("section_count_must_be_3_to_9");
  if (blockers.length) return blocked(blockers);

  const claimIds = new Set(claims.map(({ id }) => id));
  const cards = [];
  for (const [index, section] of sections.entries()) {
    const type = cleanText(section?.type, 40);
    const headline = cleanText(section?.headline, 60);
    const purpose = cleanText(section?.purpose, 240);
    const renderMode = cleanText(section?.renderMode, 50);
    const evidenceClaimIds = Array.isArray(section?.evidenceClaimIds)
      ? [...new Set(section.evidenceClaimIds.map((value) => cleanText(value, 80)).filter(Boolean))]
      : [];
    const exactLabels = Array.isArray(section?.exactLabels)
      ? section.exactLabels.map((value) => cleanText(value, 80)).filter(Boolean)
      : [];
    const drawInstructions = Array.isArray(section?.drawInstructions)
      ? section.drawInstructions.map((value) => cleanText(value, 300)).filter(Boolean)
      : [];
    const numericFacts = normalizeNumericFacts(section?.numericFacts, claimIds);

    if (!CARD_TYPES.has(type)) blockers.push(`card_type_invalid:${index + 1}`);
    if (!headline) blockers.push(`card_headline_invalid:${index + 1}`);
    if (!purpose) blockers.push(`card_purpose_invalid:${index + 1}`);
    if (!RENDER_MODES.has(renderMode)) blockers.push(`card_render_mode_invalid:${index + 1}`);
    if (evidenceClaimIds.length === 0 || evidenceClaimIds.some((id) => !claimIds.has(id))) {
      blockers.push(`card_evidence_invalid:${index + 1}`);
    }
    if (exactLabels.length < 1 || exactLabels.length > 12) blockers.push(`card_exact_labels_invalid:${index + 1}`);
    if (drawInstructions.length < 1 || drawInstructions.length > 8) blockers.push(`card_draw_instructions_invalid:${index + 1}`);
    if (numericFacts === null) blockers.push(`card_numeric_fact_unlocked:${index + 1}`);
    if (blockers.length) continue;

    const card = {
      cardIndex: index + 1,
      type,
      headline,
      purpose,
      renderMode,
      evidenceClaimIds,
      exactLabels,
      drawInstructions,
      numericFacts,
    };
    cards.push({ ...card, visualPrompt: promptForCard({ platform, card, canvas }) });
  }
  if (blockers.length) return blocked([...new Set(blockers)]);

  const sourceFingerprint = hash(claims);
  const storyboardFingerprint = hash({ platform, topic, canvas, sourceFingerprint, cards });
  return {
    status: "platform_infographic_storyboard_ready",
    blockers: [],
    platform,
    topic,
    canvas,
    sourceFingerprint,
    storyboardFingerprint,
    claims,
    cards,
    cardCount: cards.length,
    renderingPolicy: {
      exactTextAndCharts: "deterministic_svg_or_html",
      decorativeIllustration: "optional_image_model",
      imageModelMayRewriteExactText: false,
      humanVisualReviewRequired: true,
    },
    assetsGenerated: 0,
    modelCalls: 0,
    externalCalls: false,
    browserOpenPerformed: false,
    publishTriggered: false,
  };
}

export function isPlatformInfographicStoryboard(value) {
  return value?.status === "platform_infographic_storyboard_ready"
    && HASH.test(value?.storyboardFingerprint ?? "")
    && value?.cardCount === value?.cards?.length;
}
