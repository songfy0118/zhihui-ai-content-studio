import { NextResponse } from "next/server";

import pilot from "../../../../examples/octopus-pilot.json";
import { discoverLocalMiniDramaScriptArtifacts } from "../../../../bridge/local-mini-drama-script-artifacts.mjs";
import { buildScriptReviewDraft } from "../../../../bridge/script-review-draft.mjs";
import { validateScriptReviewPreview } from "../../../../bridge/script-review-preview.mjs";
import { buildSourceLockedScriptEnvelope } from "../../../../bridge/source-locked-script-envelope.mjs";

const ENGINE_URL = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679";
const ALLOWED_FIELDS = new Set(["outputFingerprint", "plannedSourceLockFingerprint", "reviewDraftFingerprint", "checks", "confirmCurrentFingerprints"]);

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
    const preview = validateScriptReviewPreview({ draft, request: body });
    return NextResponse.json({
      preview,
      current: {
        outputFingerprint: draft.outputFingerprint,
        plannedSourceLockFingerprint: draft.plannedSourceLockFingerprint,
        reviewDraftFingerprint: draft.reviewDraftFingerprint,
      },
      localReadCalls: 1,
      scriptContentsReturned: false,
      databaseWrites: false,
      executionTriggered: false,
    });
  } catch {
    return NextResponse.json({ error: "script_review_preview_unavailable" }, { status: 503 });
  }
}
