import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const TARGETS = new Set(["douyin", "xiaohongshu"]);
const PLATFORM_LIMITS = Object.freeze({
  xiaohongshu:Object.freeze({ title:20, coverText:16 }),
  douyin:Object.freeze({ title:30, coverText:16 }),
});

function cleanText(value, maximumLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text && text.length <= maximumLength ? text : null;
}

function blocked(blockers) {
  return {
    status:"chinese_internet_rewrite_plan_blocked",
    blockers:[...new Set(blockers)],
    plan:null,
    planFingerprint:null,
    readyForLocalModelExecution:false,
    modelCalls:0,
    sourceBodiesFetched:false,
    draftGenerated:false,
    draftSaved:false,
    publishTriggered:false,
  };
}

export function buildChineseInternetRewritePlan(blueprintResult, { model = "qwen3:4b" } = {}) {
  const blockers = [];
  const blueprint = blueprintResult?.blueprint;
  const modelName = cleanText(model, 120);
  if (blueprintResult?.status !== "accepted_claim_draft_blueprint_ready" || !blueprint) blockers.push("accepted_claim_blueprint_not_ready");
  if (!HASH.test(blueprintResult?.blueprintFingerprint ?? "")) blockers.push("accepted_claim_blueprint_fingerprint_invalid");
  if (blueprint && HASH.test(blueprintResult?.blueprintFingerprint ?? "") && createHash("sha256").update(JSON.stringify(blueprint)).digest("hex") !== blueprintResult.blueprintFingerprint) blockers.push("accepted_claim_blueprint_tampered");
  if (!modelName) blockers.push("local_model_required");
  if (!Array.isArray(blueprint?.targets) || blueprint.targets.some((target) => !TARGETS.has(target))) blockers.push("target_platform_invalid");
  if (!Array.isArray(blueprint?.approvedClaimBlocks) || blueprint.approvedClaimBlocks.length < 1) blockers.push("accepted_claims_required");
  if (!Array.isArray(blueprint?.sourceLedger) || blueprint.sourceLedger.length < 2) blockers.push("source_ledger_required");
  if (blueprint?.approvedClaimBlocks?.some((claim) => claim.rewriteAllowed !== false || !cleanText(claim.exactApprovedWording, 2000))) blockers.push("claim_boundary_invalid");
  if (blockers.length) return blocked(blockers);

  const inputClaims = blueprint.approvedClaimBlocks.map((claim) => ({
    blockId:claim.blockId,
    exactApprovedWording:claim.exactApprovedWording,
    uncertaintyNote:claim.uncertaintyNote,
    sourceRefs:[...claim.sourceRefs],
  }));
  const sourceLedger = blueprint.sourceLedger.map(({ sourceRef, evidenceRole, canonicalUrl }) => ({ sourceRef, evidenceRole, canonicalUrl }));
  const instruction = [
    "你是中文科技内容编辑。只使用 inputClaims 中已经人工接受的事实，不得新增数字、日期、公司动作、因果关系或预测。",
    "若事实为英文，先忠实转述为自然中文，再进行表达重组；不要逐句翻译，也不要模仿来源文章句式。",
    "标题和开头可以使用身份焦虑、利益冲突、反常识或强问题钩子，但钩子不得超出已接受事实。",
    "正文结构：一句结论、发生了什么、为什么与读者有关、仍不确定什么、讨论问题。",
    "分别输出 douyin 与 xiaohongshu 字段；每条事实保留 sourceRefs，sourceNote 保留原始链接。",
    "只返回 JSON，不要 Markdown。",
  ].join("\n");
  const outputSchema = {
    type:"object",
    required:blueprint.targets,
    properties:Object.fromEntries(blueprint.targets.map((target) => [target, {
      type:"object",
      required:["title","body","coverText","hashtags","sourceNote","claimSourceRefs"],
      additionalProperties:false,
      properties:{
        title:{ type:"string", minLength:1, maxLength:PLATFORM_LIMITS[target].title },
        body:{ type:"string", minLength:1, maxLength:20_000 },
        coverText:{ type:"string", minLength:1, maxLength:PLATFORM_LIMITS[target].coverText },
        hashtags:{ type:"array", minItems:2, maxItems:8, items:{ type:"string", minLength:1, maxLength:24 } },
        sourceNote:{ type:"string", minLength:1, maxLength:10_000 },
        claimSourceRefs:{ type:"array", minItems:1, items:{ type:"string" } },
      },
    }])),
  };
  const plan = {
    provider:"ollama_local",
    endpoint:"http://127.0.0.1:11434/api/chat",
    model:modelName,
    stream:false,
    blueprintFingerprint:blueprintResult.blueprintFingerprint,
    editorialAngle:blueprint.editorialAngle,
    targets:[...blueprint.targets],
    instruction,
    inputClaims,
    sourceLedger,
    outputSchema,
    constraints:[
      "accepted_claims_only",
      "faithful_translation_before_editorial_rewrite",
      "no_source_style_imitation",
      "no_unsupported_clickbait",
      "source_links_required",
      "human_review_before_handoff",
    ],
  };
  return {
    status:"chinese_internet_rewrite_plan_ready",
    blockers:[],
    plan,
    planFingerprint:createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
    readyForLocalModelExecution:true,
    modelCalls:0,
    sourceBodiesFetched:false,
    draftGenerated:false,
    draftSaved:false,
    publishTriggered:false,
  };
}
