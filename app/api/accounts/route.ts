import { getDb } from "../../../db";
import { accounts } from "../../../db/schema";

const defaults = [
  { platform: "douyin", publishMode: "OAuth API · 审核后发布" },
  { platform: "tiktok", publishMode: "Content Posting API · 审核前仅自己可见" },
  { platform: "xiaohongshu", publishMode: "官方分享SDK · App内确认发布" },
];

export async function GET() {
  const db = getDb();
  const existing = await db.select().from(accounts);
  if (!existing.length) await db.insert(accounts).values(defaults.map((item) => ({ ...item, updatedAt: new Date().toISOString() })));
  return Response.json({ accounts: await db.select().from(accounts) });
}
