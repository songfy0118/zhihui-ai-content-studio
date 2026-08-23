import { buildPlatformTextReviewMigrationExecutionPreflight } from "../../../../bridge/platform-text-review-migration-execution-preflight.mjs";

const MAX_REQUEST_BYTES = 32_000;

function blocked(blocker: string) {
  return {
    status: "platform_text_review_migration_execution_preflight_blocked",
    blockers: [blocker],
    sourceMigrationScopeFingerprint: null,
    migrationExecutionPreflightFingerprint: null,
    migrationTags: ["0009_chunky_praxagora", "0010_tranquil_donald_blake"],
    requiredConfirmation: null,
    evidenceValidated: false,
    ephemeralEvidenceUsed: false,
    readyForExplicitAuthorizationRequest: false,
    singleUseAuthorizationRequired: true,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    executionContract: null,
    executorConnected: false,
    applyImplemented: false,
    applyPerformed: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return Response.json(blocked("review_migration_execution_preflight_request_too_large"), { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["authorizationPreview", "isolatedRehearsal"].includes(key))) {
    return Response.json(blocked("review_migration_execution_preflight_request_invalid"), { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) {
    return Response.json(blocked("review_migration_execution_preflight_request_too_large"), { status: 413 });
  }
  const result = buildPlatformTextReviewMigrationExecutionPreflight(body);
  return Response.json(result, { status: result.readyForExplicitAuthorizationRequest ? 200 : 409 });
}
