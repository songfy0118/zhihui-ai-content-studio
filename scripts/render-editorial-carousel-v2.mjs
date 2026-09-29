import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const W = 1080;
const H = 1440;
const ROOT = resolve(import.meta.dirname, "..", "public", "pilots");

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const textLines = (lines, x, y, cls, gap, extra = "") => lines
  .map((line, index) => `<text x="${x}" y="${y + gap * index}" class="${cls}" ${extra}>${esc(line)}</text>`)
  .join("");

const commonStyle = `
  .serif{font-family:"SimSun","Noto Serif SC",serif}
  .sans{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif}
  .label{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:19px;font-weight:800;letter-spacing:1.6px}
  .title{font-family:"SimSun","Noto Serif SC",serif;font-size:72px;font-weight:900;letter-spacing:-2px}
  .titleSm{font-family:"SimSun","Noto Serif SC",serif;font-size:58px;font-weight:900;letter-spacing:-1px}
  .deck{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:27px;font-weight:700}
  .body{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:25px;font-weight:500}
  .bodyStrong{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:29px;font-weight:850}
  .quote{font-family:"SimSun","Noto Serif SC",serif;font-size:48px;font-weight:900}
  .metric{font-family:Georgia,"Times New Roman",serif;font-size:92px;font-weight:900}
  .small{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:17px;font-weight:550}
  .tiny{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:13px;font-weight:550;letter-spacing:.3px}
`;

const paper = (color = "#f1ede4") => sharp({ create: { width: W, height: H, channels: 4, background: color } });

async function heroBase(heroPath, mode) {
  if (mode === "cover" || mode === "dark") {
    const image = sharp(heroPath).resize(W, H, { fit: "cover" });
    if (mode === "dark") image.modulate({ brightness: 0.42, saturation: 0.7 });
    return image.png().toBuffer();
  }

  const bg = paper();
  if (mode === "top") {
    const crop = await sharp(heroPath).resize(W, 620, { fit: "cover", position: "attention" }).png().toBuffer();
    return bg.composite([{ input: crop, left: 0, top: 0 }]).png().toBuffer();
  }
  if (mode === "left") {
    const crop = await sharp(heroPath).resize(520, H, { fit: "cover", position: "left" }).png().toBuffer();
    return bg.composite([{ input: crop, left: 0, top: 0 }]).png().toBuffer();
  }
  if (mode === "right") {
    const crop = await sharp(heroPath).resize(520, H, { fit: "cover", position: "right" }).png().toBuffer();
    return bg.composite([{ input: crop, left: 560, top: 0 }]).png().toBuffer();
  }
  const crop = await sharp(heroPath).resize(936, 520, { fit: "cover", position: "attention" }).png().toBuffer();
  return bg.composite([{ input: crop, left: 72, top: 820 }]).png().toBuffer();
}

function overlay(page, topic, index) {
  const dark = page.mode === "dark";
  const cover = page.mode === "cover";
  const ink = dark ? "#fffaf0" : "#111318";
  const muted = dark ? "#d8d1c5" : "#4f5963";
  const accent = topic.accent;
  let content = "";

  if (cover) {
    content = `
      <defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f0e8" stop-opacity=".98"/><stop offset=".62" stop-color="#f4f0e8" stop-opacity=".82"/><stop offset="1" stop-color="#f4f0e8" stop-opacity="0"/></linearGradient></defs>
      <rect width="1080" height="560" fill="url(#wash)"/>
      <rect x="72" y="78" width="112" height="9" fill="${accent}"/>
      ${textLines(page.title, 72, 165, "title", 82, `fill="${ink}"`)}
      ${textLines(page.deck, 76, 350, "deck", 42, `fill="${muted}"`)}
      <rect x="72" y="1280" width="936" height="92" rx="2" fill="#111318" fill-opacity=".91"/>
      ${textLines(page.bottom, 104, 1336, "bodyStrong", 36, 'fill="#fffaf0"')}
    `;
  } else if (page.mode === "top") {
    content = `
      <rect y="520" width="1080" height="920" fill="#f1ede4"/>
      <rect x="72" y="570" width="90" height="8" fill="${accent}"/>
      ${textLines(page.title, 72, 665, "titleSm", 68, `fill="${ink}"`)}
      ${textLines(page.body, 76, 870, "body", 43, `fill="${muted}"`)}
      ${page.quote ? `<rect x="72" y="1155" width="936" height="150" fill="#111318"/>${textLines(page.quote, 104, 1220, "quote", 58, 'fill="#fffaf0"')}` : ""}
    `;
  } else if (page.mode === "left") {
    content = `
      <rect x="520" width="560" height="1440" fill="#f1ede4"/>
      <rect x="590" y="116" width="82" height="8" fill="${accent}"/>
      ${textLines(page.title, 590, 210, "titleSm", 68, `fill="${ink}"`)}
      ${textLines(page.body, 594, 520, "body", 44, `fill="${muted}"`)}
      ${page.metrics ? page.metrics.map((metric, i) => `<text x="${594 + i * 230}" y="1125" class="metric" fill="${i === 0 ? accent : ink}">${esc(metric.value)}</text><text x="${594 + i * 230}" y="1170" class="small" fill="${muted}">${esc(metric.label)}</text>`).join("") : ""}
    `;
  } else if (page.mode === "right") {
    content = `
      <rect width="560" height="1440" fill="#f1ede4"/>
      <rect x="72" y="116" width="82" height="8" fill="${accent}"/>
      ${textLines(page.title, 72, 210, "titleSm", 68, `fill="${ink}"`)}
      ${textLines(page.body, 76, 520, "body", 44, `fill="${muted}"`)}
      ${page.quote ? textLines(page.quote, 76, 1110, "quote", 58, `fill="${accent}"`) : ""}
    `;
  } else if (page.mode === "dark") {
    content = `
      <rect width="1080" height="1440" fill="#0b0e13" fill-opacity=".54"/>
      <rect x="72" y="110" width="88" height="8" fill="${accent}"/>
      ${textLines(page.title, 72, 235, "title", 84, `fill="${ink}"`)}
      ${textLines(page.body, 76, 555, "body", 48, `fill="${muted}"`)}
      ${page.quote ? `<rect x="72" y="1055" width="936" height="210" fill="#f1ede4"/>${textLines(page.quote, 108, 1135, "quote", 60, 'fill="#111318"')}` : ""}
    `;
  } else {
    content = `
      <rect x="72" y="92" width="88" height="8" fill="${accent}"/>
      ${textLines(page.title, 72, 205, "titleSm", 68, `fill="${ink}"`)}
      ${textLines(page.body, 76, 475, "body", 44, `fill="${muted}"`)}
      ${page.quote ? textLines(page.quote, 76, 1160, "quote", 60, `fill="${accent}"`) : ""}
    `;
  }

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
      <style>${commonStyle}</style>
      ${content}
      <text x="72" y="1402" class="tiny" fill="${dark ? "#e7e0d5" : "#5d646b"}">${esc(page.source || topic.source)}</text>
      <text x="1008" y="1402" text-anchor="end" class="tiny" fill="${dark ? "#e7e0d5" : "#5d646b"}">${esc(topic.code)} · ${String(index + 1).padStart(2, "0")}/06</text>
    </svg>
  `);
}

async function renderTopic(topic) {
  const out = resolve(ROOT, topic.directory);
  const hero = resolve(out, "assets", "hero.png");
  await mkdir(out, { recursive: true });
  const rendered = [];

  for (let index = 0; index < topic.pages.length; index += 1) {
    const page = topic.pages[index];
    const base = await heroBase(hero, page.mode);
    const path = resolve(out, `${String(index + 1).padStart(2, "0")}-${page.slug}.png`);
    await sharp(base).composite([{ input: overlay(page, topic, index), left: 0, top: 0 }]).png().toFile(path);
    rendered.push(path);
  }

  const thumbs = await Promise.all(rendered.map((path) => sharp(path).resize(324, 432).png().toBuffer()));
  const sheet = sharp({ create: { width: 1020, height: 900, channels: 4, background: "#d9d6cf" } });
  await sheet.composite(thumbs.map((input, index) => ({ input, left: 12 + (index % 3) * 336, top: 12 + Math.floor(index / 3) * 444 }))).png().toFile(resolve(out, "contact-sheet.png"));
  return { topic: topic.code, out, pages: rendered.length };
}

const jev = {
  code: "JEV / SYSTEM ONE",
  directory: "jev-carousel-v4",
  accent: "#dc4a25",
  source: "资料：TypeSafe AI 官方发布与公开 API 文档；厂商基准不等于独立验证",
  pages: [
    { slug: "cover", mode: "cover", title: ["大模型负责思考，", "Jev 负责拍板"], deck: ["前 OpenAI 研究员另起炉灶", "AI 开始真正分工"], bottom: ["不生成长文，只返回选择、评分与概率"] },
    { slug: "question", mode: "top", title: ["模型越来越强，", "自动化为何没发生？"], body: ["Diogo Almeida 曾参与让大模型学会遵循指令。", "离开 OpenAI 后，他盯上了另一道问题：", "软件需要的不是更多漂亮回答，而是稳定判断。"], quote: ["聊天不是自动化", "决定下一步才是"] },
    { slug: "three-jobs", mode: "left", title: ["它只做三件事"], body: ["Choice：在多个选项中做选择", "Score：给风险、质量或价值打分", "Noul：返回一件事成立的概率", "", "输出直接交给代码，不再从长答案里猜。"], metrics: [{ value: "3", label: "种决策原语" }, { value: "0", label: "段长文生成" }] },
    { slug: "private-domain", mode: "right", title: ["私域最缺的", "不是回复，是判断"], body: ["这是咨询，还是投诉？", "应该跟进，还是先补资料？", "可以自动处理，还是必须转人工？", "", "Jev 只给信号。", "微信操作、付款和发布仍由系统与人控制。"], quote: ["判断交给模型", "权限留在代码"] },
    { slug: "evidence", mode: "paper", title: ["快 100 倍？", "先别急着封神"], body: ["TypeSafe 公布了速度、成本和准确率数据。", "但那首先是厂商测试，不是所有业务的结论。", "", "真正上线前仍要做三件事：", "用自己的数据校准；低信心转人工；记录错误。"], quote: ["类型正确", "不等于判断正确"] },
    { slug: "takeaway", mode: "dark", title: ["未来的 AI，", "不会只有一个大脑"], body: ["大模型负责理解、推理与创作。", "决策模型负责高频、快速、结构化判断。", "代码负责权限、阈值与回滚。", "人负责最终后果。"], quote: ["不是谁取代谁", "而是谁负责哪一步"] },
  ],
};

const muse = {
  code: "META MUSE / AGENT WAR",
  directory: "muse-carousel-v2",
  accent: "#d94f28",
  source: "资料：Meta Newsroom，2026-09-08；Axios，2026-09-21",
  pages: [
    { slug: "cover", mode: "cover", title: ["谁控制 AI 代理，", "谁控制下一代互联网入口"], deck: ["Meta 与 Amazon 的第一场", "Agent 入口战争"], bottom: ["AI 不再只回答，它开始替人办事"] },
    { slug: "action", mode: "top", title: ["AI 不再回答，", "它开始行动"], body: ["Muse 可以打开网站、填写表格、发送邮件，", "也能安排行程，把购物推进到确认之前。", "", "关键变化不是模型更会聊，", "而是它拥有一台持续工作的虚拟电脑。"], quote: ["从建议工具", "变成执行代理"] },
    { slug: "amazon", mode: "left", title: ["Amazon 关门，", "Agent 战争开始"], body: ["Muse 上线后不久，Amazon 阻止它浏览和代购。", "", "AI 足够聪明，仍然不够。", "它还必须获得每个平台的允许。", "", "入口争夺，第一次变成真实产品冲突。"] },
    { slug: "permission", mode: "right", title: ["真正的产品", "不是智能，是权限"], body: ["读邮件、改日程、发消息、付款、公开发布，", "不能共用同一把钥匙。", "", "过程必须看得见，动作能够暂停，", "权限可以撤销，结果必须有回执。"], quote: ["能做什么重要", "不能做什么更重要"] },
    { slug: "platform", mode: "paper", title: ["平台会变成入口，", "也会变成围墙"], body: ["谁决定代理能访问哪些网站？", "谁获得搜索、比较和购买意图？", "谁控制推荐、广告与最终转化？", "", "当用户先问代理，平台可能退到代理身后。"], quote: ["争的不是购物车", "争的是用户关系"] },
    { slug: "takeaway", mode: "dark", title: ["下一代互联网，", "人下命令，代理跑全网"], body: ["Meta 想拥有每个人的私人代理。", "Amazon 不愿变成被调用的履约管道。", "其他平台也会做出自己的选择。"], quote: ["谁控制 AI 代理", "谁控制互联网入口"] },
  ],
};

const results = [];
results.push(await renderTopic(jev));
results.push(await renderTopic(muse));
console.log(JSON.stringify({ status: "editorial_carousels_v2_ready", results }, null, 2));
