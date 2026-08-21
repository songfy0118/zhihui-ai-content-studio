import { NextResponse } from "next/server";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ eligible: false, mode: "cloud", blockers: ["local_evidence_unavailable"], checks: [] });
  }
  try {
    const response = await fetch(`${BRIDGE_URL}/readiness?project=octopus-pilot`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const payload = await response.json();
    return NextResponse.json({ ...payload, mode: "local" }, { status: response.status });
  } catch {
    return NextResponse.json({ eligible: false, mode: "local", blockers: ["local_bridge_unavailable"], checks: [], error: "本机资格检查服务未启动" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "真实产物只能从本机操作台同步" }, { status: 403 });
  }
  try {
    const response = await fetch(`${BRIDGE_URL}/readiness/sync?project=octopus-pilot`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    return NextResponse.json({ ...payload, mode: "local" }, { status: response.status });
  } catch {
    return NextResponse.json({ eligible: false, mode: "local", blockers: ["local_bridge_unavailable"], checks: [], error: "本机产物同步服务未启动" }, { status: 503 });
  }
}
