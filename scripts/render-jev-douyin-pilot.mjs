import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildPlatformTextVisualAssetPlan } from "../bridge/platform-text-visual-asset-plan.mjs";
import { renderPlatformTextVisualSvgAssets } from "../bridge/platform-text-visual-svg-renderer.mjs";
import { exportPlatformTextSvgBundle } from "../bridge/platform-text-svg-bundle-exporter.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const title = "Jev火了：AI开始从回答问题，转向替软件做决定";
const coverText = "AI不聊天了\n它开始做决定";
const body = [
  "先说结论：Jev不是另一个聊天机器人。TypeSafe AI把它称为第一款“System One Model”。它放弃长文本生成，专门给软件返回可以直接执行的结构化判断。",
  "普通大模型擅长写答案，Jev只做三类事：Choice，从候选项里选一个；Score，给一件事打分；Noul，返回“是或否”的概率。输出还会附带概率与置信度。",
  "为什么现在火？因为AI Agent真正卡住的，往往不是“不会写”，而是每一步都要判断：该调用哪个工具？风险高不高？要不要交给人工？用大模型做这些小判断，可能又慢又贵。",
  "Jev想补的正是这块：把模糊判断变成程序里的“智能 if”。例如邮件分流、客服工单升级、模型路由、浏览器操作判断，都可以先让它给出结构化概率，再由代码决定下一步。",
  "官方的 side-by-side 演示最直观：面对同一批判断题，传统大模型还在逐字生成答案，Jev会并行返回多个概率。它追求的不是文采，而是让软件尽快拿到一个格式固定、能继续执行的结果。",
  "举个例子：一个AI客服收到投诉后，可以同时判断“是不是退款问题”“紧急程度多高”“要不要转人工”“该分给哪个团队”。这些结果不是一段解释，而是四个程序可以直接读取的字段。",
  "它不是大模型替代品，更像大模型的搭档：大模型负责理解、推理和写作；Jev负责高频、快速、格式固定的判断。两者组合，才更接近能稳定工作的自动化系统。",
  "对开发者来说，真正的变化可能不是又多了一个模型，而是AI工作流的分工开始细化：写作交给生成模型，检索交给搜索系统，关键判断交给决策模型，最终动作仍由代码和权限规则控制。",
  "但别急着封神。TypeSafe公布的速度、成本和准确性主要来自官方测试；Jev仍处于早期开放阶段。类型正确不等于判断一定正确，真正上线仍要设阈值、留人工审核，并用自己的数据验证。",
  "接下来最值得看三件事：第三方能否复现官方结果；复杂任务里它和小型开源模型谁更划算；当判断出错时，概率与置信度能否真的帮助系统及时停手。",
  "来源：TypeSafe AI 官方网站与 2026-09-15 发布的《Introducing System One Models & Jev》。本文是中文解释，不代表独立复现实验。你更看好“会说话的AI”，还是“会做决定的AI”？",
].join("\n\n");
const hashtags = ["Jev", "AI", "智能体", "硅谷", "Claude", "GitHub"];
const sourceNote = "来源：TypeSafe AI 官网及 2026-09-15 官方发布《Introducing System One Models & Jev》；未把官方基准当作独立验证。";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const requiredHumanSteps = [
  "open_official_creator_page_after_separate_authorization",
  "verify_visible_account_identity",
  "prepare_and_review_visual_assets",
  "copy_reviewed_text_into_creator_form",
  "request_separate_authorization_before_saving_draft",
];
const draftContent = {
  platform: "douyin",
  contentMode: "text_image_post_structure",
  title,
  body,
  coverText,
  hashtags,
  sourceNote,
  copyOrigin: "human_packaging_plus_exact_accepted_claims",
  status: "preview_not_saved",
};
const draftFingerprint = hash(draftContent);
const reviewFingerprint = hash({ draftFingerprint, sourceNote, reviewed: true });
const handoffItem = {
  platform: "douyin",
  creatorEntryUrl: "https://creator.douyin.com/creator-micro/content/upload",
  interactionMode: "visible_browser_manual",
  contentMode: draftContent.contentMode,
  title,
  body,
  coverText,
  hashtags,
  sourceNote,
  draftFingerprint,
  reviewFingerprint,
  requiredHumanSteps,
  visualAssets: [],
  draftSaveAuthorized: false,
};
const draftPreviewFingerprint = hash({ title, body, hashtags, sourceNote });
const handoffItems = [handoffItem];
const handoffFingerprint = hash({ draftPreviewFingerprint, reviewFingerprint, handoffItems });
const handoffPlan = {
  status: "platform_text_draft_handoff_plan_ready",
  copyHandoffReady: true,
  eligibleForVisibleBrowserOpenAuthorization: true,
  visualAssetsRequired: true,
  assetUploadReady: false,
  readyForDraftHandoff: false,
  draftPreviewFingerprint,
  reviewFingerprint,
  handoffFingerprint,
  handoffItems,
};

const assetPlan = buildPlatformTextVisualAssetPlan(handoffPlan);
if (assetPlan.status !== "platform_text_visual_asset_plan_ready") {
  throw new Error(`asset plan blocked: ${assetPlan.blockers.join(", ")}`);
}

// The production planner's 320-character ceiling is safe for copy storage but
// too dense for a readable 9:16 card. Rebalance this pilot to 220 characters
// without changing a single character of the reviewed body copy.
const platformPlan = assetPlan.platformPlans[0];
const compactCards = [];
let cursor = 0;
while (cursor < body.length) {
  let end = Math.min(cursor + 220, body.length);
  if (end < body.length) {
    const boundary = Math.max(body.lastIndexOf("\n\n", end), body.lastIndexOf("。", end) + 1);
    if (boundary > cursor + 120) end = boundary;
  }
  compactCards.push({
    cardIndex: compactCards.length + 2,
    role: "body",
    exactText: body.slice(cursor, end),
    textStart: cursor,
    textEnd: end,
    renderStatus: "planned_not_generated",
  });
  cursor = end;
}
platformPlan.cards = [platformPlan.cards[0], ...compactCards];
platformPlan.plannedAssetCount = platformPlan.cards.length;
assetPlan.plannedAssetCount = platformPlan.cards.length;
assetPlan.assetPlanFingerprint = hash({
  sourceHandoffFingerprint: assetPlan.sourceHandoffFingerprint,
  platformPlans: assetPlan.platformPlans,
});
const render = renderPlatformTextVisualSvgAssets(assetPlan);
if (render.status !== "platform_text_visual_svg_render_ready") {
  throw new Error(`render blocked: ${render.blockers.join(", ")}`);
}
const exported = await exportPlatformTextSvgBundle(render, {
  workspaceRoot,
  confirmation: `EXPORT REVIEWED SVG BUNDLE ${render.renderFingerprint}`,
});
if (exported.status !== "platform_text_svg_bundle_export_ready_for_human_review") {
  throw new Error(`export blocked: ${exported.blockers.join(", ")}`);
}

const outputDirectory = resolve(workspaceRoot, exported.outputDirectory);
const copyPackage = {
  title,
  caption: `${body}\n\n${hashtags.map((tag) => `#${tag}`).join(" ")}\n\n${sourceNote}`,
  sourceNote,
  savedToDouyinDraft: false,
  published: false,
};
await writeFile(join(outputDirectory, "copy.json"), `${JSON.stringify(copyPackage, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: "jev_douyin_pilot_ready_for_review",
  outputDirectory: exported.outputDirectory,
  svgFiles: exported.generatedFiles.filter((file) => file.endsWith(".svg")),
  title,
  cardCount: render.assets.length,
  savedToDouyinDraft: false,
  published: false,
}, null, 2));
