import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { reviewAudits } from "../../../db/schema";

function parseChecklist(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, boolean> : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) return Response.json({ error: "jobId is required" }, { status: 400 });

  try {
    const rows = await getDb()
      .select()
      .from(reviewAudits)
      .where(eq(reviewAudits.jobId, jobId))
      .orderBy(desc(reviewAudits.createdAt))
      .limit(20);
    return Response.json({
      audits: rows.map(({ checklist, ...audit }) => {
        const checks = parseChecklist(checklist);
        return { ...audit, checks, malformed: checks === null };
      }),
    });
  } catch {
    return Response.json(
      { error: "Review audit storage is not initialized. Apply the checked-in D1 migration before reading history." },
      { status: 503 },
    );
  }
}
