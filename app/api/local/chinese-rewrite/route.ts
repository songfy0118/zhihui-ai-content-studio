import { executeChineseInternetRewrite } from "../../../../bridge/chinese-internet-rewrite-executor.mjs";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json({ error:"为保护本机模型，此操作只能从本机操作台执行。" }, { status:403 });
  }

  let planResult: unknown;
  try {
    planResult = await request.json();
  } catch {
    return Response.json({ error:"请求必须是有效 JSON。" }, { status:400 });
  }

  const result = await executeChineseInternetRewrite(planResult);
  const status = result.status === "chinese_internet_rewrite_generated_for_review" ? 200 : 422;
  return Response.json(result, {
    status,
    headers:{ "Cache-Control":"no-store" },
  });
}
