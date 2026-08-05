import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ideas, jobs } from "../../../db/schema";

export async function GET() {
  return Response.json({ jobs: await getDb().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(30) });
}

export async function POST(request: Request) {
  const payload = await request.json() as { ideaIds?: string[]; platforms?: string[] };
  if (!payload.ideaIds?.length) return Response.json({ error: "Select at least one idea" }, { status: 400 });
  const platforms = payload.platforms?.length ? payload.platforms : ["douyin", "tiktok", "xiaohongshu"];
  const now = new Date().toISOString();
  const rows = payload.ideaIds.map((ideaId) => ({ id: crypto.randomUUID(), ideaId, platforms: platforms.join(","), createdAt: now }));
  await getDb().insert(jobs).values(rows);
  for (const ideaId of payload.ideaIds) await getDb().update(ideas).set({ status: "generating" }).where(eq(ideas.id, ideaId));
  return Response.json({ jobs: rows }, { status: 201 });
}
