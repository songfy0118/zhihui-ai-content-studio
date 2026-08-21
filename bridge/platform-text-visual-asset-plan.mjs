import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const REQUIRED_HUMAN_STEPS = Object.freeze([
  "open_official_creator_page_after_separate_authorization",
  "verify_visible_account_identity",
  "prepare_and_review_visual_assets",
  "copy_reviewed_text_into_creator_form",
  "request_separate_authorization_before_saving_draft",
]);
const PLATFORM_CONFIG = Object.freeze({
  xiaohongshu: Object.freeze({
    creatorEntryUrl: "https://creator.xiaohongshu.com/publish",
    canvas: Object.freeze({ width: 1080, height: 1440, aspectRatio: "3:4", safeMargin: 96 }),
    bodyCharacterLimit: 420,
    maximumBodyCards: 8,
  }),
  douyin: Object.freeze({
    creatorEntryUrl: "https://creator.douyin.com/creator-micro/content/upload",
    canvas: Object.freeze({ width: 1080, height: 1920, aspectRatio: "9:16", safeMargin: 108 }),
    bodyCharacterLimit: 320,
    maximumBodyCards: 8,
  }),
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validText(value, maxLength) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function safeHandoffItem(value) {
  const config = PLATFORM_CONFIG[value?.platform];
  if (
    !config
    || value.creatorEntryUrl !== config.creatorEntryUrl
    || value.interactionMode !== "visible_browser_manual"
    || !validText(value.contentMode, 128)
    || !validText(value.title, 60)
    || !validText(value.body, 20_000)
    || !validText(value.coverText, 60)
    || !validText(value.sourceNote, 10_000)
    || !Array.isArray(value.hashtags)
    || value.hashtags.length < 2
    || value.hashtags.length > 8
    || value.hashtags.some((hashtag) => !validText(hashtag, 40))
    || !HASH.test(value.draftFingerprint ?? "")
    || !HASH.test(value.reviewFingerprint ?? "")
    || !sameArray(value.requiredHumanSteps, REQUIRED_HUMAN_STEPS)
    || !Array.isArray(value.visualAssets)
    || value.visualAssets.length !== 0
    || value.draftSaveAuthorized !== false
  ) return null;

  const draftContent = {
    platform: value.platform,
    contentMode: value.contentMode,
    title: value.title,
    body: value.body,
    coverText: value.coverText,
    hashtags: value.hashtags,
    sourceNote: value.sourceNote,
    copyOrigin: "human_packaging_plus_exact_accepted_claims",
    status: "preview_not_saved",
  };
  return hash(draftContent) === value.draftFingerprint ? value : null;
}

function safeHandoffPlan(value) {
  if (
    value?.status !== "platform_text_draft_handoff_plan_ready"
    || value?.copyHandoffReady !== true
    || value?.eligibleForVisibleBrowserOpenAuthorization !== true
    || value?.visualAssetsRequired !== true
    || value?.assetUploadReady !== false
    || value?.readyForDraftHandoff !== false
    || !HASH.test(value?.draftPreviewFingerprint ?? "")
    || !HASH.test(value?.reviewFingerprint ?? "")
    || !HASH.test(value?.handoffFingerprint ?? "")
    || !Array.isArray(value?.handoffItems)
    || value.handoffItems.length < 1
    || value.handoffItems.length > 2
  ) return null;

  const items = [];
  const seen = new Set();
  for (const candidate of value.handoffItems) {
    const item = safeHandoffItem(candidate);
    if (!item || seen.has(item.platform) || item.reviewFingerprint !== value.reviewFingerprint) return null;
    seen.add(item.platform);
    items.push(item);
  }
  items.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  if (items.some((item, index) => item !== value.handoffItems[index])) return null;
  const expectedFingerprint = hash({
    draftPreviewFingerprint: value.draftPreviewFingerprint,
    reviewFingerprint: value.reviewFingerprint,
    handoffItems: value.handoffItems,
  });
  return expectedFingerprint === value.handoffFingerprint ? items : null;
}

function chunkExactText(text, limit, maximumChunks) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const minimumBoundary = start + Math.floor(limit * 0.55);
      let bestBoundary = -1;
      for (const boundary of ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", "，", ", "]) {
        const position = text.lastIndexOf(boundary, end - boundary.length);
        const candidate = position + boundary.length;
        if (position >= minimumBoundary && candidate > bestBoundary) bestBoundary = candidate;
      }
      if (bestBoundary > start) end = bestBoundary;
    }
    chunks.push({ exactText: text.slice(start, end), textStart: start, textEnd: end });
    if (chunks.length > maximumChunks) return null;
    start = end;
  }
  return chunks;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_visual_asset_plan_blocked",
    blockers: [],
    sourceHandoffFingerprint: null,
    assetPlanFingerprint: null,
    platformPlans: [],
    plannedAssetCount: 0,
    exactCopyOnly: true,
    assetsGenerated: 0,
    generatedFiles: [],
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

export function buildPlatformTextVisualAssetPlan(handoffPlan) {
  const items = safeHandoffPlan(handoffPlan);
  if (!items) return safeResult({ blockers: ["platform_text_draft_handoff_plan_invalid_or_tampered"] });

  const platformPlans = [];
  for (const item of items) {
    const config = PLATFORM_CONFIG[item.platform];
    const bodyChunks = chunkExactText(item.body, config.bodyCharacterLimit, config.maximumBodyCards);
    if (!bodyChunks) {
      return safeResult({
        blockers: [`platform_copy_exceeds_visual_card_budget:${item.platform}`],
        sourceHandoffFingerprint: handoffPlan.handoffFingerprint,
      });
    }
    const cards = [
      {
        cardIndex: 1,
        role: "cover",
        primaryText: item.coverText,
        secondaryText: item.title,
        renderStatus: "planned_not_generated",
      },
      ...bodyChunks.map((chunk, index) => ({
        cardIndex: index + 2,
        role: "body",
        ...chunk,
        renderStatus: "planned_not_generated",
      })),
    ];
    platformPlans.push({
      platform: item.platform,
      canvas: { ...config.canvas },
      style: {
        layout: "editorial_information_cards",
        background: "editorial_dark",
        typography: "headline_body_source",
        motion: "not_applicable_to_static_cards",
      },
      caption: {
        title: item.title,
        body: item.body,
        hashtags: [...item.hashtags],
        sourceNote: item.sourceNote,
      },
      draftFingerprint: item.draftFingerprint,
      reviewFingerprint: item.reviewFingerprint,
      cards,
      plannedAssetCount: cards.length,
      renderStatus: "planned_not_generated",
    });
  }

  const sourceHandoffFingerprint = handoffPlan.handoffFingerprint;
  const assetPlanFingerprint = hash({ sourceHandoffFingerprint, platformPlans });
  return safeResult({
    status: "platform_text_visual_asset_plan_ready",
    sourceHandoffFingerprint,
    assetPlanFingerprint,
    platformPlans,
    plannedAssetCount: platformPlans.reduce((total, plan) => total + plan.plannedAssetCount, 0),
  });
}
