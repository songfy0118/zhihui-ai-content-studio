import { buildPlatformTextUnifiedDraftPackagePlan } from "../../../../bridge/platform-text-unified-draft-package-plan.mjs";

const MAX_REQUEST_BYTES = 1_000_000;

function invalidResult(blocker: string) {
  return {
    ...buildPlatformTextUnifiedDraftPackagePlan(),
    blockers: [blocker],
    requestAccepted: false,
    planningOnly: true,
  };
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return Response.json(invalidResult("unified_draft_package_plan_request_too_large"), { status: 413 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(invalidResult("invalid_unified_draft_package_plan_request"), { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) {
    return Response.json(invalidResult("unified_draft_package_plan_request_too_large"), { status: 413 });
  }

  const plan = buildPlatformTextUnifiedDraftPackagePlan(body);
  return Response.json({ ...plan, requestAccepted: true, planningOnly: true }, {
    status: plan.status === "platform_text_unified_draft_package_plan_ready" ? 200 : 409,
  });
}
