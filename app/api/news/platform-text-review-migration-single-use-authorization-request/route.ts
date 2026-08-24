import { buildPlatformTextReviewMigrationSingleUseAuthorizationRequest } from "../../../../bridge/platform-text-review-migration-single-use-authorization-request.mjs";

const MAX_REQUEST_BYTES = 32_000;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    status: "platform_text_review_migration_single_use_authorization_request_blocked",
    blockers: [blocker],
    migrationTags: ["0009_chunky_praxagora", "0010_tranquil_donald_blake"],
    sourceMigrationScopeFingerprint: null,
    migrationExecutionPreflightFingerprint: null,
    localTargetEvidenceFingerprint: null,
    authorizationRequestFingerprint: null,
    requiredConfirmation: null,
    ticketTerms: { singleUse:true, ttlSecondsAfterAcceptance:300, localTargetOnly:true, remoteAllowed:false, exactFingerprintsRequired:true, createOnlyMigrations:true, rollbackOnFailureRequired:true, postApplyReadOnlyVerificationRequired:true },
    evidenceValidated: false,
    readyForHumanConfirmation: false,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    authorizationTicket: null,
    executionContract: null,
    commandPrepared: false,
    executorConnected: false,
    applyImplemented: false,
    applyPerformed: false,
    databaseFileOpened: false,
    databaseReadAttempted: false,
    databaseReads: 0,
    databaseWrites: false,
    filesystemWrites: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json(unavailable("local_request_required"), { status:403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_authorization_request_too_large"), { status:413 });
  const body = await request.json().catch(() => null);
  const allowedKeys = new Set(["executionPreflight", "localTargetDiagnostic"]);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowedKeys.has(key)) || Object.keys(body).length !== allowedKeys.size) {
    return Response.json(unavailable("review_migration_authorization_request_invalid"), { status:400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_authorization_request_too_large"), { status:413 });
  const result = buildPlatformTextReviewMigrationSingleUseAuthorizationRequest(body);
  return Response.json(result, { status:result.readyForHumanConfirmation ? 200 : 409 });
}
