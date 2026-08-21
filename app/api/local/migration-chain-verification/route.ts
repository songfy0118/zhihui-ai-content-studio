import { NextResponse } from "next/server";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    status: "unavailable",
    verified: false,
    appliedTags: [],
    completedSteps: 0,
    totalSteps: 6,
    blockers: [blocker],
    rollbackPerformed: false,
    rollbackVerified: null,
    ephemeralDatabaseWrites: false,
    liveDatabaseWrites: false,
    liveApplyPerformed: false,
    externalCalls: false,
    costIncurred: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(unavailable("local_request_required"), { status: 403 });
  try {
    const response = await fetch(`${BRIDGE_URL}/d1/migration-chain/isolated`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return NextResponse.json(unavailable("bridge_capability_unavailable"));
    const payload = await response.json();
    return NextResponse.json({ ...payload, status: payload.verified ? "verified" : "failed" }, { status: response.ok ? 200 : 409 });
  } catch {
    return NextResponse.json(unavailable("local_bridge_unavailable"));
  }
}
