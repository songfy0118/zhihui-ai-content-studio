import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const PLATFORM_CONFIG = Object.freeze({
  xiaohongshu: Object.freeze({
    canvas: Object.freeze({ width: 1080, height: 1440, aspectRatio: "3:4", safeMargin: 96 }),
    platformLabel: "小红书图文",
    bodyUnitsPerLine: 24,
    bodyLineHeight: 52,
    bodyStartY: 268,
    maximumBodyLines: 18,
    footerY: 1320,
  }),
  douyin: Object.freeze({
    canvas: Object.freeze({ width: 1080, height: 1920, aspectRatio: "9:16", safeMargin: 108 }),
    platformLabel: "抖音图文",
    bodyUnitsPerLine: 20,
    bodyLineHeight: 66,
    bodyStartY: 342,
    maximumBodyLines: 20,
    footerY: 1790,
  }),
});
const EXPECTED_STYLE = Object.freeze({
  layout: "accessible_research_note",
  background: "paper_light",
  typography: "serif_headline_sans_body",
  motion: "not_applicable_to_static_cards",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validText(value, maxLength) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safePlatformPlan(value) {
  const config = PLATFORM_CONFIG[value?.platform];
  if (
    !config
    || !sameObject(value.canvas, config.canvas)
    || !sameObject(value.style, EXPECTED_STYLE)
    || !value.caption
    || !validText(value.caption.title, 60)
    || !validText(value.caption.body, 20_000)
    || !validText(value.caption.sourceNote, 10_000)
    || !Array.isArray(value.caption.hashtags)
    || value.caption.hashtags.length < 2
    || value.caption.hashtags.length > 8
    || value.caption.hashtags.some((hashtag) => !validText(hashtag, 40))
    || !HASH.test(value.draftFingerprint ?? "")
    || !HASH.test(value.reviewFingerprint ?? "")
    || !Array.isArray(value.cards)
    || value.cards.length < 2
    || value.cards.length > 9
    || value.plannedAssetCount !== value.cards.length
    || value.renderStatus !== "planned_not_generated"
  ) return null;

  const cover = value.cards[0];
  if (
    cover?.cardIndex !== 1
    || cover?.role !== "cover"
    || cover?.secondaryText !== value.caption.title
    || !validText(cover?.primaryText, 60)
    || !validText(cover?.secondaryText, 60)
    || cover?.renderStatus !== "planned_not_generated"
  ) return null;

  let cursor = 0;
  const bodyCards = value.cards.slice(1);
  for (const [index, card] of bodyCards.entries()) {
    if (
      card?.cardIndex !== index + 2
      || card?.role !== "body"
      || !validText(card?.exactText, 20_000)
      || card?.textStart !== cursor
      || card?.textEnd !== cursor + card.exactText.length
      || value.caption.body.slice(card.textStart, card.textEnd) !== card.exactText
      || card?.renderStatus !== "planned_not_generated"
    ) return null;
    cursor = card.textEnd;
  }
  return cursor === value.caption.body.length ? value : null;
}

function safeAssetPlan(value) {
  if (
    value?.status !== "platform_text_visual_asset_plan_ready"
    || !HASH.test(value?.sourceHandoffFingerprint ?? "")
    || !HASH.test(value?.assetPlanFingerprint ?? "")
    || value?.exactCopyOnly !== true
    || value?.assetsGenerated !== 0
    || !Array.isArray(value?.generatedFiles)
    || value.generatedFiles.length !== 0
    || value?.visualAssetsReady !== false
    || value?.assetUploadReady !== false
    || value?.readyForDraftHandoff !== false
    || value?.browserOpenPerformed !== false
    || value?.databaseWrites !== false
    || value?.modelCalls !== 0
    || value?.externalCalls !== false
    || value?.publishTriggered !== false
    || value?.businessResult !== false
    || !Array.isArray(value?.platformPlans)
    || value.platformPlans.length < 1
    || value.platformPlans.length > 2
  ) return null;

  const plans = [];
  const seen = new Set();
  for (const candidate of value.platformPlans) {
    const plan = safePlatformPlan(candidate);
    if (!plan || seen.has(plan.platform)) return null;
    seen.add(plan.platform);
    plans.push(plan);
  }
  plans.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  if (plans.some((plan, index) => plan !== value.platformPlans[index])) return null;
  if (plans.reduce((total, plan) => total + plan.plannedAssetCount, 0) !== value.plannedAssetCount) return null;
  return hash({ sourceHandoffFingerprint: value.sourceHandoffFingerprint, platformPlans: value.platformPlans }) === value.assetPlanFingerprint
    ? plans
    : null;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function characterUnits(character) {
  if (/\s/u.test(character)) return 0.4;
  return /^[\x00-\x7F]$/u.test(character) ? 0.56 : 1;
}

function wrapText(value, maximumUnits) {
  const lines = [];
  for (const paragraph of value.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    let units = 0;
    const tokens = paragraph.match(/[A-Za-z0-9_./+\-]+|./gu) ?? [];
    for (const token of tokens) {
      const tokenUnits = [...token].reduce((total, character) => total + characterUnits(character), 0);
      if (line && units + tokenUnits > maximumUnits) {
        lines.push(line);
        line = "";
        units = 0;
      }
      line += token;
      units += tokenUnits;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function textBlock(lines, { x, y, lineHeight, fontSize, fontWeight, fill, className }) {
  const tspans = lines.map((line, index) => (
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line || " ")}</tspan>`
  )).join("");
  return `<text class="${className}" x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" xml:space="preserve">${tspans}</text>`;
}

function svgForCard(plan, card) {
  const config = PLATFORM_CONFIG[plan.platform];
  const { width, height, safeMargin } = config.canvas;
  const copyPayload = card.role === "cover"
    ? JSON.stringify({ primaryText: card.primaryText, secondaryText: card.secondaryText })
    : card.exactText;
  const copyFingerprint = hash(copyPayload);
  const encodedCopy = Buffer.from(copyPayload, "utf8").toString("base64url");
  const titleText = card.role === "cover" ? card.primaryText : card.exactText.slice(0, 36);
  const content = [];

  if (card.role === "cover") {
    const primaryLines = wrapText(card.primaryText, 12);
    const secondaryLines = wrapText(card.secondaryText, 22);
    if (primaryLines.length > 5 || secondaryLines.length > 3) return null;
    content.push(textBlock(primaryLines, {
      x: safeMargin,
      y: plan.platform === "xiaohongshu" ? 390 : 560,
      lineHeight: 112,
      fontSize: 92,
      fontWeight: 800,
      fill: "#15243a",
      className: "cover-primary",
    }));
    const primaryHeight = (primaryLines.length - 1) * 112;
    content.push(textBlock(secondaryLines, {
      x: safeMargin,
      y: (plan.platform === "xiaohongshu" ? 520 : 690) + primaryHeight,
      lineHeight: 58,
      fontSize: 42,
      fontWeight: 500,
      fill: "#375a64",
      className: "cover-secondary",
    }));
  } else {
    const bodyLines = wrapText(card.exactText, config.bodyUnitsPerLine);
    if (bodyLines.length > config.maximumBodyLines) return null;
    content.push(textBlock(bodyLines, {
      x: safeMargin,
      y: config.bodyStartY,
      lineHeight: config.bodyLineHeight,
      fontSize: plan.platform === "xiaohongshu" ? 36 : 46,
      fontWeight: 500,
      fill: "#1f2937",
      className: "body-copy",
    }));
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-description" data-exact-copy-base64url="${encodedCopy}" data-copy-sha256="${copyFingerprint}">`,
    `<title id="card-title">${escapeXml(titleText)}</title>`,
    `<desc id="card-description">适合移动端阅读的研究笔记式信息卡。</desc>`,
    `<metadata id="copy-metadata">encoding=base64url;sha256=${copyFingerprint}</metadata>`,
    "<style>.cover-primary{font-family:\"Noto Serif SC\",\"Source Han Serif SC\",\"SimSun\",serif}.cover-secondary,.body-copy{font-family:\"Noto Sans SC\",\"Microsoft YaHei\",\"PingFang SC\",Arial,sans-serif}</style>",
    "<defs><pattern id=\"paper-grid\" width=\"54\" height=\"54\" patternUnits=\"userSpaceOnUse\"><path d=\"M 54 0 L 0 0 0 54\" fill=\"none\" stroke=\"#c8d0cb\" stroke-width=\"1\" opacity=\"0.16\"/></pattern></defs>",
    `<rect width="${width}" height="${height}" fill="#f6f2e8"/>`,
    `<rect width="${width}" height="${height}" fill="url(#paper-grid)"/>`,
    `<rect x="${safeMargin - 28}" y="${safeMargin}" width="8" height="${height - safeMargin * 2}" rx="4" fill="#2f6f73"/>`,
    `<path d="M ${safeMargin} ${safeMargin + 78} H ${width - safeMargin}" stroke="#15243a" stroke-width="3" opacity="0.86"/>`,
    ...content,
    "</svg>",
  ].join("");
  return { svg, copyFingerprint };
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_svg_render_blocked",
    blockers: [],
    sourceAssetPlanFingerprint: null,
    renderFingerprint: null,
    assets: [],
    assetsRendered: 0,
    filesWritten: false,
    generatedFiles: [],
    visualPreviewReady: false,
    readyForHumanVisualReview: false,
    humanVisualReviewRequired: true,
    visualAssetsReady: false,
    assetUploadReady: false,
    readyForDraftHandoff: false,
    browserOpenPerformed: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function renderPlatformTextVisualSvgAssets(assetPlan) {
  const plans = safeAssetPlan(assetPlan);
  if (!plans) return safeResult({ blockers: ["platform_text_visual_asset_plan_invalid_or_tampered"] });

  const assets = [];
  for (const plan of plans) {
    for (const card of plan.cards) {
      const rendered = svgForCard(plan, card);
      if (!rendered) {
        return safeResult({
          blockers: [`card_text_exceeds_svg_layout:${plan.platform}:${card.cardIndex}`],
          sourceAssetPlanFingerprint: assetPlan.assetPlanFingerprint,
        });
      }
      const filename = `${plan.platform}-${String(card.cardIndex).padStart(2, "0")}-${card.role}.svg`;
      assets.push({
        platform: plan.platform,
        cardIndex: card.cardIndex,
        role: card.role,
        filename,
        mimeType: "image/svg+xml",
        width: plan.canvas.width,
        height: plan.canvas.height,
        copyFingerprint: rendered.copyFingerprint,
        svgFingerprint: hash(rendered.svg),
        svgBytes: Buffer.byteLength(rendered.svg, "utf8"),
        svg: rendered.svg,
        renderStatus: "svg_rendered_in_memory",
      });
    }
  }

  const sourceAssetPlanFingerprint = assetPlan.assetPlanFingerprint;
  const assetManifest = assets.map(({ platform, cardIndex, role, filename, copyFingerprint, svgFingerprint, svgBytes }) => ({
    platform,
    cardIndex,
    role,
    filename,
    copyFingerprint,
    svgFingerprint,
    svgBytes,
  }));
  return safeResult({
    status: "platform_text_visual_svg_render_ready",
    sourceAssetPlanFingerprint,
    renderFingerprint: hash({ sourceAssetPlanFingerprint, assetManifest }),
    assets,
    assetsRendered: assets.length,
    visualPreviewReady: true,
    readyForHumanVisualReview: true,
  });
}
