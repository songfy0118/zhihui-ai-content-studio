import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const W = 1080;
const H = 1440;
const OUT = resolve(import.meta.dirname, "..", "public", "pilots", "muse-carousel-v1");
const C = {
  paper: "#f6f3eb",
  ink: "#111827",
  muted: "#56616c",
  blue: "#2254c7",
  cyan: "#0c8799",
  orange: "#d9582f",
  red: "#b83335",
  paleBlue: "#e8efff",
  paleCyan: "#e5f4f4",
  paleOrange: "#fae9df",
  paleRed: "#f9e7e7",
  line: "#b8bec5",
  white: "#ffffff",
};

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const t = (x, y, value, cls = "body", extra = "") => {
  const attrs = extra.replace(/fill="([^"]+)"/g, 'style="fill:$1"');
  return `<text x="${x}" y="${y}" class="${cls}" ${attrs}>${esc(value)}</text>`;
};

const line = (x1, y1, x2, y2, color = C.line, width = 2, dash = "") =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;

const pill = (x, y, width, label, fill = C.ink, color = C.white) => `
  <rect x="${x}" y="${y}" width="${width}" height="42" rx="21" fill="${fill}"/>
  ${t(x + width / 2, y + 28, label, "pill", `fill="${color}" text-anchor="middle"`)}
`;

const card = (x, y, width, height, fill = C.white, stroke = C.ink) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="15" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#shadow)"/>`;

const wrap = (x, y, lines, cls = "body", gap = 38, extra = "") =>
  lines.map((value, index) => t(x, y + index * gap, value, cls, extra)).join("");

const heading = (value) => {
  const lines = Array.isArray(value) ? value : [value];
  if (lines.length === 1) return t(72, 165, lines[0], "title");
  return lines.map((line, index) => t(72, 151 + index * 52, line, "titleSplit")).join("");
};

const frame = ({ index, section, title, deck, accent = C.blue, body, source }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#111827" stroke-opacity=".025"/>
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#111827" flood-opacity=".09"/>
    </filter>
    <style>
      .section{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:21px;font-weight:800;letter-spacing:1.1px;fill:${accent}}
      .title{font-family:"SimSun","Noto Serif SC",serif;font-size:57px;font-weight:900;fill:${C.ink}}
      .titleSplit{font-family:"SimSun","Noto Serif SC",serif;font-size:44px;font-weight:900;fill:${C.ink}}
      .deck{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:25px;font-weight:650;fill:${C.muted}}
      .h2{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:31px;font-weight:900;fill:${C.ink}}
      .h3{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:23px;font-weight:850;fill:${C.ink}}
      .body{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:22px;fill:${C.ink}}
      .small{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:18px;fill:${C.muted}}
      .tiny{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:14px;fill:${C.muted}}
      .mono{font-family:Consolas,"SFMono-Regular",monospace;font-size:17px;fill:${C.ink}}
      .pill{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:17px;font-weight:800}
      .metric{font-family:Georgia,"Times New Roman",serif;font-size:52px;font-weight:900;fill:${C.ink}}
    </style>
  </defs>
  <rect width="1080" height="1440" fill="${C.paper}"/>
  <rect width="1080" height="1440" fill="url(#grid)"/>
  <rect width="18" height="1440" fill="${accent}"/>
  ${t(72, 72, section, "section")}
  ${t(1008, 72, `MUSE BRIEF · ${String(index).padStart(2, "0")}/07`, "tiny", 'text-anchor="end"')}
  ${line(72, 96, 1008, 96, accent, 3)}
  ${heading(title)}
  ${t(72, Array.isArray(title) ? 248 : 217, deck, "deck")}
  ${line(72, 1278, 1008, 1278, C.line, 1)}
  ${t(72, 1325, source, "tiny")}
  ${t(1008, 1325, "META MUSE · PUBLIC SOURCE EXPLAINER", "tiny", 'text-anchor="end"')}
  ${body}
</svg>`;

const pages = [
  {
    slug: "01-cover",
    svg: frame({
      index: 1,
      section: "META MUSE · PERSONAL AGENT",
      title: ["Meta 的新 AI 不陪聊，", "它开始替你下单"],
      deck: "Muse 会浏览、填表、发邮件；Amazon 随即把它拦在门外",
      accent: C.orange,
      source: "来源：Meta Newsroom（2026-09-08）；Axios（2026-09-21）",
      body: `
        ${pill(72, 270, 178, "META MUSE", C.orange)}
        ${pill(264, 270, 220, "PERSONAL AGENT", C.ink)}
        ${pill(498, 270, 238, "SECURE VM", C.blue)}
        ${card(72, 342, 936, 272, C.white, C.ink)}
        ${t(108, 392, "这不是聊天机器人，是直接操作网站的执行代理", "h2")}
        ${t(108, 446, "发邮件、填表、订行程、购物：Muse 真的开始替人办事。", "body")}
        <g transform="translate(108 490)">
          <rect width="166" height="74" rx="12" fill="${C.paleBlue}" stroke="${C.blue}"/>
          ${t(83, 46, "你的目标", "h3", 'text-anchor="middle"')}
          <path d="M185 37H250" stroke="${C.ink}" stroke-width="4"/><path d="M237 24l16 13-16 13" fill="none" stroke="${C.ink}" stroke-width="4"/>
          <rect x="270" width="166" height="74" rx="12" fill="${C.paleOrange}" stroke="${C.orange}"/>
          ${t(353, 46, "Muse 执行", "h3", `fill="${C.orange}" text-anchor="middle"`)}
          <path d="M455 37H520" stroke="${C.ink}" stroke-width="4"/><path d="M507 24l16 13-16 13" fill="none" stroke="${C.ink}" stroke-width="4"/>
          <rect x="540" width="248" height="74" rx="12" fill="${C.ink}"/>
          ${t(664, 30, "结果 + 过程记录", "h3", `fill="${C.white}" text-anchor="middle"`)}
          ${t(664, 57, "敏感动作再找你确认", "small", `fill="#d5d9df" text-anchor="middle"`)}
        </g>
        ${t(72, 680, "它为什么不只是又一个 AI 助手？", "h2")}
        ${card(72, 718, 286, 290, C.paleBlue, C.blue)}
        ${t(104, 770, "01 · 从聊天到行动", "h3", `fill="${C.blue}"`)}
        ${wrap(104, 824, ["AI 不再只给建议，", "而是持续推进目标，", "遇到关键步骤才回来。"], "body", 42)}
        ${card(382, 718, 286, 290, C.paleOrange, C.orange)}
        ${t(414, 770, "02 · 权限变成产品", "h3", `fill="${C.orange}"`)}
        ${wrap(414, 824, ["邮件、日历、文件、", "账号与支付权限，", "都要重新定义边界。"], "body", 42)}
        ${card(692, 718, 316, 290, C.paleRed, C.red)}
        ${t(724, 770, "03 · 平台战争开始", "h3", `fill="${C.red}"`)}
        ${wrap(724, 824, ["Amazon 已阻止 Muse", "访问和代购：谁拥有", "用户关系，谁就有入口。"], "body", 42)}
        ${card(72, 1050, 936, 150, C.ink, C.ink)}
        ${t(108, 1100, "真正的争夺", "small", `fill="#cbd5e1"`)}
        ${t(108, 1152, "谁控制你的 AI 代理，谁就控制下一代互联网入口。", "h2", `fill="${C.white}"`)}
      `,
    }),
  },
  {
    slug: "02-what",
    svg: frame({
      index: 2,
      section: "01 · 30 秒看懂冲突",
      title: ["Meta 刚把 AI 放出来，", "Amazon 就把门关了"],
      deck: "争的不是一个购物功能，而是谁控制下一代互联网入口",
      source: "来源：Meta Newsroom；Axios（2026-09-21）",
      body: `
        ${card(72, 282, 454, 430, C.paleBlue, C.blue)}
        ${pill(104, 318, 166, "MUSE 能做", C.blue)}
        ${t(104, 402, "打开网站", "h2")}${t(104, 452, "自己浏览、搜索、比较信息", "body")}
        ${t(104, 526, "推进任务", "h2")}${t(104, 576, "填表、发邮件、订行程、购物", "body")}
        ${t(104, 650, "关键动作", "h2")}${t(104, 700, "发送或购买前再找你确认", "body")}
        ${card(554, 282, 454, 430, C.paleOrange, C.orange)}
        ${pill(586, 318, 206, "AMAZON 怕什么", C.orange)}
        ${t(586, 402, "入口旁落", "h2")}${t(586, 452, "用户不再先打开购物 App", "body")}
        ${t(586, 526, "数据旁落", "h2")}${t(586, 576, "搜索与购买意图被 Agent 拿走", "body")}
        ${t(586, 650, "商业旁落", "h2")}${t(586, 700, "推荐、广告、转化都可能失控", "body")}
        ${t(72, 786, "时间线", "h2")}
        ${card(72, 824, 936, 198, C.white, C.ink)}
        ${pill(108, 862, 156, "09 / 08", C.ink)}
        ${t(294, 890, "Meta 发布 Muse", "h3")}
        ${line(108, 934, 936, 934, C.line, 2)}
        ${pill(108, 956, 156, "09 / 21", C.red)}
        ${t(294, 984, "Amazon 阻止 Muse 浏览和代购", "h3", `fill="${C.red}"`)}
        ${card(72, 1064, 936, 126, C.ink, C.ink)}
        ${t(108, 1110, "一句话看懂", "small", `fill="#cbd5e1"`)}
        ${t(108, 1154, "AI 越会行动，平台越会争夺它能进入哪里。", "h2", `fill="${C.white}"`)}
      `,
    }),
  },
  {
    slug: "03-architecture",
    svg: frame({
      index: 3,
      section: "02 · ARCHITECTURE",
      title: ["敢让 AI 碰邮箱和支付，", "Meta 靠什么？"],
      deck: "独立虚拟电脑、隔离监督智能体，以及可撤销的最小权限",
      accent: C.cyan,
      source: "来源：Meta Newsroom；security.muse.ai（官方安全说明）",
      body: `
        ${card(72, 286, 936, 510, C.white, C.ink)}
        <g transform="translate(104 340)">
          <rect width="172" height="90" rx="12" fill="${C.paleBlue}" stroke="${C.blue}" stroke-width="2"/>
          ${t(86, 38, "你", "h2", `fill="${C.blue}" text-anchor="middle"`)}${t(86, 70, "目标 + 授权", "small", 'text-anchor="middle"')}
          <path d="M190 45H252" stroke="${C.ink}" stroke-width="4"/><path d="M239 32l16 13-16 13" fill="none" stroke="${C.ink}" stroke-width="4"/>
          <rect x="274" width="520" height="320" rx="18" fill="${C.paleCyan}" stroke="${C.cyan}" stroke-width="3"/>
          ${t(304, 44, "MUSE SECURE VM", "h3", `fill="${C.cyan}"`)}
          ${t(304, 82, "每个人一个隔离的云端虚拟电脑", "small")}
          <rect x="304" y="112" width="212" height="88" rx="10" fill="${C.white}" stroke="${C.ink}"/>
          ${t(410, 148, "Muse Agent", "h3", `text-anchor="middle"`)}${t(410, 178, "规划与执行", "small", 'text-anchor="middle"')}
          <rect x="548" y="112" width="216" height="88" rx="10" fill="${C.white}" stroke="${C.red}"/>
          ${t(656, 148, "Sentinel", "h3", `fill="${C.red}" text-anchor="middle"`)}${t(656, 178, "独立监督与放行", "small", 'text-anchor="middle"')}
          <rect x="304" y="224" width="212" height="68" rx="10" fill="${C.ink}"/>
          ${t(410, 266, "Browser", "h3", `fill="${C.white}" text-anchor="middle"`)}
          <rect x="548" y="224" width="216" height="68" rx="10" fill="${C.ink}"/>
          ${t(656, 266, "Credential Store", "h3", `fill="${C.white}" text-anchor="middle"`)}
          ${line(410, 200, 410, 224, C.ink, 3)}${line(656, 200, 656, 224, C.red, 3)}
          <path d="M792 205H822" stroke="${C.red}" stroke-width="4"/><path d="M809 192l16 13-16 13" fill="none" stroke="${C.red}" stroke-width="4"/>
          ${t(836, 192, "互联网", "h3", `fill="${C.red}" text-anchor="middle"`)}${t(836, 226, "监督层放行", "small", 'text-anchor="middle"')}${t(836, 254, "才允许访问", "small", 'text-anchor="middle"')}
        </g>
        ${t(72, 856, "官方承诺的四道边界", "h2")}
        ${card(72, 894, 454, 132, C.paleBlue, C.blue)}
        ${t(104, 938, "隔离", "h3", `fill="${C.blue}"`)}${t(200, 938, "不同用户的智能体不能互相访问", "body")}${t(104, 978, "数据与连接凭据留在专属 VM。", "small")}
        ${card(554, 894, 454, 132, C.paleRed, C.red)}
        ${t(586, 938, "审批", "h3", `fill="${C.red}"`)}${t(682, 938, "发送、购买等敏感动作要确认", "body")}${t(586, 978, "同时保留完整操作记录。", "small")}
        ${card(72, 1050, 454, 132, C.paleCyan, C.cyan)}
        ${t(104, 1094, "最小权限", "h3", `fill="${C.cyan}"`)}${t(228, 1094, "每个 App 可单独选择读或写", "body")}${t(104, 1134, "权限可随时撤回或断开。", "small")}
        ${card(554, 1050, 454, 132, C.paleOrange, C.orange)}
        ${t(586, 1094, "凭据不可见", "h3", `fill="${C.orange}"`)}${t(742, 1094, "密码与支付信息进入安全存储", "body")}${t(586, 1134, "智能体使用但不直接读取。", "small")}
      `,
    }),
  },
  {
    slug: "04-permissions",
    svg: frame({
      index: 4,
      section: "03 · PERMISSION LADDER",
      title: ["AI 犯错不可怕，", "可怕的是它替你点了确认"],
      deck: "一个错误判断，可能继续变成邮件、订单或账户操作",
      accent: C.red,
      source: "分析：基于 Meta 官方权限设计与第三方体验报道",
      body: `
        ${t(72, 286, "权限越高，自动化价值越大；同样，错误半径也越大。", "h2")}
        <g transform="translate(72 338)">
          <rect width="936" height="138" rx="15" fill="${C.paleBlue}" stroke="${C.blue}"/>
          ${t(34, 52, "LEVEL 1", "h3", `fill="${C.blue}"`)}${t(170, 52, "公开网页研究", "h2")}${t(170, 96, "读资料、比价格、整理计划；不登录、不提交。", "body")}${pill(744, 42, 156, "低风险", C.blue)}
          <rect y="158" width="936" height="138" rx="15" fill="${C.paleCyan}" stroke="${C.cyan}"/>
          ${t(34, 210, "LEVEL 2", "h3", `fill="${C.cyan}"`)}${t(170, 210, "读取个人信息", "h2")}${t(170, 254, "邮件、日历、文件、消息；开始涉及隐私与上下文。", "body")}${pill(744, 200, 156, "需限权", C.cyan)}
          <rect y="316" width="936" height="138" rx="15" fill="${C.paleOrange}" stroke="${C.orange}"/>
          ${t(34, 368, "LEVEL 3", "h3", `fill="${C.orange}"`)}${t(170, 368, "代表你写入和发送", "h2")}${t(170, 412, "填表、发邮件、改日程；必须预览、确认、可撤销。", "body")}${pill(744, 358, 156, "强审批", C.orange)}
          <rect y="474" width="936" height="138" rx="15" fill="${C.paleRed}" stroke="${C.red}"/>
          ${t(34, 526, "LEVEL 4", "h3", `fill="${C.red}"`)}${t(170, 526, "支付与不可逆操作", "h2")}${t(170, 570, "购买、退订、删除、公开发布；错误成本最高。", "body")}${pill(744, 516, 156, "人工接管", C.red)}
        </g>
        ${card(72, 1000, 936, 170, C.ink, C.ink)}
        ${t(108, 1050, "最安全的使用方式", "small", `fill="#cbd5e1"`)}
        ${t(108, 1100, "先让智能体“只读”，再逐项开放“可写”；", "h2", `fill="${C.white}"`)}
        ${t(108, 1142, "把付款、发送、删除和公开发布永远留在确认门后。", "body", `fill="#e5e7eb"`)}
      `,
    }),
  },
  {
    slug: "05-amazon",
    svg: frame({
      index: 5,
      section: "04 · PLATFORM WAR",
      title: ["Amazon 拦的不是 AI，", "是下一个购物入口"],
      deck: "如果用户先把需求交给 Agent，平台还剩下多少控制权？",
      accent: C.orange,
      source: "来源：Axios，2026-09-21（Amazon 拦截 Muse 访问与代购）",
      body: `
        ${card(72, 286, 936, 216, C.white, C.ink)}
        ${t(108, 336, "事件", "h3", `fill="${C.orange}"`)}
        ${t(108, 388, "Muse 上线不到两周，Amazon 阻止其浏览和购买商品。", "h2")}
        ${t(108, 440, "Amazon 的理由包括：未授权访问、数据抓取、账户与交易安全。", "body")}
        ${t(72, 568, "表面问题 vs 真正问题", "h2")}
        ${card(72, 606, 454, 340, C.paleBlue, C.blue)}
        ${t(108, 658, "表面：技术与安全", "h3", `fill="${C.blue}"`)}
        ${wrap(108, 708, ["第三方 Agent 如何声明身份？", "如何遵守网站规则与频率限制？", "出错时谁承担责任？", "用户授权能否代表平台同意？"], "body", 48)}
        ${card(554, 606, 454, 340, C.paleOrange, C.orange)}
        ${t(590, 658, "底层：入口与数据", "h3", `fill="${C.orange}"`)}
        ${wrap(590, 708, ["谁决定用户先看什么商品？", "谁获得搜索与购买意图数据？", "谁控制推荐、广告和转化？", "平台会不会沦为履约管道？"], "body", 48)}
        ${card(72, 1000, 936, 174, C.ink, C.ink)}
        ${t(108, 1050, "这场冲突告诉我们", "small", `fill="#cbd5e1"`)}
        ${t(108, 1100, "AI Agent 的上限，不只由模型决定；", "h2", `fill="${C.white}"`)}
        ${t(108, 1142, "还取决于它被哪些平台允许进入。", "h2", `fill="#fdba74"`)}
      `,
    }),
  },
  {
    slug: "06-who-wins",
    svg: frame({
      index: 6,
      section: "05 · COMPETITION",
      title: ["OpenAI、Google、Meta，", "开始抢同一把钥匙"],
      deck: "谁能成为你默认授权的个人 Agent，谁就握住下一代入口",
      source: "分析：结合 Meta 官方发布、Axios 与 TechCrunch 公开报道",
      body: `
        ${card(72, 286, 936, 650, C.white, C.ink)}
        <rect x="72" y="286" width="936" height="72" rx="15" fill="${C.ink}"/>
        ${t(108, 332, "竞争层", "h3", `fill="${C.white}"`)}${t(356, 332, "过去", "h3", `fill="${C.white}"`)}${t(656, 332, "现在", "h3", `fill="${C.white}"`)}
        ${[462,566,670,774,878].map((y)=>line(72,y,1008,y,C.line,1)).join("")}
        ${line(314,358,314,936,C.line,1)}${line(614,358,614,936,C.line,1)}
        ${t(108, 424, "模型", "h3")}${t(356, 424, "回答质量", "body")}${t(656, 424, "长任务执行与工具调用", "body")}
        ${t(108, 528, "界面", "h3")}${t(356, 528, "聊天框", "body")}${t(656, 528, "手机、电脑、消息与眼镜", "body")}
        ${t(108, 632, "记忆", "h3")}${t(356, 632, "单次对话", "body")}${t(656, 632, "长期目标与个人上下文", "body")}
        ${t(108, 736, "权限", "h3")}${t(356, 736, "几乎只读", "body")}${t(656, 736, "邮件、日历、文件、购买", "body")}
        ${t(108, 840, "护城河", "h3")}${t(356, 840, "模型领先", "body")}${t(656, 840, "分发 + 连接 + 信任", "body")}
        ${t(72, 1000, "Meta 的特殊筹码", "h2")}
        ${card(72, 1038, 286, 142, C.paleBlue, C.blue)}${t(104,1086,"分发", "h3", `fill="${C.blue}"`)}${t(104,1128,"WhatsApp 与社交关系", "body")}
        ${card(382, 1038, 286, 142, C.paleCyan, C.cyan)}${t(414,1086,"设备", "h3", `fill="${C.cyan}"`)}${t(414,1128,"手机、Mac、AI 眼镜", "body")}
        ${card(692, 1038, 316, 142, C.paleOrange, C.orange)}${t(724,1086,"上下文", "h3", `fill="${C.orange}"`)}${t(724,1128,"社交、兴趣与长期记忆", "body")}
      `,
    }),
  },
  {
    slug: "07-takeaway",
    svg: frame({
      index: 7,
      section: "06 · TAKEAWAY",
      title: ["以后选 AI，先问它", "能不能被你叫停"],
      deck: "会行动只是开始；权限、记录、撤销和人工接管才决定能不能用",
      accent: C.cyan,
      source: "结论：基于公开资料的趋势判断，不代表产品性能独立验证",
      body: `
        ${card(72, 286, 936, 720, C.white, C.ink)}
        ${[
          ["01", "能不能持续完成长任务？", "不是演示一次，而是遇到变化仍能推进。", C.blue],
          ["02", "权限是否最小化且可撤销？", "读和写分开；敏感动作必须有明确确认。", C.cyan],
          ["03", "有没有操作记录和责任链？", "你需要知道它做过什么、准备做什么。", C.orange],
          ["04", "平台是否允许它进入？", "模型会用浏览器，不代表网站愿意被操作。", C.red],
          ["05", "出错后能不能安全停下？", "好 Agent 不只会行动，还要知道何时交还人类。", C.ink],
        ].map(([n,h,d,color],i)=>{
          const y=326+i*132;
          return `${t(108,y+48,n,"metric",`fill="${color}"`)}${t(226,y+35,h,"h3")}${t(226,y+78,d,"body")}${i<4?line(108,y+108,972,y+108,C.line,1):""}`;
        }).join("")}
        ${card(72, 1034, 936, 156, C.ink, C.ink)}
        ${t(108, 1077, "我的判断", "small", `fill="#cbd5e1"`)}
        ${t(108, 1126, "真正的 AI 入口，不是最会说话的那个，", "h3", `fill="${C.white}"`)}
        ${t(108, 1166, "而是你最愿意授权、也最敢随时叫停的那个。", "h3", `fill="#67e8f9"`)}
        ${t(72, 1234, "你愿意让 AI 读邮件、改日程，甚至替你购物吗？", "h3", `fill="${C.cyan}"`)}
      `,
    }),
  },
];

await mkdir(OUT, { recursive: true });
for (const page of pages) {
  await sharp(Buffer.from(page.svg)).png().toFile(resolve(OUT, `${page.slug}.png`));
}

console.log(`Rendered ${pages.length} Muse cards to ${OUT}`);
