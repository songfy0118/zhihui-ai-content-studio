import assert from "node:assert/strict";
import test from "node:test";

import { generateUnverifiedTopicDraft } from "../bridge/topic-draft-executor.mjs";

test("generates a review-only local topic draft without saving or publishing", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message:{ content:JSON.stringify({
    title:"AI 会让程序员消失吗？",
    body:"先别急着下结论。这个问题需要拆成岗位、工具和能力变化分别讨论，哪些已经发生、哪些仍只是推测，也要逐项补证。正式发布前需补齐公开来源并人工核验。",
    hashtags:["AI职场","科技观察","程序员"],
  }) } }), { status:200, headers:{ "Content-Type":"application/json" } });
  const result = await generateUnverifiedTopicDraft({ id:"coding", title:"AI 会写代码之后，程序员会消失吗？", angle:"拆解岗位与能力变化", category:"AI职场" }, { fetchImpl });
  assert.equal(result.status, "model_generated_unverified");
  assert.equal(result.modelCalls, 1);
  assert.equal(result.sourceLockReady, false);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.draftSaved, false);
  assert.equal(result.publishTriggered, false);
});

test("blocks malformed model output", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message:{ content:"{}" } }), { status:200 });
  const result = await generateUnverifiedTopicDraft({ id:"coding", title:"题目", angle:"角度", category:"AI" }, { fetchImpl });
  assert.equal(result.status, "topic_draft_blocked");
  assert.equal(result.modelCalls, 0);
});
