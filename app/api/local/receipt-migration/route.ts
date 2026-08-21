import { NextResponse } from "next/server";
import { applyPilotAuthorizationReceiptStorage, inspectPilotAuthorizationReceiptStorage } from "../../../../db/pilot-authorization-receipt-store.mjs";
import { getD1 } from "../../../../db";

const MIGRATION_TAG = "0003_faithful_harry_osborn";
const CONFIRMATION = "APPLY_RECEIPT_MIGRATION_LOCALLY";
const SECRET_FIELD = /(?:api[_-]?key|secret|token|password|credential)/i;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function envelope(fields: Record<string, unknown> = {}) {
  return {
    localOnly: true,
    targetBinding: "DB",
    migrationTag: MIGRATION_TAG,
    applyPerformed: false,
    databaseWrites: false,
    ...fields,
    executorEnabled: false,
    executionTriggered: false,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishable: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(envelope({ error: "local_request_required" }), { status: 403 });
  try {
    const storage = await inspectPilotAuthorizationReceiptStorage(getD1());
    return NextResponse.json(envelope({
      mode: "plan_only",
      readyToApplyLocally: storage.status === "missing",
      blockers: storage.status === "missing" ? [] : storage.verified ? ["migration_already_applied"] : ["storage_status_not_safe_to_apply"],
      storage,
      requiredConfirmation: CONFIRMATION,
    }));
  } catch {
    return NextResponse.json(envelope({ mode: "plan_only", readyToApplyLocally: false, blockers: ["database_unavailable"] }), { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(envelope({ error: "local_request_required" }), { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => SECRET_FIELD.test(key))) return NextResponse.json(envelope({ error: "secret_fields_not_accepted" }), { status: 400 });
    if (body.migrationTag !== MIGRATION_TAG || body.confirmation !== CONFIRMATION) {
      return NextResponse.json(envelope({ error: "exact_migration_confirmation_required" }), { status: 409 });
    }
    const result = await applyPilotAuthorizationReceiptStorage(getD1());
    return NextResponse.json(envelope({
      applyPerformed: result.applied,
      databaseWrites: result.databaseWrites,
      alreadyApplied: result.alreadyApplied,
      blocker: result.blocker,
      storage: result.after,
    }), { status: result.applied || result.alreadyApplied ? 200 : 409 });
  } catch {
    return NextResponse.json(envelope({ error: "local_receipt_migration_failed" }), { status: 503 });
  }
}
