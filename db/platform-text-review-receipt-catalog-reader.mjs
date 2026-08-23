const HASH = /^[a-f0-9]{64}$/;

export const READ_RECENT_PLATFORM_TEXT_DRAFT_REVIEWS_SQL = `SELECT
  review_fingerprint,
  created_at
FROM platform_text_draft_review_receipts
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 5`;

export const READ_RECENT_PLATFORM_TEXT_VISUAL_REVIEWS_SQL = `SELECT
  visual_review_fingerprint,
  created_at
FROM platform_text_visual_review_receipts
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 5`;

function safeResult(fields = {}) {
  return {
    status: "platform_text_review_receipt_catalog_blocked",
    blockers: [],
    draftReviews: [],
    visualReviews: [],
    catalogReadReady: false,
    candidatePairAvailable: false,
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

function mapRows(rows, fingerprintField, invalidBlocker) {
  if (!Array.isArray(rows) || rows.length > 5) return { blocker: invalidBlocker };
  const seen = new Set();
  const entries = [];
  for (const row of rows) {
    const fingerprint = row?.[fingerprintField];
    const createdAt = typeof row?.created_at === "string" ? row.created_at.trim() : "";
    if (!HASH.test(fingerprint ?? "") || !createdAt || seen.has(fingerprint)) {
      return { blocker: invalidBlocker };
    }
    seen.add(fingerprint);
    entries.push({ fingerprint, createdAt });
  }
  return { entries };
}

export function createPlatformTextReviewReceiptCatalogReader(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");

  return {
    async readRecent() {
      let draftResult;
      let visualResult;
      try {
        [draftResult, visualResult] = await Promise.all([
          d1.prepare(READ_RECENT_PLATFORM_TEXT_DRAFT_REVIEWS_SQL).all(),
          d1.prepare(READ_RECENT_PLATFORM_TEXT_VISUAL_REVIEWS_SQL).all(),
        ]);
      } catch {
        return safeResult({
          blockers: ["platform_text_review_receipt_catalog_query_failed"],
          databaseReadAttempted: true,
        });
      }

      const draft = mapRows(draftResult?.results, "review_fingerprint", "platform_text_draft_review_catalog_invalid");
      const visual = mapRows(visualResult?.results, "visual_review_fingerprint", "platform_text_visual_review_catalog_invalid");
      const blockers = [draft.blocker, visual.blocker].filter(Boolean);
      if (blockers.length) {
        return safeResult({ blockers, databaseReadAttempted: true, databaseReads: 2 });
      }

      return safeResult({
        status: "platform_text_review_receipt_catalog_ready",
        draftReviews: draft.entries,
        visualReviews: visual.entries,
        catalogReadReady: true,
        candidatePairAvailable: draft.entries.length > 0 && visual.entries.length > 0,
        databaseReadAttempted: true,
        databaseReads: 2,
      });
    },
  };
}
