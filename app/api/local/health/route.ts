import { NextResponse } from "next/server";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ready: false, mode: "cloud", message: "请在本机操作台启动生成引擎。" });
  }

  try {
    const [healthResponse, configResponse] = await Promise.all([
      fetch(`${ENGINE_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) }),
      fetch(`${ENGINE_URL}/api/v1/ai-configs`, { cache: "no-store", signal: AbortSignal.timeout(3000) }),
    ]);

    if (!healthResponse.ok) throw new Error(`LocalMiniDrama 返回 ${healthResponse.status}`);
    const health = await healthResponse.json();
    const configPayload = configResponse.ok ? await configResponse.json() : { data: [] };
    const configs = Array.isArray(configPayload?.data) ? configPayload.data : [];
    const textConfigured = configs.some((item: { service_type?: string; enabled?: boolean }) =>
      item.service_type === "text" && item.enabled !== false,
    );

    return NextResponse.json({
      ready: true,
      mode: "local",
      engine: health?.app ?? "LocalMiniDrama API",
      version: health?.version ?? "unknown",
      configCount: configs.length,
      textConfigured,
      studioUrl: "http://127.0.0.1:3013",
    });
  } catch (error) {
    return NextResponse.json({
      ready: false,
      mode: "local",
      message: error instanceof Error ? error.message : "本机引擎未启动",
    }, { status: 503 });
  }
}
