const MIGRATION_TAGS = ["0009_chunky_praxagora", "0010_tranquil_donald_blake"];
const BRIDGE_URL = process.env.ZHIHUI_LOCAL_BRIDGE ?? "http://127.0.0.1:3765";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function unavailable(blocker: string) {
  return {
    status: "platform_text_review_migration_isolated_rehearsal_blocked",
    blockers: [blocker],
    mode: "isolated_in_memory_sqlite",
    migrationTags: MIGRATION_TAGS,
    appliedTags: [],
    tableCount: 0,
    indexCount: 0,
    schemaVerified: false,
    successPathVerified: false,
    rollbackScenarios: [],
    rollbackScenarioCount: 0,
    rollbackVerifiedCount: 0,
    failurePathVerified: false,
    intentionalFailureProbes: 0,
    ephemeralDatabaseWrites: false,
    liveDatabaseAccessed: false,
    liveDatabaseWrites: false,
    liveApplyPerformed: false,
    filesystemMutations: false,
    externalCalls: false,
    publishTriggered: false,
    businessResult: false,
  };
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json(unavailable("local_request_required"), { status: 403 });
  try {
    const response = await fetch(`${BRIDGE_URL}/d1/review-migrations/isolated`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (response.status === 404) return Response.json(unavailable("bridge_capability_unavailable"), { status: 503 });
    const result = await response.json();
    return Response.json(result, { status: response.ok ? 200 : 409 });
  } catch {
    return Response.json(unavailable("local_bridge_unavailable"), { status: 503 });
  }
}
