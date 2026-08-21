import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { discoverLocalMiniDramaScriptArtifacts } from "../../../../bridge/local-mini-drama-script-artifacts.mjs";
import { assessScriptOutput } from "../../../../bridge/script-output-acceptance.mjs";
import { buildScriptReviewDraft } from "../../../../bridge/script-review-draft.mjs";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    mode: "local",
    status: "blocked",
    ready: false,
    blockers: [blocker],
    scriptOutputPresent: false,
    sourceLockFingerprint: null,
    counts: { knownClaims: 0, accountedClaims: 0, includedClaims: 0, uncitedFactualClaims: null },
    semanticVerification: "human_required",
    automatedFactVerification: false,
    scriptContentReturned: false,
    modelCalls: 0,
    externalCalls: false,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(unavailable("local_request_required"), { status: 403 });
  }

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
    const artifact = discovery.projects.find((project) => project.sourceIdeaId === "octopus") ?? null;
    const assessment = assessScriptOutput({
      envelope,
      output: {
        sourceLockFingerprint: artifact?.sourceLockFingerprint,
        scriptContentPresent: artifact?.scriptOutputPresent === true,
      },
    });
    const scriptOutputPresent = artifact?.scriptOutputPresent === true;
    const reviewDraft = artifact
      ? buildScriptReviewDraft({ artifact, sourceLockFingerprint: envelope.inputFingerprint })
      : null;
    return NextResponse.json({
      ...assessment,
      mode: "local",
      status: scriptOutputPresent ? "awaiting_human_script_review" : "awaiting_script_output",
      scriptOutputPresent,
      scriptContentReturned: false,
      discovery: {
        status: discovery.status,
        source: discovery.discoverySource,
        localReadCalls: 1,
        projectCount: discovery.projectCount,
        scriptProjectCount: discovery.scriptProjectCount,
        artifact: artifact ? {
          dramaId: artifact.dramaId,
          sourceIdeaId: artifact.sourceIdeaId,
          dramaStatus: artifact.dramaStatus,
          episodeCount: artifact.episodeCount,
          scriptEpisodeCount: artifact.scriptEpisodeCount,
          outputFingerprint: artifact.outputFingerprint,
          fingerprintAlgorithm: artifact.fingerprintAlgorithm,
          fingerprintScope: artifact.fingerprintScope,
          sourceLockProvenancePresent: artifact.sourceLockProvenancePresent,
          metadataFactReviewPresent: artifact.metadataFactReviewPresent,
          updatedAt: artifact.updatedAt,
        } : null,
        scriptContentsReturned: false,
        externalCalls: false,
        databaseWrites: false,
      },
      reviewDraft,
    });
  } catch {
    return NextResponse.json(unavailable("script_acceptance_unavailable"), { status: 503 });
  }
}
