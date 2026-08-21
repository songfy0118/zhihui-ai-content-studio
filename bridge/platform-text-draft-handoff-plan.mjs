import { createHash } from "node:crypto";

import { PLATFORM_TEXT_DRAFT_REVIEW_CHECKS } from "./platform-text-draft-review-preview.mjs";

const HASH = /^[a-f0-9]{64}$/;
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);
const CREATOR_ENTRIES = Object.freeze({
  xiaohongshu: "https://creator.xiaohongshu.com/publish",
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function safeDraft(platform, value) {
  if (
    !value
    || value.platform !== platform
    || value.status !== "preview_not_saved"
    || value.copyOrigin !== "human_packaging_plus_exact_accepted_claims"
    || !cleanText(value.contentMode, 128)
    || !cleanText(value.title, 60)
    || !cleanText(value.body, 20_000)
    || !cleanText(value.coverText, 60)
    || !cleanText(value.sourceNote, 10_000)
    || !Array.isArray(value.hashtags)
    || value.hashtags.length < 2
    || value.hashtags.length > 8
    || !HASH.test(value.draftFingerprint ?? "")
  ) return null;
  const { draftFingerprint, ...content } = value;
  return hash(content) === draftFingerprint ? value : null;
}

function safeDraftPreview(value) {
  if (
    value?.status !== "platform_text_draft_preview_ready"
    || value?.readyForHumanDraftReview !== true
    || value?.draftPreviewBuilt !== true
    || !HASH.test(value?.blueprintFingerprint ?? "")
    || !HASH.test(value?.previewFingerprint ?? "")
    || !value?.platformDrafts
    || typeof value.platformDrafts !== "object"
  ) return null;
  const platforms = Object.keys(value.platformDrafts).sort((left, right) => (PLATFORM_ORDER.get(left) ?? 99) - (PLATFORM_ORDER.get(right) ?? 99));
  if (platforms.length < 1 || platforms.length > 2 || platforms.some((platform) => !CREATOR_ENTRIES[platform])) return null;
  const platformDrafts = {};
  for (const platform of platforms) {
    const draft = safeDraft(platform, value.platformDrafts[platform]);
    if (!draft) return null;
    platformDrafts[platform] = draft;
  }
  return hash({ blueprintFingerprint: value.blueprintFingerprint, platformDrafts }) === value.previewFingerprint
    ? { platforms, platformDrafts }
    : null;
}

function safeReviewRead(value, draftPreview, platforms) {
  const receipt = value?.receipt;
  if (
    value?.status !== "platform_text_draft_review_read_ready"
    || value?.found !== true
    || value?.durableHumanReview !== true
    || value?.durableReviewInputReady !== true
    || !HASH.test(value?.readFingerprint ?? "")
    || !receipt
    || receipt.status !== "active"
    || receipt.draftPreviewFingerprint !== draftPreview.previewFingerprint
    || receipt.blueprintFingerprint !== draftPreview.blueprintFingerprint
    || !HASH.test(receipt.reviewFingerprint ?? "")
    || receipt.receiptId !== `ptdrp_${receipt.reviewFingerprint}`
    || receipt.idempotencyKey !== `platform-text-draft-review:${receipt.reviewFingerprint}`
    || !cleanText(receipt.createdAt, 128)
    || !Array.isArray(receipt.reviewedPlatforms)
    || receipt.reviewedPlatforms.length !== platforms.length
    || hash(receipt) !== value.readFingerprint
  ) return null;

  const fingerprintPlatforms = [];
  const seen = new Set();
  for (const review of receipt.reviewedPlatforms) {
    const checkNames = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks) ? Object.keys(review.checks) : [];
    if (
      !platforms.includes(review?.platform)
      || seen.has(review?.platform)
      || review?.draftFingerprint !== draftPreview.platformDrafts[review?.platform]?.draftFingerprint
      || !cleanText(review?.reviewNote, 500)
      || review.reviewNote.trim().length < 8
      || review?.status !== "human_reviewed_persisted"
      || !cleanText(review?.createdAt, 128)
      || checkNames.length !== PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.length
      || checkNames.some((check) => !PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.includes(check))
      || PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.some((check) => review?.checks?.[check] !== true)
    ) return null;
    seen.add(review.platform);
    fingerprintPlatforms.push({
      platform: review.platform,
      draftFingerprint: review.draftFingerprint,
      reviewNote: review.reviewNote.trim(),
      checks: Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true])),
      status: "human_reviewed_in_preview_not_persisted",
    });
  }
  fingerprintPlatforms.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  const recomputed = hash({
    draftPreviewFingerprint: receipt.draftPreviewFingerprint,
    blueprintFingerprint: receipt.blueprintFingerprint,
    reviewedPlatforms: fingerprintPlatforms,
  });
  return recomputed === receipt.reviewFingerprint ? receipt : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_draft_handoff_plan_blocked",
    blockers: [],
    handoffFingerprint: null,
    handoffItems: [],
    copyHandoffReady: false,
    eligibleForVisibleBrowserOpenAuthorization: false,
    readyForDraftHandoff: false,
    visualAssetsRequired: true,
    assetUploadReady: false,
    browserOpenPerformed: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    databaseWrites: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextDraftHandoffPlan(draftPreview, reviewRead) {
  const blockers = [];
  const current = safeDraftPreview(draftPreview);
  if (!current) blockers.push("platform_text_draft_preview_invalid_or_tampered");
  const receipt = current ? safeReviewRead(reviewRead, draftPreview, current.platforms) : null;
  if (!receipt) blockers.push("durable_platform_text_draft_review_invalid_or_stale");
  if (blockers.length || !current || !receipt) return safeResult({ blockers });

  const handoffItems = current.platforms.map((platform) => {
    const draft = current.platformDrafts[platform];
    return {
      platform,
      creatorEntryUrl: CREATOR_ENTRIES[platform],
      interactionMode: "visible_browser_manual",
      contentMode: draft.contentMode,
      title: draft.title,
      body: draft.body,
      coverText: draft.coverText,
      hashtags: [...draft.hashtags],
      sourceNote: draft.sourceNote,
      draftFingerprint: draft.draftFingerprint,
      reviewFingerprint: receipt.reviewFingerprint,
      requiredHumanSteps: [
        "open_official_creator_page_after_separate_authorization",
        "verify_visible_account_identity",
        "prepare_and_review_visual_assets",
        "copy_reviewed_text_into_creator_form",
        "request_separate_authorization_before_saving_draft",
      ],
      visualAssets: [],
      draftSaveAuthorized: false,
    };
  });
  const handoffFingerprint = hash({
    draftPreviewFingerprint: draftPreview.previewFingerprint,
    reviewFingerprint: receipt.reviewFingerprint,
    handoffItems,
  });
  return safeResult({
    status: "platform_text_draft_handoff_plan_ready",
    blockers: [],
    handoffFingerprint,
    handoffItems,
    copyHandoffReady: true,
    eligibleForVisibleBrowserOpenAuthorization: true,
  });
}
