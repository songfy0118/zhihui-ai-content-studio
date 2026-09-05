import { generateUnverifiedTopicDraft } from "../../../../bridge/topic-draft-executor.mjs";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error:"本机模型只允许从本机操作台调用。" }, { status:403 });
  const body = await request.json().catch(() => null);
  const result = await generateUnverifiedTopicDraft(body);
  return Response.json(result, { status:result.status === "model_generated_unverified" ? 200 : 422, headers:{ "Cache-Control":"no-store" } });
}
