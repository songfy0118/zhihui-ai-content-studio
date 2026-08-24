import { bindPlatformTextReviewMigrationLocalTargetDiagnostic } from "../../../../bridge/platform-text-review-migration-local-target-diagnostic.mjs";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";
const MAX_REQUEST_BYTES = 16_000;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    status: "platform_text_review_migration_local_target_diagnostic_blocked",
    blockers: [blocker],
    migrationTags: ["0009_chunky_praxagora", "0010_tranquil_donald_blake"],
    targetBinding: null,
    bindingScope: "unverified",
    databaseNameConfigured: false,
    placeholderLocalDatabaseId: false,
    loopbackDevConfig: false,
    migrationJournalVerified: false,
    localStateCandidateCount: 0,
    localTargetEvidenceFingerprint: null,
    localTargetProven: false,
    readyForExplicitAuthorizationRequest: false,
    confirmationReceived: false,
    authorizationGranted: false,
    authorizationConsumed: false,
    commandPrepared: false,
    executorConnected: false,
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
  if (!isLocalRequest(request)) return Response.json(unavailable("local_request_required"), { status: 403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_local_target_request_too_large"), { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "executionPreflight")) {
    return Response.json(unavailable("review_migration_local_target_request_invalid"), { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_local_target_request_too_large"), { status: 413 });
  try {
    const response = await fetch(`${BRIDGE_URL}/d1/review-migrations/local-target`, { cache:"no-store", signal:AbortSignal.timeout(5_000) });
    if (!response.ok) return Response.json(unavailable(response.status === 404 ? "bridge_capability_unavailable" : "review_migration_local_environment_unavailable"), { status:503 });
    const environment = await response.json();
    const result = bindPlatformTextReviewMigrationLocalTargetDiagnostic({ executionPreflight:body.executionPreflight, environment });
    return Response.json(result, { status:result.localTargetProven ? 200 : 409 });
  } catch {
    return Response.json(unavailable("local_bridge_unavailable"), { status: 503 });
  }
}
