import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { discoverLocalMiniDramaScriptArtifacts } from "../../../../bridge/local-mini-drama-script-artifacts.mjs";
import { assessPreproductionGate } from "../../../../bridge/preproduction-gate.mjs";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";
import { findAcceptedScriptReview } from "../../../../db/script-review-acceptance-store";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    ...assessPreproductionGate(),
    blockers: [blocker],
    reviewRecordLookup: "not_configured",
    localReadCalls: 0,
    scriptContentsReturned: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json(unavailable("local_request_required"), { status: 403 });

  try {
    const outline = pilot.outline;
    const envelope = buildSourceLockedScriptEnvelope({
      idea: { title: outline.title, angle: outline.summary },
      factReview: outline.metadata.fact_review,
      targets: outline.metadata.target_platforms,
    });
    const response = await fetch(`${ENGINE_URL}/api/v1/dramas?page=1&page_size=100`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) throw new Error("script_artifact_discovery_failed");
    const discovery = discoverLocalMiniDramaScriptArtifacts(payload);
    const artifact = discovery.projects.find((project) => project.sourceIdeaId === "octopus") ?? {};
    let reviewRecord = null;
    let reviewRecordLookup = "not_found";
    if (artifact.outputFingerprint && envelope.inputFingerprint) {
      try {
        reviewRecord = await findAcceptedScriptReview(artifact.outputFingerprint, envelope.inputFingerprint);
        reviewRecordLookup = reviewRecord ? "verified" : "not_found";
      } catch {
        reviewRecordLookup = "storage_not_initialized";
      }
    }
    const gate = assessPreproductionGate({
      artifact,
      sourceLockFingerprint: envelope.inputFingerprint,
      reviewRecord,
    });
    return NextResponse.json({
      ...gate,
      reviewRecordLookup,
      localReadCalls: 1,
      scriptContentsReturned: false,
    });
  } catch {
    return NextResponse.json(unavailable("preproduction_gate_unavailable"), { status: 503 });
  }
}
