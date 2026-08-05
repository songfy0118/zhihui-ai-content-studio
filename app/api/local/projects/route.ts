import { NextResponse } from "next/server";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ projects: [], mode: "cloud" });
  }

  try {
    const response = await fetch(`${ENGINE_URL}/api/v1/dramas?page=1&page_size=100`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error?.message ?? `LocalMiniDrama 返回 ${response.status}`);
    }

    const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const projects = items
      .filter((item: { metadata?: { source?: string } }) => item.metadata?.source === "zhihui-content-os")
      .map((item: {
        id: number;
        title: string;
        status?: string;
        total_episodes?: number;
        episodes?: Array<{ storyboards?: unknown[] }>;
        metadata?: { source_idea_id?: string; target_platforms?: string[]; delivery_package?: { status?: string; platforms?: string[] } };
        updated_at?: string;
      }) => {
        const episodeCount = item.episodes?.length ?? item.total_episodes ?? 0;
        const storyboardCount = item.episodes?.reduce((sum, episode) => sum + (episode.storyboards?.length ?? 0), 0) ?? 0;
        return ({
        id: item.id,
        title: item.title,
        projectUrl: `http://127.0.0.1:3013/film/${item.id}`,
        storyTaskId: null,
        nextAction: item.metadata?.delivery_package?.status === "draft_ready" ? "packaging_ready" : storyboardCount > 0 ? "storyboards_ready" : episodeCount > 0 ? "story_ready" : "configure_text_model",
        status: item.status ?? "draft",
        episodeCount,
        storyboardCount,
        sourceIdeaId: item.metadata?.source_idea_id ?? null,
        platforms: item.metadata?.target_platforms ?? [],
        packagePlatforms: item.metadata?.delivery_package?.platforms ?? [],
        updatedAt: item.updated_at ?? null,
      });
      });

    return NextResponse.json({ projects, mode: "local" });
  } catch (error) {
    return NextResponse.json({
      projects: [],
      error: error instanceof Error ? error.message : "无法读取本机项目",
    }, { status: 503 });
  }
}
