import { NextResponse } from "next/server";
import { planPilotExecution } from "../../../../bridge/pilot-execution-gate.mjs";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";
const SECRET_FIELD = /(?:api[_-]?key|secret|token|password|credential)/i;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 120 ? text : null;
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: "授权预览只能在本机操作台使用" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => SECRET_FIELD.test(key))) {
      return NextResponse.json({ error: "授权预览不接收任何密钥或令牌字段" }, { status: 400 });
    }
    const readinessResponse = await fetch(`${BRIDGE_URL}/readiness?project=octopus-pilot`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!readinessResponse.ok) throw new Error("pilot_readiness_unavailable");
    const readiness = await readinessResponse.json();
    const candidate = readiness?.engineOutputs?.pilotCandidate;
    if (!candidate) return NextResponse.json({ error: "当前没有可预览的首个分镜" }, { status: 409 });
    const sceneStage = readiness?.generationPlan?.stages?.find((stage: { id?: string }) => stage.id === "scene_video");
    const voiceStage = readiness?.generationPlan?.stages?.find((stage: { id?: string }) => stage.id === "voice");
    const executionPlan = planPilotExecution({
      candidate,
      credentialConfigured: sceneStage?.engineReady === true,
      localVoiceReady: voiceStage?.engineReady === true,
      provider: optionalText(body.provider),
      imageModel: optionalText(body.imageModel),
      videoModel: optionalText(body.videoModel),
      imageCostCny: typeof body.imageCostCny === "number" ? body.imageCostCny : null,
      videoCostCny: typeof body.videoCostCny === "number" ? body.videoCostCny : null,
      pricingConfirmed: body.pricingConfirmed === true,
      maxCostCny: typeof body.maxCostCny === "number" ? body.maxCostCny : null,
      approvedRequestHash: optionalText(body.approvedRequestHash),
      userApproved: body.userApproved === true,
      executionRequested: false,
      executorAvailable: false,
    });
    return NextResponse.json({
      previewOnly: true,
      candidate: { storyboardId: candidate.storyboardId, storyboardNumber: candidate.storyboardNumber, duration: candidate.duration, aspectRatio: candidate.aspectRatio, requestHash: candidate.requestHash },
      gate: executionPlan.gate,
      executionPlan,
      executionTriggered: false,
      generatedMedia: false,
      publishable: false,
    });
  } catch {
    return NextResponse.json({ error: "授权预览暂不可用" }, { status: 503 });
  }
}
