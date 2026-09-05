import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { executeChineseInternetRewrite } from "../bridge/chinese-internet-rewrite-executor.mjs";
import { buildChineseInternetRewritePlan } from "../bridge/chinese-internet-rewrite-plan.mjs";

const blueprint = {
  editorialAngle:"验证本地模型能否生成严格受来源约束的双平台中文草稿",
  targets:["xiaohongshu", "douyin"],
  approvedClaimBlocks:[{
    blockId:"synthetic-claim-1",
    exactApprovedWording:"A fictional laboratory introduced an internal AI coding assistant.",
    uncertaintyNote:"Synthetic smoke-test fixture; this is not a real news claim.",
    sourceRefs:["synthetic-original", "synthetic-independent"],
    rewriteAllowed:false,
  }],
  sourceLedger:[
    { sourceRef:"synthetic-original", evidenceRole:"original", canonicalUrl:"https://example.com/synthetic-original" },
    { sourceRef:"synthetic-independent", evidenceRole:"independent", canonicalUrl:"https://example.org/synthetic-independent" },
  ],
};

const plan = buildChineseInternetRewritePlan({
  status:"accepted_claim_draft_blueprint_ready",
  blueprint,
  blueprintFingerprint:createHash("sha256").update(JSON.stringify(blueprint)).digest("hex"),
});
const result = await executeChineseInternetRewrite(plan, { timeoutMs:120_000 });

assert.equal(result.status, "chinese_internet_rewrite_generated_for_review", result.blockers.join(","));
assert.equal(result.humanReviewRequired, true);
assert.equal(result.draftSaved, false);
assert.equal(result.publishTriggered, false);
assert.equal(result.modelCalls, 1);

console.log(JSON.stringify({
  status:result.status,
  syntheticFixture:true,
  targets:Object.keys(result.draft),
  draftFingerprint:result.draftFingerprint,
  humanReviewRequired:result.humanReviewRequired,
  draftSaved:result.draftSaved,
  publishTriggered:result.publishTriggered,
}, null, 2));
