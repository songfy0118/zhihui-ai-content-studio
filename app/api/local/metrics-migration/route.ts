import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { inspectMetricsProvenanceStorage } from "../../../../db/metrics-provenance-store.mjs";

const MIGRATION_TAG = "0004_strange_doorman";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function envelope(fields: Record<string, unknown> = {}) {
  return {
    mode: "plan_only",
    localOnly: true,
    migrationTag: MIGRATION_TAG,
    authorizationRequired: true,
    applyPerformed: false,
    databaseWrites: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    ...fields,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(envelope({ error: "local_request_required" }), { status: 403 });
  try {
    const storage = await inspectMetricsProvenanceStorage(getD1());
    const allFieldsMissing = storage.missingColumns.length === 4 && !storage.indexPresent;
    const readyToApplyLocally = storage.status === "incomplete" && allFieldsMissing;
    return NextResponse.json(envelope({
      readyToApplyLocally,
      blockers: storage.verified ? ["migration_already_applied"] : readyToApplyLocally ? [] : storage.blockers,
      storage,
    }));
  } catch {
    return NextResponse.json(envelope({ readyToApplyLocally: false, blockers: ["database_unavailable"] }), { status: 503 });
  }
}
