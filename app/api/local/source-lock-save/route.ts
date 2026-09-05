import { getD1 } from "../../../../db/index.ts";
import { createSourceLockStore } from "../../../../db/source-lock-store.mjs";

const MAX_REQUEST_BYTES = 60_000;
const ALLOWED_FIELDS = new Set(["plan", "executeRequested", "confirmation", "authorizedSavePlanFingerprint"]);

function isLocal(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function blocked(blocker: string) {
  return { status:"source_lock_save_blocked", eligible:false, blockers:[blocker], persisted:false, sourceLocksCreated:0, databaseWriteAttempted:false, databaseWrites:false, externalCalls:false, draftsUnlocked:0, publishTriggered:false };
}

export async function POST(request: Request) {
  if (!isLocal(request)) return Response.json(blocked("local_request_required"), { status:403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return Response.json(blocked("source_lock_save_request_too_large"), { status:413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return Response.json(blocked("invalid_source_lock_save_request"), { status:400 });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) return Response.json(blocked("source_lock_save_request_too_large"), { status:413 });
  try {
    const result = await createSourceLockStore(getD1()).save(body);
    const success = result.persisted === true || result.alreadyPersisted === true;
    return Response.json(result, { status:success ? 200 : 409, headers:{ "Cache-Control":"no-store" } });
  } catch {
    return Response.json(blocked("source_lock_storage_unavailable"), { status:503 });
  }
}
