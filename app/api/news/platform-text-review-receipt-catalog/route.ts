import { getD1 } from "../../../../db";
import { createPlatformTextReviewReceiptCatalogReader } from "../../../../db/platform-text-review-receipt-catalog-reader.mjs";

function closedResult(blocker: string) {
  return {
    status: "platform_text_review_receipt_catalog_blocked",
    blockers: [blocker],
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
  };
}

export async function GET() {
  try {
    const result = await createPlatformTextReviewReceiptCatalogReader(getD1()).readRecent();
    return Response.json(result, { status: result.catalogReadReady ? 200 : 503 });
  } catch {
    return Response.json(closedResult("platform_text_review_receipt_catalog_storage_unavailable"), { status: 503 });
  }
}
