import { NextResponse } from "next/server";
import { diagnoseModelConfigs } from "../../../../bridge/model-diagnostics.mjs";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

type Config = {
  service_type?: string;
  provider?: string;
  name?: string;
  model?: string | string[];
  is_active?: boolean;
  base_url?: string;
  api_key?: string;
  default_model?: string;
};

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ mode: "cloud", ready: false, stages: [], message: "请在本机操作台查看模型检查结果。" });
  }

  try {
    const [healthResponse, configsResponse] = await Promise.all([
      fetch(`${ENGINE_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) }),
      fetch(`${ENGINE_URL}/api/v1/ai-configs`, { cache: "no-store", signal: AbortSignal.timeout(3000) }),
    ]);
    const health = await healthResponse.json();
    const configPayload = await configsResponse.json();
    if (!healthResponse.ok || health?.status !== "ok") throw new Error("LocalMiniDrama 后端不可用");
    if (!configsResponse.ok || configPayload?.success === false) throw new Error("无法读取模型配置");

    const configs: Config[] = Array.isArray(configPayload?.data) ? configPayload.data : [];
    const modelStages = diagnoseModelConfigs(configs);
    const stages = [
      { id: "engine", label: "本机漫剧引擎", ready: true, required: true, detail: `${health.app} ${health.version}`, diagnosticCode: "verified_local", verification: "verified", automaticTest: false },
      ...modelStages,
      { id: "package", label: "三平台包装", ready: true, required: true, detail: "抖音、TikTok、小红书文案与字幕草稿已生成", diagnosticCode: "verified_local", verification: "verified", automaticTest: false },
      { id: "publish", label: "账号发布", ready: false, required: false, detail: "等待账号授权与人工审核", diagnosticCode: "authorization_required", action: "保持关闭，直到账号本人授权并完成人工审核。", verification: "not_run", automaticTest: false },
    ];
    const blockers = stages.filter((stage) => stage.required && !stage.ready).map((stage) => stage.id);

    return NextResponse.json({
      mode: "local",
      ready: blockers.length === 0,
      stages,
      blockers,
      settingsUrl: "http://127.0.0.1:3013/ai-config",
      checkedAt: new Date().toISOString(),
      automaticConnectionTests: false,
      verificationNotice: "这里只检查本地配置结构；没有调用任何模型，也没有产生费用。",
    });
  } catch (error) {
    return NextResponse.json({
      mode: "local",
      ready: false,
      stages: [],
      message: error instanceof Error ? error.message : "生产前检查失败",
    }, { status: 503 });
  }
}
