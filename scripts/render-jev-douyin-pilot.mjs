import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildPlatformTextVisualAssetPlan } from "../bridge/platform-text-visual-asset-plan.mjs";
import { renderPlatformTextVisualSvgAssets } from "../bridge/platform-text-visual-svg-renderer.mjs";
import { exportPlatformTextSvgBundle } from "../bridge/platform-text-svg-bundle-exporter.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const title = "Jev火了：别再让大模型做所有决定";
const coverText = "AI真正的瓶颈\n可能不是推理";
const body = [
  "先说结论\nJev不是另一个聊天机器人。它不写长答案，只返回软件能直接执行的结构化判断：Choice负责选择，Score负责打分，Noul返回“是或否”的概率。",
  "为什么突然火？\nAI Agent真正卡住的，往往不是“不会写”，而是每一步都要判断：调用哪个工具？风险高不高？要不要交给人工？拿大模型做所有小判断，可能又慢又贵。",
  "它想补哪块？\n把模糊判断变成程序里的“智能 if”。邮件分流、客服升级、模型路由、浏览器操作，都可以先拿到结构化概率，再由代码决定下一步。",
  "一个真实场景\nAI客服收到投诉后，同时判断：是不是退款问题、紧急程度多高、要不要转人工、该分给哪个团队。官方演示里，Jev会并行返回多个概率，而不是逐字生成一段解释。",
  "它会取代大模型吗？\n更像搭档。大模型负责理解、推理和写作；Jev负责高频、快速、格式固定的判断。AI工作流开始从“一个模型包办全部”，转向多种模型分工。",
  "但别急着封神\n速度、成本和准确性目前主要来自TypeSafe官方测试，Jev仍在早期阶段。类型正确不等于判断正确；真正上线仍要设阈值、留人工审核，并用自己的数据验证。",
  "接下来观察什么？\n第三方能否复现结果；它和小型开源模型谁更划算；判断出错时，概率与置信度能否真的帮助系统及时停手。你更看好“会说话的AI”，还是“会做决定的AI”？",
  "来源\nTypeSafe AI官方网站与2026-09-15发布的《Introducing System One Models & Jev》。本文是中文解释，不代表独立复现实验。",
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

// Keep one reviewed question-and-answer section per card. Trailing separators
// remain attached to the preceding card so the exact body copy stays lossless.
const platformPlan = assetPlan.platformPlans[0];
const compactCards = [];
let cursor = 0;
for (const section of body.match(/.*?(?:\n\n|$)/gs)?.filter(Boolean) ?? []) {
  const end = cursor + section.length;
  compactCards.push({
    cardIndex: compactCards.length + 2,
    role: "body",
    exactText: section,
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
