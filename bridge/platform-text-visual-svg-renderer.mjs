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
  layout: "editorial_information_cards",
  background: "editorial_dark",
  typography: "headline_body_source",
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
    for (const character of paragraph) {
      const nextUnits = characterUnits(character);
      if (line && units + nextUnits > maximumUnits) {
        lines.push(line);
        line = "";
        units = 0;
      }
      line += character;
      units += nextUnits;
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
  const titleText = card.role === "cover" ? card.primaryText : `${config.platformLabel}第 ${card.cardIndex} 张`;
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
      fill: "#f8fafc",
      className: "cover-primary",
    }));
    const primaryHeight = (primaryLines.length - 1) * 112;
    content.push(textBlock(secondaryLines, {
      x: safeMargin,
      y: (plan.platform === "xiaohongshu" ? 520 : 690) + primaryHeight,
      lineHeight: 58,
      fontSize: 42,
      fontWeight: 500,
      fill: "#a7f3d0",
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
      fill: "#e2e8f0",
      className: "body-copy",
    }));
  }

  const footer = card.role === "cover" ? "来源锁定 · 人工审核文案" : "原文卡片 · 视觉仍待人工复核";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-description" data-exact-copy-base64url="${encodedCopy}" data-copy-sha256="${copyFingerprint}">`,
    `<title id="card-title">${escapeXml(titleText)}</title>`,
    `<desc id="card-description">${escapeXml(config.platformLabel)}静态信息卡；文案已审核，视觉待人工复核。</desc>`,
    `<metadata id="copy-metadata">encoding=base64url;sha256=${copyFingerprint}</metadata>`,
    "<style>text{font-family:\"Noto Sans SC\",\"Microsoft YaHei\",\"PingFang SC\",Arial,sans-serif}</style>",
    "<defs><linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#07111f\"/><stop offset=\"0.58\" stop-color=\"#111827\"/><stop offset=\"1\" stop-color=\"#0f3d3e\"/></linearGradient></defs>",
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<circle cx="${width - safeMargin}" cy="${safeMargin}" r="112" fill="#34d399" opacity="0.12"/>`,
    `<path d="M ${safeMargin} ${safeMargin + 76} H ${width - safeMargin}" stroke="#34d399" stroke-width="4" opacity="0.72"/>`,
    `<text x="${safeMargin}" y="${safeMargin + 34}" fill="#6ee7b7" font-size="30" font-weight="700" letter-spacing="3">知绘观察 · ${escapeXml(config.platformLabel)}</text>`,
    ...content,
    `<text x="${safeMargin}" y="${config.footerY}" fill="#94a3b8" font-size="28" font-weight="500">${escapeXml(footer)}</text>`,
    `<text x="${width - safeMargin}" y="${config.footerY}" fill="#f8fafc" font-size="30" font-weight="700" text-anchor="end">${String(card.cardIndex).padStart(2, "0")} / ${String(plan.cards.length).padStart(2, "0")}</text>`,
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
