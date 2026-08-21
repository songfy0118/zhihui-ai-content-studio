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
] as const;

async function seedIfNeeded() {
  const db = getDb();
  const existing = await db.select({ id: ideas.id }).from(ideas).limit(1);
  if (existing.length) return;
  const now = new Date().toISOString();
  await db.insert(ideas).values(seed.map(([id, title, angle, category, douyinScore, tiktokScore, xhsScore]) => ({ id, title, angle, category, douyinScore, tiktokScore, xhsScore, createdAt: now })));
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
