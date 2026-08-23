import { getD1 } from "../../../../db";
import { createPlatformTextDraftReviewReader } from "../../../../db/platform-text-draft-review-reader.mjs";
import { createPlatformTextVisualReviewReader } from "../../../../db/platform-text-visual-review-reader.mjs";
import { readPlatformTextDurableReviewInputReadiness } from "../../../../bridge/platform-text-durable-review-input-readiness.mjs";

const MAX_REQUEST_BYTES = 2_000;
const ALLOWED_FIELDS = new Set(["draftReviewFingerprint", "visualReviewFingerprint"]);

function closedResult(blocker: string) {
  return {
    status: "platform_text_durable_review_inputs_blocked",
    blockers: [blocker],
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
  };
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return Response.json(closedResult("platform_text_durable_review_request_too_large"), { status: 413 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return Response.json(closedResult("invalid_platform_text_durable_review_request"), { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) {
    return Response.json(closedResult("platform_text_durable_review_request_too_large"), { status: 413 });
  }

  try {
    const d1 = getD1();
    const result = await readPlatformTextDurableReviewInputReadiness(body, {
      draftReviewReader: createPlatformTextDraftReviewReader(d1),
      visualReviewReader: createPlatformTextVisualReviewReader(d1),
    });
    return Response.json(result, { status: result.inputsReady ? 200 : 409 });
  } catch {
    return Response.json(closedResult("platform_text_durable_review_storage_unavailable"), { status: 503 });
  }
}
