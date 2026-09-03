import { createHash } from "node:crypto";

const LOCAL_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const HASH = /^[a-f0-9]{64}$/;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function blocked(blockers, modelCalls = 0) {
  return {
    status:"chinese_internet_rewrite_execution_blocked",
    blockers:[...new Set(blockers)],
    draft:null,
    draftFingerprint:null,
    humanReviewRequired:true,
    modelCalls,
    draftSaved:false,
    publishTriggered:false,
  };
}

function safeText(value, maximumLength) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function validateDraft(draft, plan) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const allowedRefs = new Set(plan.inputClaims.flatMap((claim) => claim.sourceRefs));
  const requiredUrls = plan.sourceLedger.map((source) => source.canonicalUrl);
  for (const target of plan.targets) {
    const item = draft[target];
    if (
      !safeText(item?.title, 60)
      || !safeText(item?.body, 20_000)
      || !safeText(item?.coverText, 60)
      || !safeText(item?.sourceNote, 10_000)
      || !Array.isArray(item?.hashtags)
      || item.hashtags.length < 2
      || item.hashtags.length > 8
      || item.hashtags.some((tag) => !safeText(tag, 40))
      || !Array.isArray(item?.claimSourceRefs)
      || item.claimSourceRefs.length < 1
      || item.claimSourceRefs.some((ref) => !allowedRefs.has(ref))
      || requiredUrls.some((url) => !item.sourceNote.includes(url))
    ) return false;
  }
  return Object.keys(draft).every((key) => plan.targets.includes(key));
}

function safePlan(planResult) {
  const plan = planResult?.plan;
  if (
    planResult?.status !== "chinese_internet_rewrite_plan_ready"
    || planResult?.readyForLocalModelExecution !== true
    || !plan
    || plan.provider !== "ollama_local"
    || plan.endpoint !== LOCAL_ENDPOINT
    || plan.stream !== false
    || !safeText(plan.model, 120)
    || !HASH.test(planResult?.planFingerprint ?? "")
    || hash(plan) !== planResult.planFingerprint
    || !Array.isArray(plan.targets)
    || plan.targets.length < 1
    || !Array.isArray(plan.inputClaims)
    || plan.inputClaims.length < 1
    || !Array.isArray(plan.sourceLedger)
    || plan.sourceLedger.length < 2
  ) return null;
  return plan;
}

export async function executeChineseInternetRewrite(planResult, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const plan = safePlan(planResult);
  if (!plan) return blocked(["chinese_internet_rewrite_plan_invalid_or_tampered"]);
  if (typeof fetchImpl !== "function") return blocked(["local_model_transport_required"]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(LOCAL_ENDPOINT, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      signal:controller.signal,
      body:JSON.stringify({
        model:plan.model,
        stream:false,
        format:plan.outputSchema,
        messages:[
          { role:"system", content:plan.instruction },
          { role:"user", content:JSON.stringify({
            editorialAngle:plan.editorialAngle,
            inputClaims:plan.inputClaims,
            sourceLedger:plan.sourceLedger,
            targets:plan.targets,
          }) },
        ],
      }),
    });
  } catch {
    return blocked(["local_model_unreachable_or_timed_out"], 1);
  } finally {
    clearTimeout(timer);
  }
  if (!response?.ok) return blocked(["local_model_http_error"], 1);

  let payload;
  let draft;
  try {
    payload = await response.json();
    draft = JSON.parse(payload?.message?.content);
  } catch {
    return blocked(["local_model_response_not_json"], 1);
  }
  if (!validateDraft(draft, plan)) return blocked(["local_model_draft_contract_invalid"], 1);

  return {
    status:"chinese_internet_rewrite_generated_for_review",
    blockers:[],
    draft,
    draftFingerprint:hash(draft),
    sourcePlanFingerprint:planResult.planFingerprint,
    humanReviewRequired:true,
    modelCalls:1,
    draftSaved:false,
    publishTriggered:false,
  };
}
