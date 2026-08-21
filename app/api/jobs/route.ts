import { desc, eq } from "drizzle-orm";
import { validateReviewApproval, validateReviewableStatus } from "../../../bridge/review-gate.mjs";
import { getDb } from "../../../db";
import { ideas, jobs, reviewAudits } from "../../../db/schema";

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

export async function PATCH(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const review = validateReviewApproval(payload as Record<string, unknown>);
  if (!review.ok) return Response.json(review, { status: 400 });

  const db = getDb();
  const [existing] = await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(eq(jobs.id, review.jobId)).limit(1);
  if (!existing) return Response.json({ error: "Job not found" }, { status: 404 });
  const reviewable = validateReviewableStatus(existing.status);
  if (!reviewable.ok) return Response.json(reviewable, { status: 409 });

  const reviewedAt = new Date().toISOString();
  const auditId = crypto.randomUUID();
  const [updatedJobs] = await db.batch([
    db.update(jobs)
      .set({ status: "approved_for_manual_publish", stage: "人工审核完成", progress: 95 })
      .where(eq(jobs.id, review.jobId))
      .returning(),
    db.insert(reviewAudits).values({
      id: auditId,
      jobId: review.jobId,
      action: "approve_for_manual_publish",
      checklist: JSON.stringify(review.checks),
      publishTriggered: false,
      createdAt: reviewedAt,
    }),
  ]);
  const job = updatedJobs[0];

  return Response.json({
    job,
    reviewedAt,
    reviewAudit: {
      id: auditId,
      jobId: review.jobId,
      action: "approve_for_manual_publish",
      checks: review.checks,
      publishTriggered: false,
      createdAt: reviewedAt,
    },
    publishTriggered: false,
    message: "Review recorded. Publishing remains disabled until an account owner authorizes a platform-specific action.",
  });
}
