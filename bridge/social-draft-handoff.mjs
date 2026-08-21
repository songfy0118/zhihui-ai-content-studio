import { createHash } from "node:crypto";

const PACKAGE_FINGERPRINT = /^[a-f0-9]{64}$/;
const SUPPORTED_PLATFORM = "xiaohongshu";
const SUPPORTED_MODES = new Set(["video", "note"]);
export const SOCIAL_DRAFT_PROTOCOL_VERSION = 1;

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 24))
    .filter(Boolean)
    .slice(0, 10);
}

function cleanMediaPaths(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 1_024))
    .filter(Boolean)
    .slice(0, 18);
}

function buildHandoffFingerprint(envelope) {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function buildSocialDraftHandoffPlan({
  platform,
  accountLabel,
  content,
  review,
  visibleBrowser = true,
  userApprovedDraftSave = false,
  approvedHandoffFingerprint = null,
  assetVerification = null,
} = {}) {
  const blockers = [];
  const normalizedPlatform = cleanText(platform, 32)?.toLowerCase() ?? null;
  const normalizedAccountLabel = cleanText(accountLabel, 64);
  const mode = cleanText(content?.mode, 16)?.toLowerCase() ?? null;
  const title = cleanText(content?.title, 20);
  const caption = cleanText(content?.caption, 1_000);
  const tags = cleanTags(content?.tags);
  const mediaPaths = cleanMediaPaths(content?.mediaPaths);
  const coverPath = cleanText(content?.coverPath, 1_024);
  const packageFingerprint = PACKAGE_FINGERPRINT.test(content?.packageFingerprint ?? "")
    ? content.packageFingerprint
    : null;
  const assetFingerprint = PACKAGE_FINGERPRINT.test(content?.assetFingerprint ?? "")
    ? content.assetFingerprint
    : null;
  const reviewedFingerprint = PACKAGE_FINGERPRINT.test(review?.packageFingerprint ?? "")
    ? review.packageFingerprint
    : null;

  if (normalizedPlatform !== SUPPORTED_PLATFORM) blockers.push("platform_not_supported_for_draft_pilot");
  if (!normalizedAccountLabel) blockers.push("account_label_missing");
  if (!SUPPORTED_MODES.has(mode)) blockers.push("content_mode_unsupported");
  if (!title) blockers.push("title_missing_or_too_long");
  if (!caption) blockers.push("caption_missing_or_too_long");
  if (mediaPaths.length === 0) blockers.push("media_missing");
  if (!packageFingerprint) blockers.push("package_fingerprint_missing");
  if (assetVerification?.verified !== true) blockers.push("asset_verification_missing");
  if (assetVerification?.verified === true && assetFingerprint !== assetVerification.assetFingerprint) blockers.push("asset_fingerprint_mismatch");
  if (review?.status !== "accepted") blockers.push("human_review_not_accepted");
  if (packageFingerprint && reviewedFingerprint !== packageFingerprint) blockers.push("review_fingerprint_mismatch");
  if (visibleBrowser !== true) blockers.push("visible_browser_required");

  const envelope = blockers.length === 0
    ? {
        platform: normalizedPlatform,
        accountLabel: normalizedAccountLabel,
        mode,
        title,
        caption,
        tags,
        mediaPaths,
        coverPath,
        packageFingerprint,
        assetFingerprint,
        visibleBrowser: true,
        action: "save_draft",
      }
    : null;
  const handoffFingerprint = envelope ? buildHandoffFingerprint(envelope) : null;

  if (blockers.length === 0 && userApprovedDraftSave !== true) blockers.push("explicit_draft_save_approval_missing");
  if (
    blockers.length === 0
    && userApprovedDraftSave === true
    && approvedHandoffFingerprint !== handoffFingerprint
  ) blockers.push("handoff_fingerprint_mismatch");

  const eligible = blockers.length === 0;
  return {
    status: eligible ? "approved_for_single_draft_handoff" : "blocked",
    eligible,
    blockers,
    platform: normalizedPlatform,
    accountLabel: normalizedAccountLabel,
    content: {
      mode,
      title,
      caption,
      tags,
      mediaPaths,
      coverPath,
      packageFingerprint,
      assetFingerprint,
    },
    review: {
      status: review?.status === "accepted" ? "accepted" : "not_accepted",
      packageFingerprint: reviewedFingerprint,
    },
    handoffFingerprint,
    approvedHandoffFingerprint: PACKAGE_FINGERPRINT.test(approvedHandoffFingerprint ?? "")
      ? approvedHandoffFingerprint
      : null,
    approvalScope: "single_xiaohongshu_draft_save",
    visibleBrowserRequired: true,
    interactiveLoginRequired: true,
    verificationBypassAllowed: false,
    cookieExportAllowed: false,
    draftOnly: true,
    publishAllowed: false,
    publishActionImplemented: false,
    browserOpened: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaveTriggered: false,
    draftVerified: false,
    publishTriggered: false,
    externalCalls: false,
    costIncurred: false,
  };
}
