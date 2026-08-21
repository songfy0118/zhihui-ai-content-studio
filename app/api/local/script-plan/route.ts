import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";
import { buildSourceLockedScriptPlan, summarizeSourceLockedScriptPlan } from "../../../../bridge/source-locked-script-plan.mjs";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function blocked(blocker: string) {
  return {
    mode: "local",
    readyForAuthorization: false,
    blockers: [blocker],
    sourceLockFingerprint: null,
    claimCount: 0,
    sourceCount: 0,
    targetPlatforms: [],
    downstream: null,
    premiseReturned: false,
    requestBodyReturned: false,
    authorizationRequired: true,
    dispatchAllowed: false,
    plannedModelCalls: 0,
    modelCalls: 0,
    externalCalls: 0,
    costIncurred: false,
    scriptGenerated: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(blocked("local_request_required"), { status: 403 });
  try {
    const outline = pilot.outline;
    const envelope = buildSourceLockedScriptEnvelope({
      idea: { title: outline.title, angle: outline.summary },
      factReview: outline.metadata.fact_review,
      targets: outline.metadata.target_platforms,
    });
    const summary = summarizeSourceLockedScriptPlan(buildSourceLockedScriptPlan({ envelope }));
    return NextResponse.json({ ...summary, mode: "local" }, { status: summary.readyForAuthorization ? 200 : 409 });
  } catch {
    return NextResponse.json(blocked("script_plan_unavailable"), { status: 503 });
  }
}
