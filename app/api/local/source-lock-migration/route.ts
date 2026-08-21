import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getD1 } from "../../../../db";
import { inspectSourceLockStorage } from "../../../../db/source-lock-storage-inspector.mjs";
import { assessSourceLockMigrationPreflight } from "../../../../bridge/source-lock-migration-preflight.mjs";

const MIGRATION_TAG = "0007_silly_turbo";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return NextResponse.json({ mode: "plan_only", localOnly: true, error: "local_request_required", applyImplemented: false, applyPerformed: false, databaseWrites: false }, { status: 403 });
  try {
    const [storage, migrationSql] = await Promise.all([
      inspectSourceLockStorage(getD1()),
      readFile(new URL("../../../../drizzle/0007_silly_turbo.sql", import.meta.url), "utf8"),
    ]);
    const preflight = assessSourceLockMigrationPreflight({ hosting: { d1: "DB" }, migrationTag: MIGRATION_TAG, migrationSql, storageStatus: storage.status });
    return NextResponse.json({ ...preflight, localOnly: true, storage });
  } catch {
    return NextResponse.json({ mode: "plan_only", localOnly: true, readyToApplyLocally: false, blockers: ["database_unavailable"], authorizationRequired: true, applyImplemented: false, applyPerformed: false, databaseWrites: false }, { status: 503 });
  }
}
