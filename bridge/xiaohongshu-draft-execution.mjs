const ALLOWED_BROWSER_STEPS = [
  "open_creator_publish_page",
  "upload_verified_assets",
  "fill_title_caption_tags",
  "set_ai_content_disclosure",
  "save_to_drafts",
  "open_draft_list",
  "verify_draft_receipt",
];

export function planXiaohongshuDraftExecution({ handoffPlan, loginEvidence, executionRequested = false } = {}) {
  const blockers = [];
  if (handoffPlan?.eligible !== true || handoffPlan?.draftOnly !== true || handoffPlan?.publishAllowed !== false) blockers.push("draft_handoff_not_approved");
  if (loginEvidence?.source !== "visible_browser_inspection" || loginEvidence?.creatorCenterAuthenticated !== true) blockers.push("interactive_login_not_verified");
  if (typeof loginEvidence?.accountLabel !== "string" || !loginEvidence.accountLabel.trim()) blockers.push("account_label_not_verified");
  if (executionRequested !== true) blockers.push("draft_execution_not_requested");

  const readyForBrowserAdapter = blockers.length === 0;
  return {
    state: readyForBrowserAdapter ? "ready_for_visible_browser_adapter" : "blocked",
    readyForBrowserAdapter,
    blockers,
    platform: "xiaohongshu",
    action: "save_draft",
    handoffFingerprint: handoffPlan?.handoffFingerprint ?? null,
    accountLabel: typeof loginEvidence?.accountLabel === "string" ? loginEvidence.accountLabel.trim() : null,
    allowedBrowserSteps: ALLOWED_BROWSER_STEPS,
    forbiddenBrowserSteps: ["click_publish", "schedule_publish", "export_cookie", "bypass_verification", "solve_captcha_without_user"],
    visibleBrowserRequired: true,
    browserAdapterImplemented: false,
    browserAdapterCalled: false,
    browserOpened: false,
    uploadTriggered: false,
    draftSaveTriggered: false,
    draftVerified: false,
    publishAllowed: false,
    publishActionImplemented: false,
    publishTriggered: false,
    externalCalls: false,
    costIncurred: false,
  };
}

