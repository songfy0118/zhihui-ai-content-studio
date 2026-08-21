import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { validateScriptExecutionApproval } from "../../../../bridge/script-execution-gate.mjs";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";
import { buildSourceLockedScriptPlan } from "../../../../bridge/source-locked-script-plan.mjs";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";
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
  if (!isLocalRequest(request)) return NextResponse.json({ error: "剧本授权预览只能在本机操作台使用" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => SECRET_FIELD.test(key))) {
      return NextResponse.json({ error: "剧本授权预览不接收任何密钥或令牌字段" }, { status: 400 });
    }

    const outline = pilot.outline;
    const envelope = buildSourceLockedScriptEnvelope({
      idea: { title: outline.title, angle: outline.summary },
      factReview: outline.metadata.fact_review,
      targets: outline.metadata.target_platforms,
    });
    const plan = buildSourceLockedScriptPlan({ envelope });
    const configsResponse = await fetch(`${ENGINE_URL}/api/v1/ai-configs`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const configsPayload = configsResponse.ok ? await configsResponse.json() : { data: [] };
    const configs = Array.isArray(configsPayload?.data) ? configsPayload.data : [];
    const credentialConfigured = configs.some((config: { service_type?: string; enabled?: boolean }) => config.service_type === "text" && config.enabled !== false);
    const gate = validateScriptExecutionApproval({
      planReady: plan.ready,
      sourceLockFingerprint: envelope.inputFingerprint,
      credentialConfigured,
      provider: optionalText(body.provider),
      textModel: optionalText(body.textModel),
      quotedCostCny: typeof body.quotedCostCny === "number" ? body.quotedCostCny : null,
      pricingConfirmed: body.pricingConfirmed === true,
      maxCostCny: typeof body.maxCostCny === "number" ? body.maxCostCny : null,
      approvedRequestHash: optionalText(body.approvedRequestHash),
      userApproved: body.userApproved === true,
    });

    return NextResponse.json({
      previewOnly: true,
      configurationStatus: credentialConfigured ? "configured_unverified" : "missing",
      gate,
      executorAvailable: false,
      executionTriggered: false,
      modelCalls: 0,
      externalCalls: 0,
      costIncurred: false,
      scriptGenerated: false,
      generatedMedia: false,
      publishable: false,
      secretsReturned: false,
    });
  } catch {
    return NextResponse.json({ error: "剧本授权预览暂不可用" }, { status: 503 });
  }
}
