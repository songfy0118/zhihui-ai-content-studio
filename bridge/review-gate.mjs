export const REQUIRED_REVIEW_CHECKS = Object.freeze([
  "facts_verified",
  "visuals_checked",
  "audio_subtitles_checked",
  "ai_label_enabled",
  "commercial_rights_confirmed",
  "platform_copy_checked",
  "human_publish_confirmation",
]);

export function validateReviewApproval(payload) {
  if (!payload || payload.action !== "approve_for_manual_publish") {
    return { ok: false, error: "Only manual-publish approval is supported" };
  }
  if (typeof payload.jobId !== "string" || !payload.jobId.trim()) {
    return { ok: false, error: "jobId is required" };
  }

  const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};
  const missing = REQUIRED_REVIEW_CHECKS.filter((check) => checks[check] !== true);
  if (missing.length) {
    return { ok: false, error: "Every human-review check must be confirmed", missing };
  }

  const confirmedChecks = Object.fromEntries(REQUIRED_REVIEW_CHECKS.map((check) => [check, true]));
  return { ok: true, jobId: payload.jobId, checks: confirmedChecks };
}

export function validateReviewableStatus(status) {
  if (status !== "review_pending") {
    return { ok: false, error: "Job must be review_pending before human approval", status };
  }
  return { ok: true, status };
}
