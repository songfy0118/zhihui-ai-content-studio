import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildChineseInternetRewritePlan } from "../bridge/chinese-internet-rewrite-plan.mjs";

function readyBlueprint() {
  const blueprint = {
    editorialAngle:"解释 AI 编程工具如何改变初级工程师的工作内容",
    targets:["xiaohongshu","douyin"],
    approvedClaimBlocks:[{
      blockId:"claim-1",
      exactApprovedWording:"The company introduced an AI coding assistant for internal developers.",
      uncertaintyNote:"No verified productivity percentage is available.",
      sourceRefs:["claim-1-original","claim-1-independent"],
      rewriteAllowed:false,
    }],
    sourceLedger:[
      { sourceRef:"claim-1-original", evidenceRole:"original", canonicalUrl:"https://company.example/news" },
      { sourceRef:"claim-1-independent", evidenceRole:"independent", canonicalUrl:"https://news.example/report" },
    ],
  };
  return {
    status:"accepted_claim_draft_blueprint_ready",
    blueprint,
    blueprintFingerprint:createHash("sha256").update(JSON.stringify(blueprint)).digest("hex"),
  };
}

test("plans faithful English-to-Chinese internet rewriting from accepted claims only", () => {
  const result = buildChineseInternetRewritePlan(readyBlueprint());
  assert.equal(result.status, "chinese_internet_rewrite_plan_ready");
  assert.equal(result.plan.provider, "ollama_local");
  assert.equal(result.plan.model, "qwen3:4b");
  assert.match(result.plan.instruction, /不得新增数字/);
  assert.match(result.plan.instruction, /不要逐句翻译/);
  assert.deepEqual(result.plan.inputClaims[0].sourceRefs, ["claim-1-original","claim-1-independent"]);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.draftGenerated, false);
  assert.equal(result.publishTriggered, false);
});

test("blocks unreviewed or rewriteable claims", () => {
  const missing = buildChineseInternetRewritePlan(null);
  assert.ok(missing.blockers.includes("accepted_claim_blueprint_not_ready"));

  const tampered = readyBlueprint();
  tampered.blueprint.approvedClaimBlocks[0].rewriteAllowed = true;
  const result = buildChineseInternetRewritePlan(tampered);
  assert.ok(result.blockers.includes("claim_boundary_invalid"));
  assert.equal(result.readyForLocalModelExecution, false);
});
