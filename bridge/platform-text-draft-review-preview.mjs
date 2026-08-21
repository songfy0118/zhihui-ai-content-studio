import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const SUPPORTED_PLATFORMS = new Set(["xiaohongshu", "douyin"]);
const PLATFORM_ORDER = new Map([["xiaohongshu", 0], ["douyin", 1]]);

export const PLATFORM_TEXT_DRAFT_REVIEW_CONFIRMATION = "CONFIRM_CURRENT_PLATFORM_TEXT_DRAFTS";
export const PLATFORM_TEXT_DRAFT_REVIEW_CHECKS = Object.freeze([
  "title_and_cover_approved",
  "opening_and_closing_approved",
  "accepted_claim_wording_approved",
  "uncertainty_notes_approved",
  "source_note_approved",
  "human_packaging_semantics_approved",
  "no_performance_promises_approved",
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
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

function safePreview(value) {
  if (
    value?.status !== "platform_text_draft_preview_ready"
    || value?.readyForHumanDraftReview !== true
    || value?.draftPreviewBuilt !== true
    || !HASH.test(value?.blueprintFingerprint ?? "")
    || !HASH.test(value?.previewFingerprint ?? "")
    || !value?.platformDrafts
    || typeof value.platformDrafts !== "object"
  ) return null;
  const platforms = Object.keys(value.platformDrafts)
    .sort((left, right) => (PLATFORM_ORDER.get(left) ?? 99) - (PLATFORM_ORDER.get(right) ?? 99));
  if (platforms.length === 0 || platforms.some((platform) => !SUPPORTED_PLATFORMS.has(platform))) return null;
  const platformDrafts = {};
  for (const platform of platforms) {
    const draft = safeDraft(platform, value.platformDrafts[platform]);
    if (!draft) return null;
    platformDrafts[platform] = draft;
  }
  const recomputed = hash({ blueprintFingerprint: value.blueprintFingerprint, platformDrafts });
  return recomputed === value.previewFingerprint ? { platforms, platformDrafts } : null;
}

function safeResult(fields = {}) {
  return {
    status: "platform_text_draft_review_preview_blocked",
    blockers: [],
    receiptPreview: null,
    reviewFingerprint: null,
    idempotencyKey: null,
    reviewedPlatformCountInPreview: 0,
    eligibleForAuthorizedReviewSave: false,
    reviewPersisted: false,
    readyForDraftHandoff: false,
    draftSaved: false,
    databaseWrites: false,
    semanticVerification: "not_run",
    automatedFactVerification: false,
    modelCalls: 0,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

export function buildPlatformTextDraftReviewPreview(draftPreview, reviews = [], {
  confirmedPreviewFingerprint = null,
  confirmation = null,
} = {}) {
  const blockers = [];
  const current = safePreview(draftPreview);
  if (!current) blockers.push("platform_text_draft_preview_invalid_or_tampered");
  if (confirmedPreviewFingerprint !== draftPreview?.previewFingerprint) blockers.push("platform_text_draft_preview_fingerprint_mismatch");
  if (confirmation !== PLATFORM_TEXT_DRAFT_REVIEW_CONFIRMATION) blockers.push("platform_text_draft_review_confirmation_invalid");
  if (!Array.isArray(reviews) || reviews.length !== (current?.platforms.length ?? 0)) blockers.push("platform_text_draft_reviews_incomplete");

  const reviewedPlatforms = [];
  const seenPlatforms = new Set();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const platform = cleanText(review?.platform, 32)?.toLowerCase();
    const reviewBlockers = [];
    if (!current?.platforms.includes(platform) || seenPlatforms.has(platform)) reviewBlockers.push("platform_not_current_or_duplicate");
    seenPlatforms.add(platform);
    if (review?.approve !== true) reviewBlockers.push("explicit_platform_approval_required");
    if (review?.draftFingerprint !== current?.platformDrafts?.[platform]?.draftFingerprint) reviewBlockers.push("platform_draft_fingerprint_mismatch");
    const note = cleanText(review?.reviewNote, 500);
    if (!note || note.length < 8) reviewBlockers.push("review_note_required");
    const checks = review?.checks && typeof review.checks === "object" && !Array.isArray(review.checks) ? review.checks : {};
    if (Object.keys(checks).some((check) => !PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.includes(check))) reviewBlockers.push("unexpected_review_checks");
    if (PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.some((check) => checks[check] !== true)) reviewBlockers.push("human_review_checks_incomplete");
    if (reviewBlockers.length) {
      blockers.push(...reviewBlockers.map((blocker) => `${platform ?? "missing"}:${blocker}`));
      continue;
    }
    reviewedPlatforms.push({
      platform,
      draftFingerprint: review.draftFingerprint,
      reviewNote: note,
      checks: Object.fromEntries(PLATFORM_TEXT_DRAFT_REVIEW_CHECKS.map((check) => [check, true])),
      status: "human_reviewed_in_preview_not_persisted",
    });
  }
  reviewedPlatforms.sort((left, right) => (PLATFORM_ORDER.get(left.platform) ?? 99) - (PLATFORM_ORDER.get(right.platform) ?? 99));
  if (blockers.length || !current) return safeResult({ blockers: [...new Set(blockers)] });

  const reviewFingerprint = hash({
    draftPreviewFingerprint: draftPreview.previewFingerprint,
    blueprintFingerprint: draftPreview.blueprintFingerprint,
    reviewedPlatforms,
  });
  return safeResult({
    status: "platform_text_draft_review_preview_ready",
    blockers: [],
    receiptPreview: {
      receiptId: `ptdrp_${reviewFingerprint}`,
      draftPreviewFingerprint: draftPreview.previewFingerprint,
      blueprintFingerprint: draftPreview.blueprintFingerprint,
      reviewedPlatforms,
      status: "preview_not_persisted",
    },
    reviewFingerprint,
    idempotencyKey: `platform-text-draft-review:${reviewFingerprint}`,
    reviewedPlatformCountInPreview: reviewedPlatforms.length,
    eligibleForAuthorizedReviewSave: true,
    semanticVerification: "human_attestation_preview",
  });
}
