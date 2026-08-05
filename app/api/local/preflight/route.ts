import { NextResponse } from "next/server";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

type Config = {
  service_type?: string;
  provider?: string;
  name?: string;
  model?: string | string[];
  is_active?: boolean;
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
    const active = configs.filter((item) => item.is_active !== false);
    const byType = (type: string) => active.filter((item) => item.service_type === type);
    const summarize = (rows: Config[]) => rows.map((item) => ({
      name: item.name ?? item.provider ?? "未命名服务",
      provider: item.provider ?? "unknown",
      models: Array.isArray(item.model) ? item.model : item.model ? [item.model] : [],
    }));

    const text = byType("text");
    const image = [...byType("image"), ...byType("storyboard_image")];
    const video = byType("video");
    const tts = byType("tts");
    const stages = [
      { id: "engine", label: "本机漫剧引擎", ready: true, required: true, detail: `${health.app} ${health.version}` },
      { id: "text", label: "文本与剧本", ready: text.length > 0, required: true, detail: text.length ? `${text.length} 个可用配置` : "缺少文本模型配置", services: summarize(text) },
      { id: "image", label: "角色与分镜图片", ready: image.length > 0, required: true, detail: image.length ? `${image.length} 个可用配置` : "缺少图片模型配置", services: summarize(image) },
      { id: "video", label: "分镜视频", ready: video.length > 0, required: true, detail: video.length ? `${video.length} 个可用配置` : "缺少视频模型配置", services: summarize(video) },
      { id: "tts", label: "配音", ready: tts.length > 0, required: true, detail: tts.length ? `${tts.length} 个可用配置` : "缺少 TTS 配置", services: summarize(tts) },
      { id: "package", label: "三平台包装", ready: true, required: true, detail: "抖音、TikTok、小红书文案与字幕草稿已生成" },
      { id: "publish", label: "账号发布", ready: false, required: false, detail: "等待账号授权与人工审核" },
    ];
    const blockers = stages.filter((stage) => stage.required && !stage.ready).map((stage) => stage.id);

    return NextResponse.json({
      mode: "local",
      ready: blockers.length === 0,
      stages,
      blockers,
      settingsUrl: "http://127.0.0.1:3013/ai-config",
      checkedAt: new Date().toISOString(),
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
