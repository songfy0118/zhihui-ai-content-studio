function safeResult(fields = {}) {
  return {
    status: "platform_text_review_storage_readiness_blocked",
    blockers: [],
    draftReviewStorage: null,
    visualReviewStorage: null,
    storageInspectionReady: false,
    bothSchemasVerified: false,
    migrationAuthorizationRequired: true,
    migrationApplyImplemented: false,
    migrationApplyPerformed: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    browserOpenPerformed: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaved: false,
    publishTriggered: false,
    businessResult: false,
    ...fields,
  };
}

function summarize(value, migrationTag) {
  const status = ["missing", "partial", "verified"].includes(value?.status) ? value.status : "unknown";
  return {
    status,
    verified: status === "verified" && value?.verified === true,
    missingObjectCount: Array.isArray(value?.missingObjects) ? value.missingObjects.length : 0,
    missingColumnCount: Array.isArray(value?.missingColumns) ? value.missingColumns.length : 0,
    migrationTag,
  };
}

export async function readPlatformTextReviewStorageReadiness({
  inspectDraftReviewStorage,
  inspectVisualReviewStorage,
} = {}) {
  if (typeof inspectDraftReviewStorage !== "function" || typeof inspectVisualReviewStorage !== "function") {
    return safeResult({ blockers: ["platform_text_review_storage_inspectors_invalid"] });
  }

  let draft;
  let visual;
  try {
    [draft, visual] = await Promise.all([inspectDraftReviewStorage(), inspectVisualReviewStorage()]);
  } catch {
    return safeResult({
      blockers: ["platform_text_review_storage_inspection_failed"],
      databaseReadAttempted: true,
    });
  }

  const draftSummary = summarize(draft, "0009_chunky_praxagora");
  const visualSummary = summarize(visual, "0010_tranquil_donald_blake");
  const validStatuses = draftSummary.status !== "unknown" && visualSummary.status !== "unknown";
  const blockers = [];
  if (!validStatuses) blockers.push("platform_text_review_storage_status_invalid");
  if (draftSummary.status === "partial") blockers.push("platform_text_draft_review_storage_partial");
  if (visualSummary.status === "partial") blockers.push("platform_text_visual_review_storage_partial");
  const bothVerified = draftSummary.verified && visualSummary.verified;

  return safeResult({
    status: blockers.length ? "platform_text_review_storage_readiness_blocked" : "platform_text_review_storage_readiness_ready",
    blockers,
    draftReviewStorage: draftSummary,
    visualReviewStorage: visualSummary,
    storageInspectionReady: blockers.length === 0,
    bothSchemasVerified: bothVerified,
    migrationAuthorizationRequired: !bothVerified,
    databaseReadAttempted: true,
    databaseReads: 7,
  });
}
