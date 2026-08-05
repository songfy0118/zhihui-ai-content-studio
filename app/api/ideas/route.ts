import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ideas } from "../../../db/schema";

const seed = [
  ["octopus", "如果章鱼去面试，它能同时握几次手？", "三颗心脏、分布式神经系统，用办公室喜剧纠正“九个大脑”的误解", "动物", 94, 87, 92],
  ["immune", "你的免疫细胞，正在身体里拍警匪片", "把伤口后的免疫反应讲成一次紧急出警", "人体", 91, 84, 94],
  ["earth-candy", "把地球压成一颗糖，会发生什么？", "用极端尺度解释黑洞与史瓦西半径", "宇宙", 88, 91, 86],
  ["ai-cat", "AI认得猫，为什么不一定懂猫？", "用对抗样本解释识别与理解的区别", "科技", 85, 93, 89],
  ["crow", "乌鸦为什么会记仇？", "让阿墨误惹一只可以记住人脸的乌鸦", "动物", 92, 89, 95],
  ["sleep", "熬夜后，大脑真的会吃掉自己吗？", "从夸张标题切入，解释胶质细胞与睡眠", "人体", 90, 86, 96],
  ["moon", "月球正在偷偷离开地球", "把每年约3.8厘米的距离变化变成离家故事", "宇宙", 87, 94, 90],
  ["robot", "机器人为什么突然都学会走路了？", "从强化学习、仿真训练到现实迁移", "科技", 86, 95, 88],
  ["whale", "鲸鱼为什么不会被自己的体重压扁？", "海水浮力与搁浅风险的反差", "动物", 93, 90, 94],
  ["memory", "你的记忆每次回想都会被改写", "把记忆再巩固讲成一份反复修改的文档", "人体", 89, 88, 97],
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
