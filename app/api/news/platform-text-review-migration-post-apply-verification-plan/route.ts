import { buildPlatformTextReviewMigrationPostApplyVerificationPlan } from "../../../../bridge/platform-text-review-migration-post-apply-verification-plan.mjs";

const MAX_REQUEST_BYTES = 24_000;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    status:"platform_text_review_migration_post_apply_verification_plan_blocked", blockers:[blocker],
    migrationTags:["0009_chunky_praxagora", "0010_tranquil_donald_blake"], sourceAuthorizationRequestFingerprint:null,
    verificationPlanFingerprint:null, expectedCounts:{tables:5,indexes:12,columns:34,metadataQueries:7},
    plannedChecks:["migration_journal_exact","schema_objects_exact","columns_exact","no_unexpected_schema_delta","no_business_rows_read"],
    verificationMode:"post_apply_read_only_metadata", rollbackProofExpectation:{required:true,availableBeforeApply:false,status:"awaiting_authorized_transaction",failureInjectionForbiddenOnLiveTarget:true,rollbackEvidenceRequiredOnFailure:true},
    evidenceValidated:false, readyForFuturePostApplyVerification:false, preApplySnapshotCaptured:false,
    confirmationReceived:false, authorizationGranted:false, authorizationTicket:null, executionContract:null,
    commandPrepared:false, applyPerformed:false, verificationPerformed:false, rollbackPerformed:false,
    databaseReadAttempted:false, databaseReads:0, inspectedBusinessRows:false, databaseWrites:false,
    filesystemWrites:false, externalCalls:false, publishTriggered:false, businessResult:false,
  };
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json(unavailable("local_request_required"), { status:403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_verification_plan_request_too_large"), { status:413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("authorizationRequest" in body)) {
    return Response.json(unavailable("review_migration_verification_plan_request_invalid"), { status:400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(unavailable("review_migration_verification_plan_request_too_large"), { status:413 });
  const result = buildPlatformTextReviewMigrationPostApplyVerificationPlan(body);
  return Response.json(result, { status:result.readyForFuturePostApplyVerification ? 200 : 409 });
}
