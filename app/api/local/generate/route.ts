import { NextResponse } from "next/server";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

type LocalIdea = {
  id?: string;
  title?: string;
  angle?: string;
  category?: string;
  platforms?: string[];
};

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

async function engineRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message ?? `LocalMiniDrama 请求失败（${response.status}）`);
  }
  return payload?.data ?? payload;
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "为保护本机引擎，此操作只能从本机操作台执行。" }, { status: 403 });
  }

  try {
    const idea = await request.json() as LocalIdea;
    const title = String(idea.title ?? "").trim();
    const angle = String(idea.angle ?? "").trim();
    if (!title || !angle) {
      return NextResponse.json({ error: "选题标题和内容角度不能为空。" }, { status: 400 });
    }

    const configs = await engineRequest("/api/v1/ai-configs");
    const textConfigured = Array.isArray(configs) && configs.some(
      (item: { service_type?: string; enabled?: boolean }) => item.service_type === "text" && item.enabled !== false,
    );

    const drama = await engineRequest("/api/v1/dramas", {
      method: "POST",
      body: JSON.stringify({
        title,
        description: angle,
        genre: idea.category || "科普",
        style: "AI科普漫剧",
        metadata: {
          source: "zhihui-content-os",
          source_idea_id: idea.id,
          target_platforms: idea.platforms ?? [],
          aspect_ratio: "9:16",
        },
      }),
    });

    let storyTaskId: string | null = null;
    if (textConfigured) {
      const storyTask = await engineRequest("/api/v1/generation/story", {
        method: "POST",
        body: JSON.stringify({
          drama_id: drama.id,
          premise: `${title}\n\n核心讲述角度：${angle}\n\n请写成60至90秒、事实严谨、开头3秒有悬念的竖屏科普漫剧。`,
          style: "轻喜剧、快节奏、画面可视化",
          type: idea.category || "科普",
          episode_count: 1,
          title,
          summary: angle,
          genre: idea.category || "科普",
          drama_style: "AI科普漫剧",
          metadata: { source: "zhihui-content-os", aspect_ratio: "9:16" },
        }),
      });
      storyTaskId = String(storyTask.task_id);
    }

    return NextResponse.json({
      ok: true,
      project: { id: drama.id, title: drama.title },
      projectUrl: `http://127.0.0.1:3013/film/${drama.id}`,
      storyTaskId,
      nextAction: textConfigured ? "story_generating" : "configure_text_model",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "本机项目创建失败",
    }, { status: 502 });
  }
}
