import { buildPlatformInfographicStoryboard } from "../bridge/platform-infographic-storyboard.mjs";

const claims = [
  {
    id: "official-positioning",
    text: "Jev is presented by TypeSafe AI as a model for typed, probabilistic decisions rather than long-form text generation.",
    sourceUrl: "https://www.typesafe.ai/blog/introducing-system-one-models-and-jev",
    sourceLocked: true,
  },
  {
    id: "official-primitives",
    text: "The official introduction describes Choice, Score and Noul as decision primitives.",
    sourceUrl: "https://www.typesafe.ai/blog/introducing-system-one-models-and-jev",
    sourceLocked: true,
  },
  {
    id: "workflow-interpretation",
    text: "A practical use is to return structured judgments that application code can use for routing, escalation or tool selection.",
    sourceUrl: "https://www.typesafe.ai/blog/introducing-system-one-models-and-jev",
    sourceLocked: true,
  },
  {
    id: "verification-boundary",
    text: "Official product claims are not independent reproduction; production use still requires local evaluation and human-controlled thresholds.",
    sourceUrl: "https://www.typesafe.ai/blog/introducing-system-one-models-and-jev",
    sourceLocked: true,
  },
];

const sections = [
  {
    type: "hook",
    headline: "AI 真正的瓶颈，可能不是推理",
    purpose: "先制造认知反差，再说明 Jev 解决的是高频决策。",
    renderMode: "hybrid_svg_illustration",
    evidenceClaimIds: ["official-positioning"],
    exactLabels: ["AI 真正的瓶颈", "可能不是推理", "而是每一步怎么选"],
    drawInstructions: [
      "中央画一条工作流管线，左侧是大模型对话气泡，右侧分叉为工具 A、工具 B 和人工复核。",
      "用橙色圈出分叉点，把它表现成真正的瓶颈；标题占上方约三分之一。",
    ],
  },
  {
    type: "comparison",
    headline: "它不是另一个聊天机器人",
    purpose: "把长文本生成与结构化决策并排对比。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["official-positioning", "workflow-interpretation"],
    exactLabels: ["传统大模型", "Jev", "生成一段答案", "返回可执行判断", "代码决定下一步"],
    drawInstructions: [
      "左右双栏：左栏是长对话气泡进入文档，右栏是输入进入三个小型结构化输出框。",
      "底部用箭头把 Jev 输出连接到路由、升级人工和工具选择三个动作。",
    ],
  },
  {
    type: "three_panel_schema",
    headline: "三个决策原语",
    purpose: "用代码结构和图形解释 Choice、Score、Noul。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["official-primitives"],
    exactLabels: ["Choice｜选项", "Score｜评分", "Noul｜布尔", "概率分布", "评分范围", "为真概率"],
    drawInstructions: [
      "三栏卡片等宽排列，每栏上部是极短的 JSON 结构示意，下部是对应图形。",
      "Choice 下画三条横向概率条；Score 下画刻度轴和一个圆形指示点；Noul 下画半圆仪表盘。",
      "图中只示意字段类型，不填未经来源锁定的性能百分比或预测数据。",
    ],
  },
  {
    type: "process",
    headline: "把模糊判断编译成智能 if",
    purpose: "说明结构化判断如何进入软件流程。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["workflow-interpretation"],
    exactLabels: ["输入", "结构化判断", "阈值", "自动执行", "转人工"],
    drawInstructions: [
      "从左到右画五节点流程图，阈值节点为菱形，分出自动执行和转人工两条路径。",
      "在每条箭头旁写清动作，不使用装饰性无意义连线。",
    ],
  },
  {
    type: "scenario",
    headline: "一个客服投诉，可以同时做四个判断",
    purpose: "把抽象能力落到可理解的业务场景。",
    renderMode: "hybrid_svg_illustration",
    evidenceClaimIds: ["workflow-interpretation"],
    exactLabels: ["是不是退款问题？", "紧急程度？", "要不要转人工？", "分给哪个团队？"],
    drawInstructions: [
      "左侧画一张匿名客服消息卡，右侧画四张并行判断卡，最后汇合到工单路由。",
      "人物只作辅助插图；四个问题和全部箭头用 SVG 确定性排版。",
    ],
  },
  {
    type: "caveat",
    headline: "类型正确，不等于判断正确",
    purpose: "明确官方声明与独立验证之间的边界。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["verification-boundary"],
    exactLabels: ["官方结果", "独立复现", "自己的数据", "人工阈值", "停止条件"],
    drawInstructions: [
      "画一座三层证据阶梯：官方结果、独立复现、自己的数据；当前指针停在第一层。",
      "右侧用检查清单列出人工阈值和停止条件，避免把产品宣传画成已证实结论。",
    ],
  },
  {
    type: "outlook",
    headline: "下一步真正值得看什么？",
    purpose: "用三个可验证问题收尾并引导讨论。",
    renderMode: "deterministic_svg",
    evidenceClaimIds: ["verification-boundary"],
    exactLabels: ["第三方能否复现？", "真实成本是否更低？", "出错时能否及时停手？"],
    drawInstructions: [
      "纵向排列三个大问题，每个问题配放大镜、成本秤和急停按钮的线性图标。",
      "底部保留讨论问题：你更看好会说话的 AI，还是会做决定的 AI？",
    ],
  },
];

const storyboard = buildPlatformInfographicStoryboard({
  platform: "douyin",
  topic: "Jev 与结构化 AI 决策",
  claims,
  sections,
});

if (storyboard.status !== "platform_infographic_storyboard_ready") {
  throw new Error(`storyboard blocked: ${storyboard.blockers.join(", ")}`);
}

console.log(JSON.stringify(storyboard, null, 2));
