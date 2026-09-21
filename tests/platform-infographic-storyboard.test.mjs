import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlatformInfographicStoryboard,
  isPlatformInfographicStoryboard,
} from "../bridge/platform-infographic-storyboard.mjs";

function readyInput() {
  const claims = [
    {
      id: "claim-1",
      text: "官方资料说明产品返回结构化判断。",
      sourceUrl: "https://official.example/release",
      sourceLocked: true,
    },
  ];
  const section = (type, headline) => ({
    type,
    headline,
    purpose: "把一个已锁定事实转换成一张可读的图解卡。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["claim-1"],
    exactLabels: [headline, "结构化判断"],
    drawInstructions: ["画一个输入框、一个结构化结果框，并用单向箭头连接。"],
  });
  return {
    platform: "douyin",
    topic: "结构化 AI 判断",
    claims,
    sections: [
      section("hook", "为什么不是聊天机器人"),
      section("comparison", "两种输出方式"),
      section("process", "判断如何进入程序"),
    ],
  };
}

test("compiles source-locked claims into deterministic visual prompts", () => {
  const first = buildPlatformInfographicStoryboard(readyInput());
  const second = buildPlatformInfographicStoryboard(readyInput());

  assert.deepEqual(first, second);
  assert.equal(first.status, "platform_infographic_storyboard_ready");
  assert.equal(first.cardCount, 3);
  assert.equal(isPlatformInfographicStoryboard(first), true);
  assert.ok(first.cards.every(({ visualPrompt }) => visualPrompt.includes("1080×1920")));
  assert.ok(first.cards.every(({ visualPrompt }) => visualPrompt.includes("SVG/HTML")));
  assert.ok(first.cards.every(({ visualPrompt }) => visualPrompt.includes("不交给图片模型重写")));
  assert.ok(first.cards.every(({ visualPrompt }) => visualPrompt.includes("每页只解释一个核心判断")));
  assert.equal(first.assetsGenerated, 0);
  assert.equal(first.modelCalls, 0);
  assert.equal(first.publishTriggered, false);
});

test("rejects unsupported layouts and claims without a source lock", () => {
  const unsupported = readyInput();
  unsupported.sections[1].type = "pretty_text_wall";
  assert.deepEqual(
    buildPlatformInfographicStoryboard(unsupported).blockers,
    ["card_type_invalid:2"],
  );

  const unlocked = readyInput();
  unlocked.claims[0].sourceLocked = false;
  assert.ok(buildPlatformInfographicStoryboard(unlocked).blockers.includes("source_locked_claims_invalid"));
});

test("rejects numeric facts that are not linked to a locked claim", () => {
  const input = readyInput();
  input.sections[0].numericFacts = [
    { label: "准确率", displayValue: "99%", claimId: "invented-claim" },
  ];

  assert.deepEqual(
    buildPlatformInfographicStoryboard(input).blockers,
    ["card_numeric_fact_unlocked:1"],
  );
});

test("does not allow one card to omit evidence, exact labels or drawing instructions", () => {
  const input = readyInput();
  input.sections[0].evidenceClaimIds = [];
  input.sections[1].exactLabels = [];
  input.sections[2].drawInstructions = [];

  assert.deepEqual(buildPlatformInfographicStoryboard(input).blockers, [
    "card_evidence_invalid:1",
    "card_exact_labels_invalid:2",
    "card_draw_instructions_invalid:3",
  ]);
});
