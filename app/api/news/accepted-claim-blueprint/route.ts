import { buildAcceptedClaimDraftBlueprint } from "../../../../bridge/accepted-claim-draft-blueprint.mjs";
import { getD1 } from "../../../../db/index.ts";
import { createHumanClaimAcceptanceReader } from "../../../../db/human-claim-acceptance-reader.mjs";

const MAX_REQUEST_BYTES = 2_000;
const ALLOWED_FIELDS = new Set(["acceptanceFingerprint", "editorialAngle", "targets"]);

function blocked(blocker: string) {
  return {
    status:"accepted_claim_draft_blueprint_blocked",
    blockers:[blocker],
    blueprint:null,
    blueprintFingerprint:null,
    targetPlatforms:[],
    acceptedClaimCount:0,
    readyForHumanCopyDrafting:false,
    databaseReads:0,
    databaseWrites:false,
    externalCalls:false,
    publishTriggered:false,
  };
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(blocked("accepted_claim_blueprint_request_too_large"), { status:413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return Response.json(blocked("invalid_accepted_claim_blueprint_request"), { status:400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(blocked("accepted_claim_blueprint_request_too_large"), { status:413 });
  try {
    const acceptanceRead = await createHumanClaimAcceptanceReader(getD1()).readByAcceptanceFingerprint(body.acceptanceFingerprint);
    const result = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle:body.editorialAngle, targets:body.targets });
    return Response.json({ ...result, databaseReads:acceptanceRead.databaseReads }, { status:result.status === "accepted_claim_draft_blueprint_ready" ? 200 : 409, headers:{ "Cache-Control":"no-store" } });
  } catch {
    return Response.json(blocked("human_claim_acceptance_storage_unavailable"), { status:503 });
  }
}
