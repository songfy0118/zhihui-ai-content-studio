import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildChineseInternetRewritePlan } from "../bridge/chinese-internet-rewrite-plan.mjs";
import { executeChineseInternetRewrite } from "../bridge/chinese-internet-rewrite-executor.mjs";

function readyPlan() {
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
  return buildChineseInternetRewritePlan({
    status:"accepted_claim_draft_blueprint_ready",
    blueprint,
    blueprintFingerprint:createHash("sha256").update(JSON.stringify(blueprint)).digest("hex"),
  });
}

function validDraft() {
  const item = {
    title:"AI 助手先改变谁？",
    body:"公司已经为内部开发者引入 AI 编程助手，但目前没有经过核实的效率提升比例。",
    coverText:"AI 改写工程师工作",
    hashtags:["AI","程序员"],
    sourceNote:"来源：https://company.example/news https://news.example/report",
    claimSourceRefs:["claim-1-original","claim-1-independent"],
  };
  return { xiaohongshu:{ ...item }, douyin:{ ...item } };
}

test("calls only the fixed local Ollama endpoint and returns a review-only draft", async () => {
  let request;
  const result = await executeChineseInternetRewrite(readyPlan(), {
    fetchImpl:async (url, init) => {
      request = { url, init, body:JSON.parse(init.body) };
      return { ok:true, json:async () => ({ message:{ content:JSON.stringify(validDraft()) } }) };
    },
  });
  assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(request.body.stream, false);
  assert.equal(result.status, "chinese_internet_rewrite_generated_for_review");
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
});

test("rejects missing citations and tampered plans", async () => {
  const invalidDraft = validDraft();
  invalidDraft.douyin.sourceNote = "来源缺失";
  const invalid = await executeChineseInternetRewrite(readyPlan(), {
    fetchImpl:async () => ({ ok:true, json:async () => ({ message:{ content:JSON.stringify(invalidDraft) } }) }),
  });
  assert.deepEqual(invalid.blockers, ["local_model_draft_contract_invalid"]);

  const tampered = readyPlan();
  tampered.plan.endpoint = "https://example.com/api/chat";
  const blocked = await executeChineseInternetRewrite(tampered, { fetchImpl:async () => assert.fail("must not call") });
  assert.deepEqual(blocked.blockers, ["chinese_internet_rewrite_plan_invalid_or_tampered"]);
});

test("rejects copy that exceeds a target platform limit", async () => {
  const oversized = validDraft();
  oversized.xiaohongshu.title = "这是一个明显超过小红书二十字标题限制所以不能进入审核的标题";
  const result = await executeChineseInternetRewrite(readyPlan(), {
    fetchImpl:async () => ({ ok:true, json:async () => ({ message:{ content:JSON.stringify(oversized) } }) }),
  });
  assert.deepEqual(result.blockers, ["local_model_draft_contract_invalid"]);
  assert.equal(result.draftSaved, false);
});

test("rejects model-written traffic or virality guarantees", async () => {
  const promised = validDraft();
  promised.douyin.body = "照着这个写法做，保证百万播放。";
  const result = await executeChineseInternetRewrite(readyPlan(), {
    fetchImpl:async () => ({ ok:true, json:async () => ({ message:{ content:JSON.stringify(promised) } }) }),
  });
  assert.deepEqual(result.blockers, ["local_model_performance_promise_detected"]);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.publishTriggered, false);
});
