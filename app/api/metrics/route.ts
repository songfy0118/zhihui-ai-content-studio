import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { metrics } from "../../../db/schema";

export async function GET() {
  return Response.json({ metrics: await getDb().select().from(metrics).orderBy(desc(metrics.createdAt)).limit(200) });
}

export async function POST(request: Request) {
  const payload = await request.json() as Partial<typeof metrics.$inferInsert>;
  if (!payload.ideaId || !payload.platform) return Response.json({ error: "ideaId and platform are required" }, { status: 400 });
  const [metric] = await getDb().insert(metrics).values({
    id: crypto.randomUUID(), ideaId: payload.ideaId, platform: payload.platform,
    views: Number(payload.views ?? 0), likes: Number(payload.likes ?? 0), comments: Number(payload.comments ?? 0), shares: Number(payload.shares ?? 0),
    saves: Number(payload.saves ?? 0), followers: Number(payload.followers ?? 0), completionRate: Number(payload.completionRate ?? 0), createdAt: new Date().toISOString(),
  }).returning();
  return Response.json({ metric }, { status: 201 });
}
