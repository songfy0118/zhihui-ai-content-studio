import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ideas } from "../../../db/schema";

const seed = [
  ["ai-layoffs", "大厂继续裁员：程序员会成为下一个土木行业吗？", "从公开裁员数据、岗位结构与AI投入拆开讨论", "AI职场", 94, 88, 96],
  ["ai-agent-work", "AI Agent 正在接管哪些白领流程？", "区分演示、试点与已经产生业务结果的部署", "AI", 92, 91, 95],
  ["chip-war", "英伟达之后，AI 芯片的下一场战争在哪里？", "比较训练、推理、存储和能耗瓶颈", "科技金融", 89, 93, 91],
  ["rate-cut-tech", "利率变化为什么先影响科技公司？", "解释宏观变化如何传导到普通从业者", "金融", 86, 90, 94],
  ["open-source-ai", "开源模型正在让闭源 AI 失去护城河吗？", "按能力、成本、部署和生态四个维度核对", "AI", 88, 94, 92],
  ["coding-career", "AI 会写代码之后，计算机专业还值得读吗？", "把岗位变化拆成四类能力", "AI职场", 96, 89, 97],
  ["robotics-factory", "人形机器人离真正进厂还有多远？", "标注样机、试产和规模部署的差别", "机器人", 91, 92, 90],
  ["us-tech-policy", "美国新的科技政策，真正影响了谁？", "从政策原文解释公司、投资者和技术从业者的影响", "美国科技", 87, 95, 89],
  ["ai-bubble", "AI 是泡沫，还是新一轮基础设施周期？", "对照资本开支、收入、利润和生产率证据", "科技金融", 93, 90, 95],
  ["private-ai", "你的公司为什么开始要求 AI 本地部署？", "解释数据合规、成本、延迟与效果的取舍", "企业AI", 85, 87, 93],
  ["ai-search", "AI 搜索会取代传统搜索引擎吗？", "比较答案质量、广告模式、来源透明度与用户习惯", "AI", 91, 94, 93],
  ["stablecoin-payments", "稳定币正在成为跨境支付的新基础设施吗？", "从结算速度、监管、成本和真实机构采用情况拆解", "金融科技", 88, 92, 90],
  ["ai-datacenter-power", "AI 数据中心为什么开始争夺电力？", "追踪资本开支、电网容量与能耗披露", "科技金融", 93, 91, 92],
  ["small-models", "小模型会成为企业 AI 的真正主力吗？", "比较部署成本、隐私、延迟和任务准确率", "企业AI", 90, 92, 94],
  ["robotaxi-scale", "Robotaxi 从试运营到规模化还差什么？", "核对运营区域、安全员要求、车队规模和监管条件", "机器人", 89, 95, 91],
  ["ai-copyright", "生成式 AI 的版权规则正在变清楚吗？", "从法院文件、授权协议和平台政策分别梳理", "AI政策", 87, 93, 95],
  ["quantum-commercial", "量子计算离商业回报还有多远？", "区分科研里程碑、硬件路线和企业合同", "前沿科技", 86, 92, 90],
  ["ipo-window", "美国科技公司 IPO 窗口重新打开了吗？", "结合正式招股文件、利率环境和上市后表现判断", "金融", 90, 94, 92],
  ["ai-security-agent", "企业为什么开始部署 AI 安全代理？", "从权限、审计、误报和数据泄露风险解释采用门槛", "企业AI", 92, 90, 95],
  ["chip-supply-chain", "AI 芯片供应链的下一处瓶颈是什么？", "比较先进封装、HBM、设备和电力约束", "科技金融", 94, 93, 91],
] as const;

async function seedIfNeeded() {
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(ideas).values(seed.map(([id, title, angle, category, douyinScore, tiktokScore, xhsScore]) => ({ id, title, angle, category, douyinScore, tiktokScore, xhsScore, createdAt: now }))).onConflictDoNothing({ target: ideas.id });
}

export async function GET() {
  await seedIfNeeded();
  return Response.json({ ideas: await getDb().select().from(ideas).orderBy(asc(ideas.createdAt)) });
}

export async function PATCH(request: Request) {
  const payload = await request.json() as { id?: string; selected?: boolean };
  if (!payload.id || typeof payload.selected !== "boolean") return Response.json({ error: "id and selected are required" }, { status: 400 });
  const [idea] = await getDb().update(ideas).set({ selected: payload.selected, status: payload.selected ? "selected" : "candidate" }).where(eq(ideas.id, payload.id)).returning();
  return Response.json({ idea });
}
