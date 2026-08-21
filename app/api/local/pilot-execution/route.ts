import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { validatePilotExecutionApproval } from "../../../../bridge/pilot-execution-gate.mjs";
import { createPersistentPilotAuthorizationReceiptStore, inspectPilotAuthorizationReceiptStorage } from "../../../../db/pilot-authorization-receipt-store.mjs";
import { getD1 } from "../../../../db";

const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";
const SECRET_FIELD = /(?:api[_-]?key|secret|token|password|credential)/i;
const EXECUTOR_ENABLED = false;
const RECEIPT_TTL_MS = 10 * 60 * 1000;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 120 ? text : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadGate(body: Record<string, unknown>) {
  const readinessResponse = await fetch(`${BRIDGE_URL}/readiness?project=octopus-pilot`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!readinessResponse.ok) throw new Error("pilot_readiness_unavailable");
  const readiness = await readinessResponse.json();
  const candidate = readiness?.engineOutputs?.pilotCandidate;
  if (!candidate) throw new Error("pilot_candidate_unavailable");
  const sceneStage = readiness?.generationPlan?.stages?.find((stage: { id?: string }) => stage.id === "scene_video");
  const voiceStage = readiness?.generationPlan?.stages?.find((stage: { id?: string }) => stage.id === "voice");
  return validatePilotExecutionApproval({
    candidate,
    credentialConfigured: sceneStage?.engineReady === true,
    localVoiceReady: voiceStage?.engineReady === true,
    provider: optionalText(body.provider),
    imageModel: optionalText(body.imageModel),
    videoModel: optionalText(body.videoModel),
    imageCostCny: optionalNumber(body.imageCostCny),
    videoCostCny: optionalNumber(body.videoCostCny),
    pricingConfirmed: body.pricingConfirmed === true,
    maxCostCny: optionalNumber(body.maxCostCny),
    approvedRequestHash: optionalText(body.approvedRequestHash),
    userApproved: body.userApproved === true,
  });
}

function closedResponse(fields: Record<string, unknown> = {}) {
  return {
    localOnly: true,
    receiptIssued: false,
    receiptConsumed: false,
    databaseWriteAttempted: false,
    ...fields,
    executorEnabled: false,
    adapterCallAuthorized: false,
    executionTriggered: false,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishable: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(closedResponse({ error: "执行准备状态只能在本机操作台查看" }), { status: 403 });
  try {
    const storage = await inspectPilotAuthorizationReceiptStorage(getD1());
    return NextResponse.json(closedResponse({
      status: "blocked",
      blockers: ["executor_disabled", ...storage.blockers],
      migrationVerification: storage.status,
      storage,
      receiptTtlSeconds: RECEIPT_TTL_MS / 1000,
    }));
  } catch {
    return NextResponse.json(closedResponse({
      status: "blocked",
      blockers: ["executor_disabled", "database_unavailable"],
      migrationVerification: "database_unavailable",
      storage: { status: "database_unavailable", verified: false, verification: "read_only_sqlite_schema", externalCalls: false, costIncurred: false },
      receiptTtlSeconds: RECEIPT_TTL_MS / 1000,
    }));
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(closedResponse({ error: "执行准备接口只能在本机操作台使用" }), { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => SECRET_FIELD.test(key))) return NextResponse.json(closedResponse({ error: "执行准备接口不接收任何密钥或令牌字段" }), { status: 400 });
    const action = body.action === "consume" ? "consume" : body.action === "prepare" ? "prepare" : null;
    if (!action) return NextResponse.json(closedResponse({ error: "action must be prepare or consume" }), { status: 400 });
    const gate = await loadGate(body);

    if (action === "consume" && !EXECUTOR_ENABLED) {
      return NextResponse.json(closedResponse({ action, gate, blockers: [...gate.blockers, "executor_disabled"], blocker: "executor_disabled", databaseWriteAttempted: false }), { status: 409 });
    }
    if (!gate.eligible) return NextResponse.json(closedResponse({ action, gate, blockers: gate.blockers, blocker: "approval_gate_not_eligible", databaseWriteAttempted: false }), { status: 409 });

    const store = createPersistentPilotAuthorizationReceiptStore(getD1());
    if (action === "prepare") {
      const issuedAtMs = Date.now();
      const result = await store.issue({
        gate,
        receiptId: randomUUID(),
        issuedAtMs,
        expiresAtMs: issuedAtMs + RECEIPT_TTL_MS,
        provider: optionalText(body.provider),
        imageModel: optionalText(body.imageModel),
        videoModel: optionalText(body.videoModel),
        imageCostCny: gate.imageCostCny,
        videoCostCny: gate.videoCostCny,
        quotedTotalCostCny: gate.quotedTotalCostCny,
        maxCostCny: gate.maxCostCny,
        pricingConfirmed: gate.pricingConfirmed,
      });
      return NextResponse.json(closedResponse({ action, gate, receiptIssued: result.issued, receipt: result.receipt, blocker: result.blocker, databaseWriteAttempted: true }), { status: result.issued ? 200 : 503 });
    }

    const result = await store.consume({
      receiptId: optionalText(body.receiptId),
      executionRequestHash: gate.executionRequestHash,
      executionAuthorized: body.executionAuthorized === true,
    });
    return NextResponse.json(closedResponse({ action, gate, receiptConsumed: result.consumed, blocker: result.blocker, databaseWriteAttempted: true }));
  } catch {
    return NextResponse.json(closedResponse({ error: "执行准备暂不可用；请确认本机服务与待应用迁移" }), { status: 503 });
  }
}
