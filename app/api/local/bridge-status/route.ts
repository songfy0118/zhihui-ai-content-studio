import { NextResponse } from "next/server";
import { assessBridgeProtocol } from "../../../../bridge/protocol.mjs";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function safety(fields: Record<string, unknown> = {}) {
  return {
    localOnly: true,
    ...fields,
    restartTriggered: false,
    processMutation: false,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishable: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(safety({ status: "blocked", blockers: ["local_request_required"] }), { status: 403 });
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("bridge_health_failed");
    const assessment = assessBridgeProtocol(await response.json());
    return NextResponse.json(safety(assessment));
  } catch {
    return NextResponse.json(safety({ status: "offline", current: false, blockers: ["bridge_unavailable"], restartRequired: false, missingCapabilities: [] }), { status: 503 });
  }
}
