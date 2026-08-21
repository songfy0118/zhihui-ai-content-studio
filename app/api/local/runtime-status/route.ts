import { NextResponse } from "next/server";
import { inspectLocalRuntime } from "../../../../bridge/local-runtime-doctor.mjs";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ status: "blocked", current: false, services: [], localOnly: true }, { status: 403 });
  }

  const result = await inspectLocalRuntime();
  return NextResponse.json({ ...result, localOnly: true });
}
