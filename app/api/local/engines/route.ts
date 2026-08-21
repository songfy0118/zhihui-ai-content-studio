import { NextResponse } from "next/server";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json({ mode: "cloud", engines: [], automaticDownloads: false });
  try {
    const response = await fetch(`${BRIDGE_URL}/local-engines/readiness`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const payload = await response.json();
    return NextResponse.json({ ...payload, mode: "local" }, { status: response.status });
  } catch {
    return NextResponse.json({ mode: "local", engines: [], automaticDownloads: false, error: "本机开源引擎检查服务未启动" }, { status: 503 });
  }
}
