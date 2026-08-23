import { buildSourceLockSaveAuthorizationPreview } from "../../../../bridge/source-lock-save-authorization-preview.mjs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { savePlan?: unknown } | null;
  const validRequest = body !== null
    && typeof body.savePlan === "object"
    && body.savePlan !== null
    && !Array.isArray(body.savePlan);
  const preview = buildSourceLockSaveAuthorizationPreview(validRequest ? body.savePlan : null);
  return Response.json(preview, {
    status: !validRequest ? 400 : preview.eligibleForExplicitSourceLockSaveAuthorization ? 200 : 409,
  });
}
