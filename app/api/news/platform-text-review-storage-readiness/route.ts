import { getD1 } from "../../../../db";
import { inspectPlatformTextDraftReviewStorage } from "../../../../db/platform-text-draft-review-storage-inspector.mjs";
import { inspectPlatformTextVisualReviewStorage } from "../../../../db/platform-text-visual-review-storage-inspector.mjs";
import { readPlatformTextReviewStorageReadiness } from "../../../../bridge/platform-text-review-storage-readiness.mjs";

function closedResult(blocker: string) {
  return {
    status: "platform_text_review_storage_readiness_blocked",
    blockers: [blocker],
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
  };
}

export async function GET() {
  try {
    const d1 = getD1();
    const result = await readPlatformTextReviewStorageReadiness({
      inspectDraftReviewStorage: () => inspectPlatformTextDraftReviewStorage(d1),
      inspectVisualReviewStorage: () => inspectPlatformTextVisualReviewStorage(d1),
    });
    return Response.json(result, { status: result.storageInspectionReady ? 200 : 409 });
  } catch {
    return Response.json(closedResult("platform_text_review_storage_unavailable"), { status: 503 });
  }
}
