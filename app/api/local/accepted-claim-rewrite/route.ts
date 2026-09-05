import { buildAcceptedClaimDraftBlueprint } from "../../../../bridge/accepted-claim-draft-blueprint.mjs";
import { executeChineseInternetRewrite } from "../../../../bridge/chinese-internet-rewrite-executor.mjs";
import { buildChineseInternetRewritePlan } from "../../../../bridge/chinese-internet-rewrite-plan.mjs";
import { getD1 } from "../../../../db/index.ts";
import { createHumanClaimAcceptanceReader } from "../../../../db/human-claim-acceptance-reader.mjs";

const MAX_REQUEST_BYTES = 2_000;
const ALLOWED_FIELDS = new Set(["acceptanceFingerprint", "editorialAngle", "targets"]);

function isLocal(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function blocked(blocker: string) {
  return { status:"accepted_claim_rewrite_blocked", blockers:[blocker], draft:null, humanReviewRequired:true, databaseReads:0, databaseWrites:false, modelCalls:0, draftSaved:false, publishTriggered:false };
}

export async function POST(request: Request) {
  if (!isLocal(request)) return Response.json(blocked("local_request_required"), { status:403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(blocked("accepted_claim_rewrite_request_too_large"), { status:413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return Response.json(blocked("invalid_accepted_claim_rewrite_request"), { status:400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(blocked("accepted_claim_rewrite_request_too_large"), { status:413 });
  try {
    const acceptanceRead = await createHumanClaimAcceptanceReader(getD1()).readByAcceptanceFingerprint(body.acceptanceFingerprint);
    const blueprint = buildAcceptedClaimDraftBlueprint(acceptanceRead, { editorialAngle:body.editorialAngle, targets:body.targets });
    if (blueprint.status !== "accepted_claim_draft_blueprint_ready") {
      return Response.json({ ...blocked("accepted_claim_blueprint_not_ready"), upstreamBlockers:blueprint.blockers, databaseReads:acceptanceRead.databaseReads }, { status:409 });
    }
    const result = await executeChineseInternetRewrite(buildChineseInternetRewritePlan(blueprint));
    return Response.json({ ...result, databaseReads:acceptanceRead.databaseReads }, { status:result.status === "chinese_internet_rewrite_generated_for_review" ? 200 : 422, headers:{ "Cache-Control":"no-store" } });
  } catch {
    return Response.json(blocked("human_claim_acceptance_storage_unavailable"), { status:503 });
  }
}
