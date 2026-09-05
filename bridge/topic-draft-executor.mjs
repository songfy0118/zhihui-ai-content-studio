const LOCAL_MODEL_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3:4b";

function clean(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function parseJson(text) {
  const normalized = String(text ?? "").replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  return JSON.parse(normalized);
}

export async function generateUnverifiedTopicDraft(idea, { fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
  const id = clean(idea?.id, 80);
  const title = clean(idea?.title, 180);
  const angle = clean(idea?.angle, 300);
  const category = clean(idea?.category, 80);
  if (!id || !title || !angle || !category) return { status:"topic_draft_blocked", blockers:["invalid_topic_brief"] };

  const prompt = `你是中文科技内容编辑。根据下面的选题构思生成一份抖音图文文案雏形。\n选题：${title}\n角度：${angle}\n分类：${category}\n\n严格要求：\n1. 只写观点框架，不新增公司、人名、数字、日期、事件结果或其他可核验事实。\n2. 原输入中疑似事实也必须写成问题或待核验项，不能写成定论。\n3. 正文 180-350 个中文字符，互联网中文口吻，但不夸大、不承诺流量。\n4. 必须明确包含“正式发布前需补齐公开来源并人工核验”。\n5. 只返回 JSON：{"title":"","body":"","hashtags":["","",""]}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LOCAL_MODEL_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ model:MODEL, stream:false, format:"json", think:false, messages:[{ role:"user", content:prompt }] }),
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`local_model_http_${response.status}`);
    const envelope = await response.json();
    const draft = parseJson(envelope?.message?.content);
    const draftTitle = clean(draft?.title, 60);
    const body = clean(draft?.body, 800);
    const hashtags = Array.isArray(draft?.hashtags) ? draft.hashtags.map((tag) => clean(tag, 24)?.replace(/^#/u, "")).filter(Boolean).slice(0, 5) : [];
    if (!draftTitle || !body || hashtags.length === 0 || !body.includes("正式发布前需补齐公开来源并人工核验")) throw new Error("local_model_output_invalid");
    return {
      status:"model_generated_unverified",
      draft:{ ideaId:id, title:draftTitle, body, hashtags, status:"model_generated_unverified" },
      model:MODEL,
      modelCalls:1,
      sourceLockReady:false,
      humanReviewRequired:true,
      draftSaved:false,
      publishTriggered:false,
    };
  } catch (error) {
    return { status:"topic_draft_blocked", blockers:[error instanceof Error ? error.message : "local_model_failed"], modelCalls:0, draftSaved:false, publishTriggered:false };
  } finally {
    clearTimeout(timer);
  }
}
