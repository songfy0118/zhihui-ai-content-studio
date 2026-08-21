import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { metrics } from "../../../db/schema";
import { filterVerifiedMetrics } from "../../../bridge/metrics-provenance.mjs";

export async function GET() {
  try {
    const rows = await getDb().select().from(metrics).orderBy(desc(metrics.createdAt)).limit(200);
    return Response.json(filterVerifiedMetrics(rows));
  } catch {
    return Response.json({
      metrics: [], status: "storage_unavailable", realDataOnly: true, recordsExcluded: 0,
      acceptedSources: ["platform_api", "platform_export"], writePerformed: false, publishTriggered: false,
      error: "metrics_storage_unavailable",
    });
  }
}

export async function POST() {
  return Response.json({
    error: "verified_metrics_import_not_configured",
    requiredSources: ["platform_api", "platform_export"],
    writePerformed: false,
    publishTriggered: false,
  }, { status: 409 });
}
