import { buildPlatformTextReviewMigrationAuthorizationPreview } from "../../../../bridge/platform-text-review-migration-authorization-preview.mjs";

const MAX_REQUEST_BYTES = 8_000;

function closedResult(blocker: string) {
  return {
    status: "platform_text_review_migration_authorization_preview_blocked",
    blockers: [blocker],
    migrationScopeFingerprint: null,
    requiredConfirmation: null,
    migrationTags: ["0009_chunky_praxagora", "0010_tranquil_donald_blake"],
    migrationManifest: [],
    tableCount: 5,
    indexCount: 12,
    objectCount: 17,
    localOnly: true,
    remoteAllowed: false,
    createOnly: true,
    eligibleForExplicitLocalMigrationAuthorization: false,
    authorizationRequired: true,
    authorizationGranted: false,
    executorConnected: false,
    commandPrepared: false,
    applyImplemented: false,
    applyPerformed: false,
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
    return Response.json(closedResult("platform_text_review_migration_preview_request_too_large"), { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "storageReadiness")) {
    return Response.json(closedResult("invalid_platform_text_review_migration_preview_request"), { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) {
    return Response.json(closedResult("platform_text_review_migration_preview_request_too_large"), { status: 413 });
  }
  const preview = buildPlatformTextReviewMigrationAuthorizationPreview(body.storageReadiness);
  return Response.json(preview, { status: preview.eligibleForExplicitLocalMigrationAuthorization ? 200 : 409 });
}
