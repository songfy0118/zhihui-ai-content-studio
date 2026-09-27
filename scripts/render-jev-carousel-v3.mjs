import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const WIDTH = 1080;
const HEIGHT = 1440;
const OUT = resolve(import.meta.dirname, "..", "public", "pilots", "jev-carousel-v3");
const C = {
  paper: "#f7f5ef",
  ink: "#161b22",
  muted: "#53606c",
  rule: "#b7bcc2",
  blue: "#2457c5",
  bluePale: "#e9effc",
  orange: "#d4552d",
  orangePale: "#faeae3",
  slate: "#e8ebee",
  white: "#ffffff",
};

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const text = (x, y, value, className = "body", extra = "") => {
  const attributes = extra.replace(/fill="([^"]+)"/g, 'style="fill:$1"');
  return `<text x="${x}" y="${y}" class="${className}" ${attributes}>${esc(value)}</text>`;
};

const rule = (x1, y1, x2, y2, color = C.rule, width = 2, dash = "") =>
  `<path d="M${x1} ${y1}H${x2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;

const pill = (x, y, width, label, fill = C.blue, color = C.white) => `
  <rect x="${x}" y="${y}" width="${width}" height="42" rx="21" fill="${fill}"/>
  ${text(x + width / 2, y + 29, label, "pill", `fill="${color}" text-anchor="middle"`)}
`;

const note = (x, y, width, label, fill = C.bluePale, color = C.blue) => `
  <rect x="${x}" y="${y}" width="${width}" height="54" rx="8" fill="${fill}"/>
  <rect x="${x}" y="${y}" width="6" height="54" rx="3" fill="${color}"/>
  ${text(x + 22, y + 35, label, "note", `fill="${color}"`)}
`;

const source = (label) => text(72, 1325, label, "source");

const frame = ({ index, section, headline, deck, body, accent = C.blue }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>${esc(headline)}</title>
  <defs>
    <pattern id="paper-grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#1f2937" stroke-opacity=".025"/>
    </pattern>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#111827" flood-opacity=".08"/>
    </filter>
    <style>
      .sans{font-family:"Microsoft YaHei","Noto Sans SC",Arial,sans-serif;fill:${C.ink}}
      .serif{font-family:"SimSun","Noto Serif SC",serif;fill:${C.ink}}
      .mono{font-family:Consolas,"SFMono-Regular",monospace}
      .section{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:21px;font-weight:800;letter-spacing:1.2px;fill:${accent}}
      .headline{font-family:"SimSun","Noto Serif SC",serif;font-size:57px;font-weight:900;fill:${C.ink}}
      .deck{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:25px;font-weight:600;fill:${C.muted}}
      .h2{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:29px;font-weight:900;fill:${C.ink}}
      .h3{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:23px;font-weight:800;fill:${C.ink}}
      .body{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:22px;fill:${C.ink}}
      .small{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:18px;fill:${C.muted}}
      .tiny{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:15px;fill:${C.muted}}
      .source{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:14px;fill:#707983}
      .pill{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:17px;font-weight:800}
      .note{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:18px;font-weight:700}
    </style>
  </defs>
  <rect width="1080" height="1440" fill="${C.paper}"/>
  <rect width="1080" height="1440" fill="url(#paper-grid)"/>
  <rect x="0" y="0" width="18" height="1440" fill="${accent}"/>
  ${text(72, 72, section, "section")}
  ${text(1008, 72, `FIELD NOTE  ·  ${String(index).padStart(2, "0")}/07`, "tiny", 'text-anchor="end"')}
  ${rule(72, 96, 1008, 96, accent, 3)}
  ${text(72, 165, headline, "headline")}
  ${text(72, 217, deck, "deck")}
  ${rule(72, 1278, 1008, 1278, C.rule, 1)}
  ${text(1008, 1325, "JEV / SYSTEM ONE · RESEARCH EXPLAINER", "source", 'text-anchor="end"')}
  ${body}
</svg>`;

const cards = [
  {
    slug: "01-cover",
    svg: frame({
      index: 1,
      section: "硅谷热议 · JEV 决策模型",
      headline: "硅谷热议 JEV：AI 不聊天，只拍板",
      deck: "它不写答案，只把客服、风控和 Agent 的下一步变成可计算的决定",
      accent: C.orange,
      body: `
        ${pill(72, 270, 188, "API-ONLY MODEL", C.orange)}
        ${pill(274, 270, 250, "CHOICE · SCORE · NOUL", C.ink)}
        ${pill(538, 270, 286, "GitHub 已有开源接入层", C.blue)}
        <g transform="translate(72 336)" filter="url(#soft-shadow)">
          <rect width="936" height="224" rx="16" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/>
          ${text(28, 45, "它具体干嘛？", "h2")}
          ${text(28, 84, "把一段业务状态，变成代码能直接读取的结构化判断。", "body")}
          <g transform="translate(28 116)">
            <rect width="190" height="68" rx="10" fill="${C.slate}"/>${text(95, 42, "聊天 / 表单 / 记录", "small", 'text-anchor="middle"')}
            <path d="M204 34h46" stroke="${C.ink}" stroke-width="3"/><path d="M237 23l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="264" width="118" height="68" rx="10" fill="${C.orangePale}" stroke="${C.orange}" stroke-width="2"/>${text(323, 43, "JEV", "h3", `fill="${C.orange}" text-anchor="middle"`)}
            <path d="M396 34h46" stroke="${C.ink}" stroke-width="3"/><path d="M429 23l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="456" width="218" height="68" rx="10" fill="${C.bluePale}" stroke="${C.blue}"/>${text(565, 28, "选项 / 分数 / 概率", "small", `fill="${C.blue}" text-anchor="middle"`)}${text(565, 53, "+ confidence", "tiny", 'text-anchor="middle"')}
            <path d="M688 34h46" stroke="${C.ink}" stroke-width="3"/><path d="M721 23l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="748" width="132" height="68" rx="10" fill="${C.ink}"/>${text(814, 28, "你的代码", "small", `fill="${C.white}" text-anchor="middle"`)}${text(814, 53, "决定下一步", "tiny", `fill="#d1d5db" text-anchor="middle"`)}
          </g>
        </g>
        ${text(72, 612, "四类可落地场景", "h2")}
        <g transform="translate(72 640)">
          <rect width="454" height="174" rx="14" fill="${C.bluePale}" stroke="${C.blue}"/>
          ${text(22, 38, "微信私域 / 社群", "h3", `fill="${C.blue}"`)}
          ${text(22, 78, "识别咨询意图 · 用户分层", "body")}
          ${text(22, 116, "线索评分 · 低信心转人工", "body")}
          ${text(22, 151, "不能自动加好友或群发", "small")}
          <rect x="482" width="454" height="174" rx="14" fill="${C.orangePale}" stroke="${C.orange}"/>
          ${text(504, 38, "客服 / CRM", "h3", `fill="${C.orange}"`)}
          ${text(504, 78, "工单路由 · 紧急度评分", "body")}
          ${text(504, 116, "退款诉求识别 · 异常升级", "body")}
          ${text(504, 151, "最终回复仍由人或大模型生成", "small")}
          <rect y="194" width="454" height="174" rx="14" fill="${C.white}" stroke="${C.ink}"/>
          ${text(22, 232, "企业管理", "h3")}
          ${text(22, 272, "审批优先级 · 资料完整性", "body")}
          ${text(22, 310, "任务分派 · 异常转负责人", "body")}
          ${text(22, 345, "模型不拥有审批权限", "small")}
          <rect x="482" y="194" width="454" height="174" rx="14" fill="${C.white}" stroke="${C.ink}"/>
          ${text(504, 232, "金融辅助", "h3")}
          ${text(504, 272, "材料分类 · 风险信号评分", "body")}
          ${text(504, 310, "交易复核排序 · 人工升级", "body")}
          ${text(504, 345, "不直接批准贷款或交易", "small")}
        </g>
        ${note(72, 1044, 936, "边界：Jev 只返回判断信号；微信操作、审批、转账、发布仍由受控系统和人执行。", C.orangePale, C.orange)}
        <g transform="translate(72 1120)">
          ${text(0, 26, "官方入口", "h3")}
          ${text(0, 58, "api.typesafe.ai/docs", "mono", `font-size="17" fill="${C.blue}"`)}
          ${text(240, 58, "github.com/lukeramsden/system-one", "mono", `font-size="17" fill="${C.blue}"`)}
          ${text(240, 88, "github.com/kuldeepsinh19/jev-decision-gateway", "mono", `font-size="17" fill="${C.blue}"`)}
        </g>
        ${source("说明：GitHub 项目为社区接入与复现；Jev 本体是托管模型，不等于开源权重。")}
      `,
    }),
  },
  {
    slug: "02-comparison",
    svg: frame({
      index: 2,
      section: "01 · MODEL DIVISION",
      headline: "聊天模型 vs 决策模型",
      deck: "差别不是“谁更聪明”，而是输出空间、失败方式和使用位置完全不同",
      body: `
        <g transform="translate(72 286)" filter="url(#soft-shadow)">
          <rect width="936" height="690" rx="16" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/>
          <rect width="936" height="70" rx="16" fill="${C.ink}"/>
          ${text(28, 45, "比较维度", "h3", `fill="${C.white}"`)}
          ${text(320, 45, "通用聊天模型", "h3", `fill="${C.white}"`)}
          ${text(648, 45, "Jev / 决策模型", "h3", `fill="${C.white}"`)}
          ${rule(292, 70, 292, 690, C.rule, 1)}
          ${rule(620, 70, 620, 690, C.rule, 1)}
          ${[168,266,364,462,560,658].map((y) => rule(0, y, 936, y, C.rule, 1)).join("")}
          ${text(28, 128, "核心输出", "h3")}
          ${text(320, 113, "自然语言 / 代码", "body")}${text(320, 145, "答案空间开放", "small")}
          ${text(648, 113, "Choice / Score / Noul", "body")}${text(648, 145, "答案空间预先定义", "small")}
          ${text(28, 226, "擅长任务", "h3")}
          ${text(320, 211, "解释、推理、创作", "body")}${text(320, 243, "规划复杂步骤", "small")}
          ${text(648, 211, "路由、分类、评分", "body")}${text(648, 243, "门控与是否升级", "small")}
          ${text(28, 324, "典型失败", "h3")}
          ${text(320, 309, "说得合理但事实错", "body")}${text(320, 341, "格式可能漂移", "small")}
          ${text(648, 309, "格式正确但判断错", "body")}${text(648, 341, "置信度不等于正确率", "small")}
          ${text(28, 422, "工程处理", "h3")}
          ${text(320, 407, "解析、验证、重试", "body")}${text(320, 439, "保留引用和证据", "small")}
          ${text(648, 407, "阈值、校准、兜底", "body")}${text(648, 439, "低信心转人或推理模型", "small")}
          ${text(28, 520, "适合位置", "h3")}
          ${text(320, 505, "前端理解与内容生成", "body")}${text(320, 537, "复杂问题的慢思考", "small")}
          ${text(648, 505, "工作流中间的窄判断", "body")}${text(648, 537, "大量重复的小决策", "small")}
          ${text(28, 618, "一句话", "h3")}
          ${text(320, 618, "把问题讲明白", "body", `fill="${C.blue}" font-weight="800"`)}
          ${text(648, 618, "把下一步选出来", "body", `fill="${C.orange}" font-weight="800"`)}
        </g>
        ${note(72, 1014, 936, "适合分工，不代表固定搭配；具体模型选择仍取决于任务、数据与风险。")}
        ${text(72, 1112, "读图方法", "h2")}
        ${text(72, 1154, "不要问“谁替代谁”，先问：这个步骤需要自由表达，还是有限选项里的可靠判断？", "body")}
        ${text(72, 1200, "只有后者，才是 Jev 这类决策模型的主战场。", "body")}
        ${source("资料：[1] TypeSafe AI Architecture / SDK；[2] Jev FAQ。")}
      `,
    }),
  },
  {
    slug: "03-primitives",
    svg: frame({
      index: 3,
      section: "02 · THREE PRIMITIVES",
      headline: "Choice、Score、Noul 到底返回什么？",
      deck: "同一份 state 可以并行回答多个问题；真正落地靠的是字段与阈值",
      accent: C.orange,
      body: `
        <g transform="translate(72 278)">
          <g filter="url(#soft-shadow)">
            <rect width="296" height="750" rx="14" fill="${C.white}" stroke="${C.blue}" stroke-width="2"/>
            <rect width="296" height="62" rx="14" fill="${C.blue}"/>
            ${text(20, 40, "CHOICE · 选一个", "h3", `fill="${C.white}"`)}
            ${text(20, 105, "问题", "small")}${text(20, 139, "该工单交给谁？", "body")}
            ${rule(20, 165, 276, 165)}
            ${text(20, 205, "候选集合", "small")}
            ${pill(20, 225, 92, "billing", C.bluePale, C.blue)}
            ${pill(118, 225, 100, "technical", C.slate, C.ink)}
            ${pill(20, 277, 86, "account", C.slate, C.ink)}
            ${pill(112, 277, 70, "other", C.slate, C.ink)}
            ${text(20, 355, "返回", "small")}
            <rect x="20" y="374" width="256" height="155" rx="8" fill="#111827"/>
            ${text(34, 410, 'choice: "billing"', "mono", `font-size="17" fill="#dbeafe"`)}
            ${text(34, 442, "p: {billing: .87,", "mono", `font-size="17" fill="#dbeafe"`)}
            ${text(34, 474, " technical: .13}", "mono", `font-size="17" fill="#dbeafe"`)}
            ${text(34, 506, "confidence: .80", "mono", `font-size="17" fill="#fdba74"`)}
            ${text(20, 576, "适合", "small")}${text(20, 610, "工具路由 / 意图分类", "body")}
            ${text(20, 646, "有限集合中的唯一选择", "body")}
            ${note(20, 680, 256, "必须保留 other / none")}
          </g>
          <g transform="translate(320)" filter="url(#soft-shadow)">
            <rect width="296" height="750" rx="14" fill="${C.white}" stroke="${C.orange}" stroke-width="2"/>
            <rect width="296" height="62" rx="14" fill="${C.orange}"/>
            ${text(20, 40, "SCORE · 排位置", "h3", `fill="${C.white}"`)}
            ${text(20, 105, "问题", "small")}${text(20, 139, "风险程度有多高？", "body")}
            ${rule(20, 165, 276, 165)}
            ${text(20, 205, "有序量表", "small")}
            ${text(20, 246, "1 低", "body")}${text(110, 246, "2 中", "body")}${text(202, 246, "3 高", "body")}
            <path d="M32 292H264" stroke="${C.rule}" stroke-width="12" stroke-linecap="round"/>
            <path d="M32 292H191" stroke="${C.orange}" stroke-width="12" stroke-linecap="round"/>
            <circle cx="191" cy="292" r="16" fill="${C.white}" stroke="${C.orange}" stroke-width="5"/>
            ${text(20, 355, "返回", "small")}
            <rect x="20" y="374" width="256" height="155" rx="8" fill="#111827"/>
            ${text(34, 410, "score: 2.36", "mono", `font-size="17" fill="#ffedd5"`)}
            ${text(34, 442, "levels: [1,2,3]", "mono", `font-size="17" fill="#ffedd5"`)}
            ${text(34, 474, "distribution: [...]", "mono", `font-size="17" fill="#ffedd5"`)}
            ${text(34, 506, "confidence: .74", "mono", `font-size="17" fill="#fdba74"`)}
            ${text(20, 576, "适合", "small")}${text(20, 610, "风险 / 质量 / 紧迫度", "body")}
            ${text(20, 646, "在有序区间里定位", "body")}
            ${note(20, 680, 256, "等级必须写清边界", C.orangePale, C.orange)}
          </g>
          <g transform="translate(640)" filter="url(#soft-shadow)">
            <rect width="296" height="750" rx="14" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/>
            <rect width="296" height="62" rx="14" fill="${C.ink}"/>
            ${text(20, 40, "NOUL · 是 / 否概率", "h3", `fill="${C.white}"`)}
            ${text(20, 105, "命题", "small")}${text(20, 139, "是否需要转人工？", "body")}
            ${rule(20, 165, 276, 165)}
            ${text(20, 205, "概率刻度", "small")}
            <path d="M40 305A108 108 0 01256 305" fill="none" stroke="${C.slate}" stroke-width="22" stroke-linecap="round"/>
            <path d="M148 305l72-74" stroke="${C.orange}" stroke-width="6"/>
            <circle cx="148" cy="305" r="13" fill="${C.white}" stroke="${C.orange}" stroke-width="4"/>
            ${text(40, 333, "0", "small")}${text(246, 333, "1", "small")}
            ${text(20, 355, "返回", "small")}
            <rect x="20" y="374" width="256" height="155" rx="8" fill="#111827"/>
            ${text(34, 416, "type: \"noul\"", "mono", `font-size="17" fill="#f3f4f6"`)}
            ${text(34, 458, "noul: 0.83", "mono", `font-size="17" fill="#fdba74"`)}
            ${text(34, 500, "// P(answer=yes)", "mono", `font-size="17" fill="#9ca3af"`)}
            ${text(20, 576, "适合", "small")}${text(20, 610, "拦截 / 升级 / 是否执行", "body")}
            ${text(20, 646, "二元命题的概率判断", "body")}
            ${note(20, 680, 256, "0.5 = 无法判断", C.slate, C.ink)}
          </g>
        </g>
        ${note(72, 1065, 936, "注意：Choice/Score 的 confidence 是分布集中度，不是“答对概率”。")}
        ${text(72, 1148, "工程原则", "h2")}
        ${text(72, 1190, "模型只返回判断；是否自动执行、要求确认还是转人工，必须由你的代码决定。", "body")}
        ${source("资料：[1] TypeSafe AI Architecture；[3] souvikr/jev-test README。示例数值仅为结构演示。")}
      `,
    }),
  },
  {
    slug: "04-control-loop",
    svg: frame({
      index: 4,
      section: "03 · CONTROL LOOP",
      headline: "真正的产品，是可回滚的决策链",
      deck: "输入、判断、阈值、执行、反馈缺一不可；模型只是其中一个盒子",
      body: `
        <g transform="translate(72 292)" filter="url(#soft-shadow)">
          <rect width="936" height="500" rx="16" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/>
          ${text(28, 48, "AGENT DECISION CONTROL PLANE", "h3")}
          ${text(774, 48, "可审计 / 可暂停 / 可回滚", "small", `fill="${C.orange}"`)}
          <g transform="translate(28 102)">
            <rect width="150" height="98" rx="10" fill="${C.slate}"/>${text(75, 41, "STATE", "h3", 'text-anchor="middle"')}${text(75, 72, "上下文与证据", "small", 'text-anchor="middle"')}
            <path d="M164 49h54" stroke="${C.ink}" stroke-width="3"/><path d="M204 38l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="232" width="150" height="98" rx="10" fill="${C.orangePale}" stroke="${C.orange}" stroke-width="2"/>${text(307, 41, "JEV", "h3", `fill="${C.orange}" text-anchor="middle"`)}${text(307, 72, "结构化判断", "small", 'text-anchor="middle"')}
            <path d="M396 49h54" stroke="${C.ink}" stroke-width="3"/><path d="M436 38l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="464" width="150" height="98" rx="10" fill="${C.bluePale}" stroke="${C.blue}" stroke-width="2"/>${text(539, 41, "POLICY", "h3", `fill="${C.blue}" text-anchor="middle"`)}${text(539, 72, "阈值与权限", "small", 'text-anchor="middle"')}
            <path d="M628 49h54" stroke="${C.ink}" stroke-width="3"/><path d="M668 38l15 11-15 11" fill="none" stroke="${C.ink}" stroke-width="3"/>
            <rect x="696" width="184" height="98" rx="10" fill="${C.ink}"/>${text(788, 41, "ACTION", "h3", `fill="${C.white}" text-anchor="middle"`)}${text(788, 72, "执行 / 确认 / 转人", "small", `fill="#d1d5db" text-anchor="middle"`)}
            <path d="M788 112v70H75v-58" fill="none" stroke="${C.orange}" stroke-width="3" stroke-dasharray="9 8"/>
            ${text(430, 211, "真实结果回流：是否点开？判断是否正确？人工有没有改？", "small", `fill="${C.orange}" text-anchor="middle"`)}
          </g>
          ${rule(28, 366, 908, 366)}
          ${text(28, 406, "三段式安全门", "h3")}
          ${pill(28, 428, 245, "> 0.90  自动执行", C.blue)}
          ${pill(286, 428, 286, "0.50–0.90  请求确认", C.orange)}
          ${pill(585, 428, 323, "< 0.50  转人工/推理模型", C.ink)}
        </g>
        <g transform="translate(72 836)">
          ${text(0, 34, "为什么这比“调一个模型”难？", "h2")}
          <rect y="60" width="936" height="312" rx="14" fill="${C.white}" stroke="${C.rule}"/>
          ${text(26, 106, "01  问题定义", "h3", `fill="${C.blue}"`)}${text(218, 106, "选项边界、量表描述和反例写得不好，输出也会系统性偏移。", "body")}
          ${text(26, 169, "02  阈值校准", "h3", `fill="${C.orange}"`)}${text(218, 169, "别照抄 0.9；必须用自己的标注数据找误报/漏报平衡点。", "body")}
          ${text(26, 232, "03  权限控制", "h3")}${text(218, 232, "读信息、写草稿、公开发布，对置信度和人工确认要求不应相同。", "body")}
          ${text(26, 295, "04  结果回流", "h3")}${text(218, 295, "没有真实结果，就无法知道模型是否越来越适合你的工作流。", "body")}
          ${text(26, 348, "失败必须可诊断：保留输入、输出、阈值、操作人和最终结果。", "small")}
        </g>
        ${source("阈值区间为 TypeSafe 指南示例，不是所有业务通用标准；高风险动作应更保守。")}
      `,
    }),
  },
  {
    slug: "05-evidence",
    svg: frame({
      index: 5,
      section: "04 · EVIDENCE LADDER",
      headline: "194× 更快？先看数字是谁测的",
      deck: "科技新闻最容易把“官方基准”写成“已被证明”；正确读法是分层看证据",
      accent: C.orange,
      body: `
        <g transform="translate(72 286)">
          <rect width="936" height="274" rx="16" fill="${C.white}" stroke="${C.orange}" stroke-width="2" filter="url(#soft-shadow)"/>
          ${text(28, 46, "A · 厂商公开口径", "h2", `fill="${C.orange}"`)}
          ${text(28, 92, "~194×", "serif", `font-size="74" font-weight="900" fill="${C.orange}"`)}
          ${text(248, 88, "更快（workflow-style evals）", "h3")}
          ${text(28, 166, "~445×", "serif", `font-size="74" font-weight="900" fill="${C.orange}"`)}
          ${text(248, 162, "更便宜（同一官方评测框架）", "h3")}
          ${text(28, 226, "该类倍数强依赖基线模型、任务、网络与批量方式；不能外推到所有场景。", "small")}
        </g>
        <g transform="translate(72 590)">
          <rect width="936" height="330" rx="16" fill="${C.white}" stroke="${C.blue}" stroke-width="2" filter="url(#soft-shadow)"/>
          ${text(28, 46, "B · 单个第三方测试工具（2026-09-19）", "h2", `fill="${C.blue}"`)}
          ${text(28, 89, "17 cases / 23 checks", "small")}
          <g transform="translate(28 122)">
            ${text(0, 22, "MODEL", "small")}${text(310, 22, "ACCURACY", "small")}${text(502, 22, "MEDIAN", "small")}${text(680, 22, "COST / CALL", "small")}
            ${rule(0, 38, 880, 38, C.rule, 1)}
            ${text(0, 78, "Jev 1.13", "h3")}${text(310, 78, "23 / 23", "h3")}${text(502, 78, "452 ms", "h3")}${text(680, 78, "$0.000016", "h3")}
            ${text(0, 130, "GPT-5.6 Terra", "body")}${text(310, 130, "23 / 23", "body")}${text(502, 130, "1,505 ms", "body")}${text(680, 130, "$0.000571", "body")}
            ${text(0, 182, "Claude Opus 5", "body")}${text(310, 182, "23 / 23", "body")}${text(502, 182, "3,394 ms", "body")}${text(680, 182, "$0.003072", "body")}
          </g>
          ${text(28, 302, "仅代表该仓库、该时间、该网络和该小样本；准确率相同，不证明普遍更强。", "small")}
        </g>
        <g transform="translate(72 956)">
          ${text(0, 34, "C · 真正需要的生产证据", "h2")}
          ${pill(0, 56, 208, "你的标注数据", C.ink)}
          ${pill(220, 56, 188, "灰度流量", C.blue)}
          ${pill(420, 56, 188, "失败样本", C.orange)}
          ${pill(620, 56, 316, "按风险分层的阈值", C.ink)}
          ${text(0, 144, "结论：它值得测试，但“值得测试”与“已经验证”是两句话。", "h2")}
          ${note(0, 178, 936, "最可信的数字永远来自你的任务、你的用户和你的失败成本。")}
        </g>
        ${source("资料：[1] TypeSafe AI 官方 benchmark；[3] github.com/souvikr/jev-test（单次公开测试）。")}
      `,
    }),
  },
  {
    slug: "06-stack",
    svg: frame({
      index: 6,
      section: "05 · OPEN-SOURCE STACK",
      headline: "GitHub 上，大家怎么复现 JEV？",
      deck: "接入层、决策网关、开放复现和评测框架，要分清“官方模型”与“社区工程”",
      body: `
        <g transform="translate(72 286)">
          ${text(0, 30, "官方 · 先看真实接口", "h2", `fill="${C.blue}"`)}
          <rect y="54" width="936" height="214" rx="14" fill="${C.bluePale}" stroke="${C.blue}" filter="url(#soft-shadow)"/>
          ${text(24, 96, "TypeSafe OpenAPI", "h3")}
          ${text(24, 132, "api.typesafe.ai/docs", "mono", `font-size="18" fill="${C.blue}"`)}
          ${text(24, 164, "Choice / Score / Noul 的请求与返回结构", "small")}
          ${rule(24, 184, 912, 184, C.rule, 1)}
          ${text(24, 218, "Jev API 示例", "h3")}
          ${text(264, 218, "github.com/jev-ai/jev-api", "mono", `font-size="18" fill="${C.blue}"`)}
          ${text(264, 248, "公开示例仓库；底层模型产品仍以官方文档为准", "small")}

          ${text(0, 322, "社区 · 看怎么接、怎么测", "h2", `fill="${C.orange}"`)}
          <rect y="346" width="936" height="276" rx="14" fill="${C.orangePale}" stroke="${C.orange}" filter="url(#soft-shadow)"/>
          ${text(24, 390, "决策网关", "h3")}${text(194, 390, "github.com/kuldeepsinh19/jev-decision-gateway", "mono", `font-size="18" fill="${C.orange}"`)}
          ${text(194, 421, "Jev 做窄判断；代码负责阈值、fallback 和授权。", "small")}
          ${rule(24, 446, 912, 446, C.rule, 1)}
          ${text(24, 488, "统一接入层", "h3")}${text(194, 488, "github.com/lukeramsden/system-one", "mono", `font-size="18" fill="${C.orange}"`)}
          ${text(194, 519, "把 Jev、Cloudflare 与 Laya 暴露成同一套类型化接口。", "small")}
          ${rule(24, 544, 912, 544, C.rule, 1)}
          ${text(24, 586, "开放复现", "h3")}${text(194, 586, "github.com/mithalouni/system-one-open", "mono", `font-size="18" fill="${C.orange}"`)}
          ${text(194, 613, "基于 Gemma 的 Jev 风格复现；不是 TypeSafe 官方模型。", "small")}

          ${text(0, 680, "工作流底座 · 不是 Jev 项目", "h2")}
          <rect y="704" width="936" height="174" rx="14" fill="${C.white}" stroke="${C.ink}" filter="url(#soft-shadow)"/>
          ${text(24, 746, "LangGraph", "h3")}${text(194, 746, "github.com/langchain-ai/langgraph", "mono", `font-size="18" fill="${C.blue}"`)}
          ${text(194, 776, "用条件边和人工中断承接判断结果。", "small")}
          ${rule(24, 800, 912, 800, C.rule, 1)}
          ${text(24, 842, "LiteLLM", "h3")}${text(194, 842, "github.com/BerriAI/litellm", "mono", `font-size="18" fill="${C.blue}"`)}
          ${text(194, 870, "统一模型接入、重试、限流和可观测性。", "small")}
        </g>
        ${note(72, 1190, 936, "重要：开源接入层 ≠ 开源模型。调用真实 Jev 时，API Key 必须只放服务器端。")}
        ${source("链接按官方接口、社区工程、开放复现、工作流底座分类，避免把社区项目当官方。")}
      `,
    }),
  },
  {
    slug: "07-takeaway",
    svg: frame({
      index: 7,
      section: "CONCLUSION · 先验证，再自动化",
      headline: "下一代 AI，不一定是一个更大的模型",
      deck: "更可能是一支分工明确、彼此校验、随时能让人接管的模型团队",
      accent: C.orange,
      body: `
        <g transform="translate(72 286)">
          <rect width="936" height="164" rx="16" fill="${C.ink}"/>
          ${text(30, 50, "01", "serif", `font-size="44" font-weight="900" fill="${C.orange}"`)}
          ${text(112, 48, "大模型负责开放式理解与表达", "h2", `fill="${C.white}"`)}
          ${text(112, 92, "规划、写作、解释、处理未知问题", "body", `fill="#d1d5db"`)}
          ${text(112, 130, "它擅长“把问题想清楚”。", "small", `fill="#9ca3af"`)}
        </g>
        <g transform="translate(72 474)">
          <rect width="936" height="164" rx="16" fill="${C.orangePale}" stroke="${C.orange}" stroke-width="2"/>
          ${text(30, 50, "02", "serif", `font-size="44" font-weight="900" fill="${C.orange}"`)}
          ${text(112, 48, "决策模型负责高频、窄范围判断", "h2", `fill="${C.orange}"`)}
          ${text(112, 92, "路由、打分、门控、是否升级", "body")}
          ${text(112, 130, "它擅长“把下一步选出来”。", "small")}
        </g>
        <g transform="translate(72 662)">
          <rect width="936" height="164" rx="16" fill="${C.bluePale}" stroke="${C.blue}" stroke-width="2"/>
          ${text(30, 50, "03", "serif", `font-size="44" font-weight="900" fill="${C.blue}"`)}
          ${text(112, 48, "工作流与人类负责权限和后果", "h2", `fill="${C.blue}"`)}
          ${text(112, 92, "阈值、确认、回滚、复盘、责任边界", "body")}
          ${text(112, 130, "它们决定“这一步到底能不能做”。", "small")}
        </g>
        <g transform="translate(72 874)">
          ${text(0, 34, "真正值得追踪的三个问题", "h2")}
          ${text(0, 82, "□  是否出现跨任务、可复现的独立评测？", "body")}
          ${text(0, 126, "□  在你的数据上，哪类决定稳定，哪类必须转人工？", "body")}
          ${text(0, 170, "□  它节省的成本，能否覆盖误判和工程复杂度？", "body")}
          ${note(0, 214, 936, "别问“Jev 会不会取代 OpenAI”；问“哪一步不必再动用最贵的大模型”。", C.orangePale, C.orange)}
        </g>
        ${text(72, 1185, "你会先把哪一种“小决定”交给专门模型？", "h2")}
        ${text(72, 1225, "评论区留下场景：路由 / 风控 / 质量评分 / 人工升级", "small")}
        ${source("本文为公开资料解读，不构成性能承诺；所有自动化决策都应按风险设计人工兜底。")}
      `,
    }),
  },
];

await mkdir(OUT, { recursive: true });
const outputs = [];
for (const card of cards) {
  const svgPath = resolve(OUT, `${card.slug}.svg`);
  const pngPath = resolve(OUT, `${card.slug}.png`);
  await writeFile(svgPath, card.svg, "utf8");
  await sharp(Buffer.from(card.svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  outputs.push({ svgPath, pngPath });
}

const thumbWidth = 360;
const thumbHeight = 480;
const gap = 22;
const contactWidth = thumbWidth * 4 + gap * 5;
const contactHeight = thumbHeight * 2 + gap * 3;
const composites = await Promise.all(outputs.map(async ({ pngPath }, index) => ({
  input: await sharp(pngPath).resize(thumbWidth, thumbHeight).png().toBuffer(),
  left: gap + (index % 4) * (thumbWidth + gap),
  top: gap + Math.floor(index / 4) * (thumbHeight + gap),
})));
const contactSheetPath = resolve(OUT, "contact-sheet.png");
await sharp({
  create: {
    width: contactWidth,
    height: contactHeight,
    channels: 4,
    background: "#dfe2e5",
  },
}).composite(composites).png({ compressionLevel: 9 }).toFile(contactSheetPath);

console.log(JSON.stringify({
  status: "jev_carousel_v3_ready",
  outputDirectory: OUT,
  cards: outputs.length,
  width: WIDTH,
  height: HEIGHT,
  contactSheetPath,
  uploaded: false,
  savedToDraft: false,
  published: false,
}, null, 2));
