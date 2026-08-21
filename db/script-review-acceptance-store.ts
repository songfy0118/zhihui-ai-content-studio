import { and, desc, eq } from "drizzle-orm";

import { getDb } from ".";
import { scriptReviewAcceptances } from "./schema";

export async function findAcceptedScriptReview(outputFingerprint: string, sourceLockFingerprint: string) {
  const [row] = await getDb()
    .select()
    .from(scriptReviewAcceptances)
    .where(and(
      eq(scriptReviewAcceptances.outputFingerprint, outputFingerprint),
      eq(scriptReviewAcceptances.sourceLockFingerprint, sourceLockFingerprint),
      eq(scriptReviewAcceptances.status, "accepted"),
    ))
    .orderBy(desc(scriptReviewAcceptances.reviewedAt))
    .limit(1);
  if (!row) return null;
  let checks: Record<string, boolean> = {};
  try {
    checks = JSON.parse(row.checklist) as Record<string, boolean>;
  } catch {
    return null;
  }
  return { ...row, checks, persisted: true };
}

export async function persistScriptReviewAcceptance(record: typeof scriptReviewAcceptances.$inferInsert) {
  await getDb().insert(scriptReviewAcceptances).values(record).onConflictDoNothing();
  return findAcceptedScriptReview(record.outputFingerprint, record.sourceLockFingerprint);
}
