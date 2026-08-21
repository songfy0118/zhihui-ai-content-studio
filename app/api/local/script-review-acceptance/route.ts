import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { discoverLocalMiniDramaScriptArtifacts } from "../../../../bridge/local-mini-drama-script-artifacts.mjs";
import { buildScriptReviewAcceptance } from "../../../../bridge/script-review-acceptance.mjs";
import { buildScriptReviewDraft } from "../../../../bridge/script-review-draft.mjs";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";
import { persistScriptReviewAcceptance } from "../../../../db/script-review-acceptance-store";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";
const ALLOWED_FIELDS = new Set([
  "outputFingerprint",
  "plannedSourceLockFingerprint",
  "reviewDraftFingerprint",
  "checks",
  "confirmCurrentFingerprints",
  "previewFingerprint",
  "confirmPersistedAcceptance",
]);

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: "local_request_required" }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
      return NextResponse.json({ error: "unexpected_or_sensitive_field" }, { status: 400 });
    }
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
    if (!artifact) return NextResponse.json({ error: "script_artifact_not_found" }, { status: 404 });

    const draft = buildScriptReviewDraft({ artifact, sourceLockFingerprint: envelope.inputFingerprint });
    const acceptance = buildScriptReviewAcceptance({
      draft,
      request: body,
      sourceIdeaId: artifact.sourceIdeaId,
      dramaId: artifact.dramaId,
    });
    if (!acceptance.ok || !acceptance.record) return NextResponse.json(acceptance, { status: 409 });

    const persisted = await persistScriptReviewAcceptance(acceptance.record);
    if (!persisted) throw new Error("script_review_acceptance_not_persisted");
    return NextResponse.json({
      status: "accepted",
      accepted: true,
      record: {
        id: persisted.id,
        sourceIdeaId: persisted.sourceIdeaId,
        dramaId: persisted.dramaId,
        outputFingerprint: persisted.outputFingerprint,
        sourceLockFingerprint: persisted.sourceLockFingerprint,
        status: persisted.status,
        reviewedAt: persisted.reviewedAt,
        checks: persisted.checks,
      },
      databaseWrites: true,
      downstreamUnlocked: false,
      scriptContentsReturned: false,
      modelCalls: 0,
      externalCalls: false,
      costIncurred: false,
      generatedMedia: false,
      publishTriggered: false,
    }, { status: 201 });
  } catch {
    return NextResponse.json({
      error: "script_review_acceptance_storage_unavailable",
      migrationRequired: "0005_jazzy_toad",
      databaseWrites: false,
      downstreamUnlocked: false,
      modelCalls: 0,
      externalCalls: false,
      costIncurred: false,
      generatedMedia: false,
      publishTriggered: false,
    }, { status: 503 });
  }
}
