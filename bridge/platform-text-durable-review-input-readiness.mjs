const HASH = /^[a-f0-9]{64}$/;

function safeResult(fields = {}) {
  return {
    status: "platform_text_durable_review_inputs_blocked",
    blockers: [],
    draftReviewFingerprint: null,
    visualReviewFingerprint: null,
    draftReview: null,
    visualReview: null,
    durableDraftReviewReady: false,
    durableVisualReviewReady: false,
    inputsReady: false,
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

function summarizeDraftReview(value) {
  return {
    status: value?.status ?? "platform_text_draft_review_read_blocked",
    found: value?.found === true,
    reviewedPlatforms: Number(value?.reviewedPlatforms ?? 0),
    durableHumanReview: value?.durableHumanReview === true,
    durableReviewInputReady: value?.durableReviewInputReady === true,
  };
}

function summarizeVisualReview(value) {
  return {
    status: value?.status ?? "platform_text_visual_review_read_blocked",
    found: value?.found === true,
    reviewedPlatforms: Number(value?.reviewedPlatforms ?? 0),
    reviewedAssets: Number(value?.reviewedAssets ?? 0),
    durableHumanReview: value?.durableHumanReview === true,
    durableVisualReviewInputReady: value?.durableVisualReviewInputReady === true,
  };
}

export async function readPlatformTextDurableReviewInputReadiness({
  draftReviewFingerprint,
  visualReviewFingerprint,
} = {}, {
  draftReviewReader,
  visualReviewReader,
} = {}) {
  const blockers = [];
  if (!HASH.test(draftReviewFingerprint ?? "")) blockers.push("platform_text_draft_review_fingerprint_invalid");
  if (!HASH.test(visualReviewFingerprint ?? "")) blockers.push("platform_text_visual_review_fingerprint_invalid");
  if (blockers.length) return safeResult({ blockers });
  if (
    typeof draftReviewReader?.readByReviewFingerprint !== "function"
    || typeof visualReviewReader?.readByVisualReviewFingerprint !== "function"
  ) return safeResult({ blockers: ["platform_text_durable_review_readers_invalid"] });

  let draftRead;
  let visualRead;
  try {
    [draftRead, visualRead] = await Promise.all([
      draftReviewReader.readByReviewFingerprint(draftReviewFingerprint),
      visualReviewReader.readByVisualReviewFingerprint(visualReviewFingerprint),
    ]);
  } catch {
    return safeResult({
      blockers: ["platform_text_durable_review_read_failed"],
      draftReviewFingerprint,
      visualReviewFingerprint,
      databaseReadAttempted: true,
    });
  }

  const draftReady = draftRead?.status === "platform_text_draft_review_read_ready"
    && draftRead?.durableReviewInputReady === true
    && draftRead?.receipt?.reviewFingerprint === draftReviewFingerprint;
  const visualReady = visualRead?.status === "platform_text_visual_review_read_ready"
    && visualRead?.durableVisualReviewInputReady === true
    && visualRead?.receipt?.visualReviewFingerprint === visualReviewFingerprint;
  if (!draftReady) blockers.push(...(draftRead?.blockers?.length ? draftRead.blockers : ["durable_platform_text_draft_review_invalid_or_stale"]));
  if (!visualReady) blockers.push(...(visualRead?.blockers?.length ? visualRead.blockers : ["durable_platform_text_visual_review_invalid_or_stale"]));

  return safeResult({
    status: blockers.length ? "platform_text_durable_review_inputs_blocked" : "platform_text_durable_review_inputs_ready",
    blockers: [...new Set(blockers)],
    draftReviewFingerprint,
    visualReviewFingerprint,
    draftReview: summarizeDraftReview(draftRead),
    visualReview: summarizeVisualReview(visualRead),
    durableDraftReviewReady: draftReady,
    durableVisualReviewReady: visualReady,
    inputsReady: draftReady && visualReady,
    databaseReadAttempted: draftRead?.databaseReadAttempted === true || visualRead?.databaseReadAttempted === true,
    databaseReads: Number(draftRead?.databaseReads ?? 0) + Number(visualRead?.databaseReads ?? 0),
  });
}
