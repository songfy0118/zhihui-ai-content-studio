import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildSocialDraftHandoffPlan, SOCIAL_DRAFT_PROTOCOL_VERSION } from "../../../../bridge/social-draft-handoff.mjs";
import { inspectSocialDraftAssets } from "../../../../bridge/social-draft-assets.mjs";
import { planXiaohongshuDraftExecution } from "../../../../bridge/xiaohongshu-draft-execution.mjs";

const SECRET_FIELD = /(?:api[_-]?key|secret|token|password|credential|cookie|session)/i;
const BRIDGE_URL = "http://127.0.0.1:3765";
function resolveProjectRoot() {
  const startingDirectories = [process.env.ZHIHUI_PROJECT_ROOT, process.env.INIT_CWD, process.cwd()]
    .filter((value): value is string => Boolean(value));
  for (const startingDirectory of startingDirectories) {
    let cursor = startingDirectory;
    for (let depth = 0; depth < 5; depth += 1) {
      const candidate = [cursor, join(cursor, "ai-content-studio")]
        .find((item) => existsSync(join(item, "package.json")) && existsSync(join(item, "work", "packages")));
      if (candidate) return candidate;
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }
  return process.cwd();
}

function containsSecretField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSecretField);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => SECRET_FIELD.test(key) || containsSecretField(nested));
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function localPackageErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
  return code && /^[A-Z_]+$/.test(code) ? code : "package_plan_error";
}

function closedResponse(fields: Record<string, unknown> = {}) {
  return {
    localOnly: true,
    draftHandoffProtocolVersion: SOCIAL_DRAFT_PROTOCOL_VERSION,
    draftOnly: true,
    publishAllowed: false,
    publishActionImplemented: false,
    browserOpened: false,
    loginTriggered: false,
    uploadTriggered: false,
    draftSaveTriggered: false,
    draftVerified: false,
    publishTriggered: false,
    externalCalls: false,
    costIncurred: false,
    ...fields,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(closedResponse({ error: "草稿交接状态只能在本机操作台查看" }), { status: 403 });
  }
  const project = new URL(request.url).searchParams.get("project");
  if (project && !/^[a-z0-9-]+$/.test(project)) {
    return NextResponse.json(closedResponse({ error:"project 参数无效" }), { status:400 });
  }
  if (project) {
    try {
      const response = await fetch(`${BRIDGE_URL}/social-draft-package?project=${encodeURIComponent(project)}`, { cache:"no-store", signal:AbortSignal.timeout(3_000) });
      const payload = await response.json() as { packagePlan?:unknown };
      if (!response.ok || !payload.packagePlan) throw new Error("bridge_draft_package_unavailable");
      return NextResponse.json(closedResponse({
        status:"preview_only",
        supportedPlatforms:["xiaohongshu"],
        supportedModes:["video", "note"],
        interactiveLoginRequired:true,
        visibleBrowserRequired:true,
        verificationBypassAllowed:false,
        cookieExportAllowed:false,
        packagePlan:payload.packagePlan,
      }));
    } catch (error) {
      return NextResponse.json(closedResponse({
        status:"preview_only",
        error:"本机交付包不可用",
        errorCode:localPackageErrorCode(error),
        packagePlan:null,
      }), { status:404 });
    }
  }
  return NextResponse.json(closedResponse({
    status: "preview_only",
    supportedPlatforms: ["xiaohongshu"],
    supportedModes: ["video", "note"],
    interactiveLoginRequired: true,
    visibleBrowserRequired: true,
    verificationBypassAllowed: false,
    cookieExportAllowed: false,
  }));
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(closedResponse({ error: "草稿交接准备只能在本机操作台使用" }), { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    if (containsSecretField(body)) {
      return NextResponse.json(closedResponse({ error: "草稿交接接口不接收密码、Cookie、Token 或会话字段" }), { status: 400 });
    }
    if (body.action !== "preview" && body.action !== "preview_execution") {
      return NextResponse.json(closedResponse({ error: "当前阶段只支持 preview 或 preview_execution；真实保存草稿需单独授权" }), { status: 400 });
    }

    const content = body.content && typeof body.content === "object" ? body.content as Record<string, unknown> : {};
    const assetVerification = await inspectSocialDraftAssets({
      projectRoot: resolveProjectRoot(),
      mediaPaths: content.mediaPaths,
      coverPath: content.coverPath,
    });
    const plan = buildSocialDraftHandoffPlan({ ...body, assetVerification });
    const executionPlan = body.action === "preview_execution"
      ? planXiaohongshuDraftExecution({ handoffPlan:plan, loginEvidence:body.loginEvidence, executionRequested:body.executionRequested === true })
      : null;
    const blockers = executionPlan?.blockers ?? plan.blockers;
    return NextResponse.json(closedResponse({ plan, executionPlan, assetVerification, status: executionPlan?.state ?? plan.status, blockers }), { status: executionPlan ? (executionPlan.readyForBrowserAdapter ? 200 : 409) : (plan.eligible ? 200 : 409) });
  } catch {
    return NextResponse.json(closedResponse({ error: "草稿交接请求格式无效" }), { status: 400 });
  }
}
