import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { inspectMigrationChain } from "../../../../db/migration-chain-inspector.mjs";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json({ localOnly: true, error: "local_request_required" }, { status: 403 });
  try {
    const result = await inspectMigrationChain(getD1());
    return NextResponse.json({ ...result, mode: "plan_only", localOnly: true, authorizationRequired: !result.current });
  } catch {
    return NextResponse.json({ mode: "plan_only", localOnly: true, authorizationRequired: true, current: false, blockers: ["database_unavailable"], databaseWrites: false, applyPerformed: false }, { status: 503 });
  }
}
