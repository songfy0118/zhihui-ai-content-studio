import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const WIDTH = 1080;
const HEIGHT = 1440;
const outputDirectory = resolve(import.meta.dirname, "..", "public", "pilots", "jev-carousel-v2");

const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const lines = (items, x, y, className, gap = 52, anchor = "start") => items
  .map((item, index) => `<text x="${x}" y="${y + index * gap}" class="${className}" text-anchor="${anchor}">${xml(item)}</text>`)
  .join("");

const base = ({ index, kicker, title, subtitle = "", body, accent = "#bb5e3f" }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>${xml(title)}</title>
  <defs>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#2c3935" stroke-opacity=".045"/>
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2b302d" flood-opacity=".10"/>
    </filter>
    <style>
      .cn{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;fill:#24322e}
      .serif{font-family:"SimSun","Noto Serif SC",serif;fill:#24322e}
      .mono{font-family:Consolas,"SFMono-Regular",monospace;fill:#28423b}
      .kicker{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:25px;font-weight:800;letter-spacing:2px;fill:${accent}}
      .title{font-family:"SimSun","Noto Serif SC",serif;font-size:68px;font-weight:900;fill:#24322e}
      .subtitle{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:30px;font-weight:600;fill:#53645e}
      .h2{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:34px;font-weight:800;fill:#24322e}
      .body{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:27px;fill:#43534e}
      .small{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:21px;fill:#66736e}
      .tiny{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;font-size:17px;fill:#74807b}
    </style>
  </defs>
  <rect width="1080" height="1440" fill="#f4efe3"/>
  <rect width="1080" height="1440" fill="url(#grid)"/>
  <circle cx="984" cy="92" r="66" fill="${accent}" opacity=".12"/>
  <circle cx="972" cy="104" r="14" fill="${accent}"/>
  <text x="80" y="82" class="kicker">${xml(kicker)}</text>
  <text x="1000" y="1365" class="small" text-anchor="end">${String(index).padStart(2, "0")} / 07</text>
  <path d="M80 1320H1000" stroke="#263630" stroke-width="2" opacity=".25"/>
  ${body}
</svg>`;

const cards = [
  {
    slug: "01-cover",
    svg: base({
      index: 1,
      kicker: "美国 AI 要变天？",
      title: "美国 AI 大变局：OpenAI 不再包办？",
      accent: "#b95c3f",
      body: `
        <rect x="80" y="168" width="258" height="56" rx="28" fill="#b95c3f"/>
        <text x="209" y="205" class="cn" font-size="25" font-weight="900" fill="#fff" text-anchor="middle">只会选择的新模型</text>
        <text x="80" y="310" class="serif" font-size="70" font-weight="900">OpenAI 不再包办一切？</text>
        <text x="80" y="405" class="serif" font-size="70" font-weight="900" fill="#b95c3f">Jev 正在抢走“下一步”</text>
        <text x="82" y="470" class="subtitle">大模型负责回答，新模型只负责做决定</text>

        <g transform="translate(80 560)" filter="url(#shadow)">
          <rect width="920" height="500" rx="34" fill="#fbf8ef" stroke="#293a34" stroke-width="3"/>
          <text x="460" y="74" class="small" text-anchor="middle">美国 AI 的新分工：一个负责想，一个负责选</text>
          <g transform="translate(58 125)">
            <rect width="222" height="105" rx="24" fill="#d9e2dc" stroke="#5f7f74" stroke-width="3"/>
            <path d="M45 44h132M45 70h92" stroke="#5f7f74" stroke-width="9" stroke-linecap="round" opacity=".7"/>
            <path d="M248 53h84" stroke="#b95c3f" stroke-width="7"/><path d="M314 35l22 18-22 18" fill="none" stroke="#b95c3f" stroke-width="7"/>
            <circle cx="420" cy="53" r="62" fill="#b95c3f"/><text x="420" y="66" class="cn" font-size="36" font-weight="900" fill="#fff" text-anchor="middle">JEV</text>
            <path d="M486 53h82" stroke="#b95c3f" stroke-width="7"/><path d="M550 35l22 18-22 18" fill="none" stroke="#b95c3f" stroke-width="7"/>
            <g transform="translate(598 0)">
              <rect width="206" height="32" rx="10" fill="#315e5e"/><text x="103" y="23" class="cn" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">选哪个</text>
              <rect y="38" width="206" height="32" rx="10" fill="#73978e"/><text x="103" y="61" class="cn" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">打几分</text>
              <rect y="76" width="206" height="32" rx="10" fill="#d18a61"/><text x="103" y="99" class="cn" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">要不要执行</text>
            </g>
          </g>
          <text x="460" y="314" class="serif" font-size="43" font-weight="800" text-anchor="middle">它不写答案，也不陪你聊天</text>
          <text x="460" y="372" class="serif" font-size="43" font-weight="800" text-anchor="middle">只想控制 Agent 的下一步</text>
          <rect x="84" y="410" width="752" height="58" rx="29" fill="#efe3d7"/>
          <text x="460" y="449" class="cn" font-size="22" font-weight="700" text-anchor="middle">Jev ≠ OpenAI 产品，也未被证实能替代大模型</text>
        </g>
        <text x="80" y="1142" class="h2">只会“选、评、判”，它凭什么在硅谷出圈？</text>
        <text x="80" y="1195" class="body">后面 6 张：原理 / 代码 / GitHub 接法 / 最大风险</text>
      `,
    }),
  },
  {
    slug: "02-why-now",
    svg: base({
      index: 2,
      kicker: "01｜AI Agent 最烧钱的，可能不是写答案",
      title: "每做一个小决定，都要重新问一次大模型",
      accent: "#315e5e",
      body: `
        <text x="80" y="220" class="serif" font-size="62" font-weight="900">AI Agent 最浪费的一步</text>
        <text x="80" y="302" class="serif" font-size="62" font-weight="900">可能不是写答案</text>
        <text x="80" y="375" class="subtitle">而是每做一个小决定，都要重新问一次大模型</text>
        <g transform="translate(80 470)">
          <rect width="920" height="220" rx="26" fill="#fbf8ef" stroke="#2d4039" stroke-width="3" filter="url(#shadow)"/>
          <text x="42" y="62" class="h2">今天常见的 Agent 路线</text>
          <g transform="translate(42 102)">
            <rect width="166" height="70" rx="18" fill="#dbe4de"/><text x="83" y="45" class="cn" font-size="24" font-weight="700" text-anchor="middle">读上下文</text>
            <path d="M182 35h60" stroke="#65756f" stroke-width="5"/><path d="M227 22l16 13-16 13" fill="none" stroke="#65756f" stroke-width="5"/>
            <rect x="260" width="166" height="70" rx="18" fill="#ead5c7"/><text x="343" y="45" class="cn" font-size="24" font-weight="700" text-anchor="middle">调用大模型</text>
            <path d="M442 35h60" stroke="#65756f" stroke-width="5"/><path d="M487 22l16 13-16 13" fill="none" stroke="#65756f" stroke-width="5"/>
            <rect x="520" width="166" height="70" rx="18" fill="#dbe4de"/><text x="603" y="45" class="cn" font-size="24" font-weight="700" text-anchor="middle">解析文字</text>
            <path d="M702 35h60" stroke="#65756f" stroke-width="5"/><path d="M747 22l16 13-16 13" fill="none" stroke="#65756f" stroke-width="5"/>
            <rect x="780" width="98" height="70" rx="18" fill="#e5ddbf"/><text x="829" y="45" class="cn" font-size="24" font-weight="700" text-anchor="middle">执行</text>
          </g>
        </g>
        <g transform="translate(80 748)" filter="url(#shadow)">
          <rect width="920" height="366" rx="26" fill="#2d4e46"/>
          <text x="46" y="72" class="cn" font-size="34" font-weight="800" fill="#fff">Jev 要抢的，就是这些高频“小决定”</text>
          <g class="cn" font-size="28" fill="#edf3ef">
            <text x="64" y="148">01　下一步调用哪个工具？</text>
            <text x="64" y="210">02　这条结果相关度多高？</text>
            <text x="64" y="272">03　不确定时要不要转人工？</text>
          </g>
          <path d="M620 118C706 118 700 184 774 184s70 68 80 118" fill="none" stroke="#e7a77e" stroke-width="10" stroke-linecap="round"/>
          <circle cx="620" cy="118" r="14" fill="#e7a77e"/><circle cx="774" cy="184" r="14" fill="#e7a77e"/><circle cx="854" cy="302" r="14" fill="#e7a77e"/>
        </g>
        <text x="80" y="1195" class="body">注意：这是产品定位，不等于已被独立验证的性能结论。</text>
      `,
    }),
  },
  {
    slug: "03-primitives",
    svg: base({
      index: 3,
      kicker: "02｜不写一句话，却想控制整个 Agent",
      title: "Jev 的野心，只有三个按钮",
      accent: "#b95c3f",
      body: `
        <text x="80" y="225" class="serif" font-size="66" font-weight="900">它不生成一个字</text>
        <text x="80" y="300" class="subtitle">只回答三个问题：选哪个 / 打几分 / 要不要</text>
        <g transform="translate(80 398)">
          <g filter="url(#shadow)">
            <rect width="286" height="620" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <rect width="286" height="105" rx="24" fill="#cd815c"/><text x="143" y="66" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">Choice</text>
            <text x="143" y="156" class="h2" text-anchor="middle">选哪个？</text>
            <text x="34" y="225" class="body">• 工具路由</text><text x="34" y="277" class="body">• 意图分类</text><text x="34" y="329" class="body">• 队列分发</text>
            <rect x="34" y="395" width="218" height="34" rx="17" fill="#e5ded2"/><rect x="34" y="395" width="150" height="34" rx="17" fill="#cd815c"/>
            <rect x="34" y="451" width="218" height="34" rx="17" fill="#e5ded2"/><rect x="34" y="451" width="82" height="34" rx="17" fill="#7d9d93"/>
            <text x="143" y="555" class="small" text-anchor="middle">返回各选项概率</text>
          </g>
          <g transform="translate(317)" filter="url(#shadow)">
            <rect width="286" height="620" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <rect width="286" height="105" rx="24" fill="#73978e"/><text x="143" y="66" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">Score</text>
            <text x="143" y="156" class="h2" text-anchor="middle">打几分？</text>
            <text x="34" y="225" class="body">• 风险分级</text><text x="34" y="277" class="body">• 质量排序</text><text x="34" y="329" class="body">• 相关性判断</text>
            <path d="M42 444H244" stroke="#31423d" stroke-width="5"/><circle cx="174" cy="444" r="18" fill="#f4efe3" stroke="#b95c3f" stroke-width="6"/>
            <g class="small" text-anchor="middle"><text x="42" y="488">低</text><text x="143" y="488">中</text><text x="244" y="488">高</text></g>
            <text x="143" y="555" class="small" text-anchor="middle">返回量表位置</text>
          </g>
          <g transform="translate(634)" filter="url(#shadow)">
            <rect width="286" height="620" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <rect width="286" height="105" rx="24" fill="#b95c3f"/><text x="143" y="66" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">Noul</text>
            <text x="143" y="156" class="h2" text-anchor="middle">要不要？</text>
            <text x="34" y="225" class="body">• 是否升级</text><text x="34" y="277" class="body">• 是否拦截</text><text x="34" y="329" class="body">• 是否转人工</text>
            <path d="M50 470A93 93 0 01143 377 93 93 0 01236 470" fill="none" stroke="#d8d5c8" stroke-width="26" stroke-linecap="round"/>
            <path d="M143 470l62-62" stroke="#b95c3f" stroke-width="8" stroke-linecap="round"/><circle cx="143" cy="470" r="15" fill="#f4efe3" stroke="#b95c3f" stroke-width="6"/>
            <text x="143" y="555" class="small" text-anchor="middle">返回“是”的概率</text>
          </g>
        </g>
        <rect x="80" y="1090" width="920" height="150" rx="24" fill="#e8e3d5"/>
        <text x="540" y="1148" class="h2" text-anchor="middle">共同点：都不生成长文本</text>
        <text x="540" y="1196" class="body" text-anchor="middle">输出交给下一行代码继续执行</text>
      `,
    }),
  },
  {
    slug: "04-code",
    svg: base({
      index: 4,
      kicker: "03｜模型敢做决定，代码就必须敢拦",
      title: "真正值钱的不是 API，而是失败兜底",
      accent: "#315e5e",
      body: `
        <text x="80" y="220" class="serif" font-size="64" font-weight="900">模型敢做决定</text>
        <text x="80" y="294" class="subtitle">代码就必须知道：什么时候立刻交给人</text>
        <g transform="translate(80 386)" filter="url(#shadow)">
          <rect width="920" height="548" rx="28" fill="#20322d"/>
          <circle cx="42" cy="39" r="10" fill="#d97155"/><circle cx="72" cy="39" r="10" fill="#d6aa61"/><circle cx="102" cy="39" r="10" fill="#73a08d"/>
          <text x="870" y="46" class="mono" font-size="20" fill="#a8bbb4" text-anchor="end">concept.py</text>
          <g class="mono" font-size="28">
            <text x="48" y="116" fill="#d6e5de">decision = decide(</text>
            <text x="86" y="160" fill="#e7bc8e">"是否需要转人工？"</text>
            <text x="48" y="204" fill="#d6e5de">)</text>
            <text x="48" y="286" fill="#82bca5">if</text><text x="92" y="286" fill="#d6e5de"> decision.probability &gt; threshold:</text>
            <text x="86" y="338" fill="#e7bc8e">route_to_human()</text>
            <text x="48" y="410" fill="#82bca5">else:</text>
            <text x="86" y="462" fill="#e7bc8e">continue_agent()</text>
          </g>
        </g>
        <rect x="80" y="988" width="920" height="224" rx="24" fill="#fbf8ef" stroke="#2d4039" stroke-width="3"/>
        <text x="116" y="1052" class="h2">真正重要的不是 API 名字</text>
        <text x="116" y="1110" class="body">而是：阈值谁定？错判怎么办？何时必须人工复核？</text>
        <text x="116" y="1170" class="small">示意代码，不代表 Jev 官方 SDK；实际字段以官方文档为准。</text>
      `,
    }),
  },
  {
    slug: "05-open-source",
    svg: base({
      index: 5,
      kicker: "04｜它最聪明的一步：没有重造 Agent",
      title: "GitHub 上的路，早就有人铺好了",
      accent: "#b95c3f",
      body: `
        <text x="80" y="220" class="serif" font-size="60" font-weight="900">它不想重造 Agent</text>
        <text x="80" y="292" class="serif" font-size="60" font-weight="900">只想卡进“判断层”</text>
        <text x="80" y="350" class="subtitle">LangGraph 管流程，LiteLLM 管模型，Jev 想管决定</text>
        <g transform="translate(80 412)" filter="url(#shadow)">
          <rect width="920" height="330" rx="28" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
          <circle cx="86" cy="85" r="44" fill="#315e5e"/><path d="M63 85h46M86 62v46" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
          <text x="156" y="80" class="h2">LangGraph</text>
          <text x="156" y="124" class="small">github.com/langchain-ai/langgraph</text>
          <text x="56" y="196" class="body">Conditional Edges：路由函数决定下一节点</text>
          <rect x="56" y="235" width="808" height="58" rx="12" fill="#e6ece8"/>
          <text x="460" y="273" class="mono" font-size="22" text-anchor="middle">add_conditional_edges("node_a", routing_function)</text>
        </g>
        <g transform="translate(80 774)" filter="url(#shadow)">
          <rect width="920" height="330" rx="28" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
          <circle cx="86" cy="85" r="44" fill="#b95c3f"/><path d="M61 97l25-38 25 38M70 87h32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="156" y="80" class="h2">LiteLLM</text>
          <text x="156" y="124" class="small">github.com/BerriAI/litellm</text>
          <text x="56" y="196" class="body">统一调用多家模型，并提供负载均衡与路由能力</text>
          <g transform="translate(56 236)">
            <rect width="178" height="54" rx="12" fill="#ead5c7"/><text x="89" y="36" class="cn" font-size="22" font-weight="700" text-anchor="middle">请求</text>
            <path d="M194 27h80" stroke="#65756f" stroke-width="5"/><path d="M259 14l16 13-16 13" fill="none" stroke="#65756f" stroke-width="5"/>
            <rect x="292" width="220" height="54" rx="12" fill="#dbe4de"/><text x="402" y="36" class="cn" font-size="22" font-weight="700" text-anchor="middle">Router</text>
            <path d="M528 27h80" stroke="#65756f" stroke-width="5"/><path d="M593 14l16 13-16 13" fill="none" stroke="#65756f" stroke-width="5"/>
            <rect x="626" width="182" height="54" rx="12" fill="#e5ddbf"/><text x="717" y="36" class="cn" font-size="22" font-weight="700" text-anchor="middle">模型池</text>
          </g>
        </g>
        <text x="80" y="1185" class="body">推断：Jev 若有效，价值可能在“替路由函数做细判断”。</text>
        <text x="80" y="1230" class="small">这不是两项目对 Jev 的背书，只是工作流位置对照。</text>
      `,
    }),
  },
  {
    slug: "06-boundaries",
    svg: base({
      index: 6,
      kicker: "05｜最危险的不是不会，而是自信地判错",
      title: "结构化输出，不等于结构化正确",
      accent: "#315e5e",
      body: `
        <text x="80" y="220" class="serif" font-size="62" font-weight="900">它可能每次都给概率</text>
        <text x="80" y="302" class="serif" font-size="62" font-weight="900" fill="#b95c3f">也可能每次都判断错</text>
        <text x="80" y="375" class="subtitle">格式稳定，只能证明接口好接，不能证明结论正确</text>
        <g transform="translate(80 470)">
          <g filter="url(#shadow)">
            <rect width="920" height="164" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <circle cx="92" cy="82" r="42" fill="#b95c3f"/><text x="92" y="94" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">1</text>
            <text x="164" y="70" class="h2">官方演示</text><text x="164" y="116" class="body">只能证明“产品这样定义自己”</text>
          </g>
          <g transform="translate(0 202)" filter="url(#shadow)">
            <rect width="920" height="164" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <circle cx="92" cy="82" r="42" fill="#73978e"/><text x="92" y="94" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">2</text>
            <text x="164" y="70" class="h2">第三方复现</text><text x="164" y="116" class="body">才开始回答“别人能不能跑出来”</text>
          </g>
          <g transform="translate(0 404)" filter="url(#shadow)">
            <rect width="920" height="164" rx="24" fill="#fbf8ef" stroke="#2c3c37" stroke-width="3"/>
            <circle cx="92" cy="82" r="42" fill="#d09a62"/><text x="92" y="94" class="cn" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">3</text>
            <text x="164" y="70" class="h2">你的真实数据</text><text x="164" y="116" class="body">才能决定阈值、成本和失败兜底</text>
          </g>
        </g>
        <rect x="80" y="1100" width="920" height="138" rx="24" fill="#2d4e46"/>
        <text x="540" y="1157" class="cn" font-size="31" font-weight="800" fill="#fff" text-anchor="middle">上线前至少测：准确率 · 稳定性 · 成本 · 延迟</text>
        <text x="540" y="1204" class="cn" font-size="22" fill="#dbe8e3" text-anchor="middle">关键任务保留人工复核，不拿宣传数字当验证结果</text>
      `,
    }),
  },
  {
    slug: "07-takeaway",
    svg: base({
      index: 7,
      kicker: "结论｜美国 AI 正从“全能”走向“分工”",
      title: "OpenAI 不会消失，但不会再包办一切",
      accent: "#b95c3f",
      body: `
        <text x="80" y="218" class="serif" font-size="60" font-weight="900">OpenAI 不会消失</text>
        <text x="80" y="298" class="serif" font-size="60" font-weight="900">但可能不再包办一切</text>
        <g transform="translate(80 390)" filter="url(#shadow)">
          <rect width="920" height="348" rx="30" fill="#2d4e46"/>
          <g transform="translate(78 76)">
            <circle cx="112" cy="94" r="92" fill="#f4efe3"/><text x="112" y="84" class="cn" font-size="31" font-weight="900" text-anchor="middle">慢思考</text><text x="112" y="126" class="small" text-anchor="middle">写作 · 推理</text>
            <path d="M232 94H446" stroke="#e3a27a" stroke-width="8" stroke-dasharray="12 12"/>
            <circle cx="566" cy="94" r="92" fill="#f4efe3"/><text x="566" y="84" class="cn" font-size="31" font-weight="900" text-anchor="middle">快判断</text><text x="566" y="126" class="small" text-anchor="middle">选择 · 评分</text>
          </g>
          <text x="460" y="302" class="cn" font-size="25" fill="#e5eee9" text-anchor="middle">大模型负责表达，决策模型负责把工作流往前推</text>
        </g>
        <g transform="translate(80 790)">
          <text x="0" y="48" class="h2">接下来我只看三件事</text>
          <text x="18" y="116" class="body">① 有没有独立复现，而不只是官方 Demo</text>
          <text x="18" y="176" class="body">② 真实任务里，错判和成本怎么权衡</text>
          <text x="18" y="236" class="body">③ 它能否进入 LangGraph 这类现有工作流</text>
        </g>
        <rect x="80" y="1100" width="920" height="140" rx="70" fill="#e3c0a6"/>
        <text x="540" y="1160" class="cn" font-size="32" font-weight="900" text-anchor="middle">你会把“关键决定”交给专门的模型吗？</text>
        <text x="540" y="1205" class="small" text-anchor="middle">评论区聊聊：先用在哪一步，最不能用在哪一步？</text>
      `,
    }),
  },
];

await mkdir(outputDirectory, { recursive: true });

const outputs = [];
for (const card of cards) {
  const svgPath = resolve(outputDirectory, `${card.slug}.svg`);
  const pngPath = resolve(outputDirectory, `${card.slug}.png`);
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
const contactSheetPath = resolve(outputDirectory, "contact-sheet.png");
await sharp({
  create: {
    width: contactWidth,
    height: contactHeight,
    channels: 4,
    background: "#dad4c8",
  },
}).composite(composites).png({ compressionLevel: 9 }).toFile(contactSheetPath);

console.log(JSON.stringify({
  status: "jev_carousel_v2_ready",
  outputDirectory,
  cards: outputs.length,
  width: WIDTH,
  height: HEIGHT,
  contactSheetPath,
  uploaded: false,
  savedToDraft: false,
  published: false,
}, null, 2));
