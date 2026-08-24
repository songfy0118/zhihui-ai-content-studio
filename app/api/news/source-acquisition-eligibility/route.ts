import { buildNewsSourceAcquisitionEligibility } from "../../../../bridge/news-source-acquisition-eligibility.mjs";

export async function GET() {
  const audit = buildNewsSourceAcquisitionEligibility();
  const ready = audit.status === "source_acquisition_eligibility_ready";

  return Response.json(audit, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
