import { createHash } from "node:crypto";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildXiaohongshuDraftPackagePlan({ project, readiness, platformCopy, manifestText, platformCopyText } = {}) {
  const blockers = [];
  const xiaohongshuEvidence = readiness?.platformPackageEvidence?.perPlatform?.find((item) => item.platform === "xiaohongshu");
  const platformFile = readiness?.platformPackageEvidence?.files?.find((item) => item.platform === "xiaohongshu");
  const videoArtifacts = (readiness?.artifactChecks ?? []).filter((artifact) => artifact.kind === "video" && artifact.verified === true && artifact.eligibleForProduction === true);

  if (!xiaohongshuEvidence?.ready || !platformFile?.verified) blockers.push("xiaohongshu_copy_not_verified");
  if (readiness?.mediaStatus !== "ready_for_review") blockers.push("rendered_media_not_ready");
  if (videoArtifacts.length === 0) blockers.push("production_video_missing");
  if (readiness?.eligible !== true) blockers.push("delivery_package_not_review_ready");
  if (typeof platformCopy?.title !== "string" || !platformCopy.title.trim() || platformCopy.title.trim().length > 20) blockers.push("xiaohongshu_title_invalid");
  if (typeof platformCopy?.caption !== "string" || !platformCopy.caption.trim()) blockers.push("xiaohongshu_caption_invalid");
  if (!Array.isArray(platformCopy?.hashtags) || platformCopy.hashtags.length === 0 || platformCopy.hashtags.length > 10) blockers.push("xiaohongshu_hashtags_invalid");
  if (typeof platformCopy?.ai_disclosure !== "string" || !platformCopy.ai_disclosure.trim()) blockers.push("ai_disclosure_missing");

  const packageFingerprint = typeof manifestText === "string" && typeof platformCopyText === "string"
    ? hash(JSON.stringify({ manifestSha256:hash(manifestText), platformCopySha256:hash(platformCopyText) }))
    : null;
  const mediaPaths = videoArtifacts.map((artifact) => `work/packages/${project}/${artifact.file}`);

  return {
    status: blockers.length === 0 ? "ready_for_human_draft_review" : "blocked",
    readyForHumanDraftReview: blockers.length === 0,
    blockers,
    project,
    packageFingerprint,
    content: {
      mode: "video",
      title: typeof platformCopy?.title === "string" ? platformCopy.title.trim() : null,
      caption: typeof platformCopy?.caption === "string" ? platformCopy.caption.trim() : null,
      tags: Array.isArray(platformCopy?.hashtags) ? platformCopy.hashtags.slice(0, 10) : [],
      aiDisclosure: typeof platformCopy?.ai_disclosure === "string" ? platformCopy.ai_disclosure.trim() : null,
      mediaPaths,
      coverPath: null,
    },
    humanReviewStillRequired: true,
    accountLoginChecked: false,
    uploadTriggered: false,
    draftSaveTriggered: false,
    draftVerified: false,
    publishTriggered: false,
    externalCalls: false,
    costIncurred: false,
  };
}

