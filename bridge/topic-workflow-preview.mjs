import { buildEvidenceGapQueue } from "./evidence-gap-queue.mjs";
import { rankTopicCandidates } from "./topic-ranking.mjs";

export function buildTopicWorkflowPreview(clustering, options = {}) {
  const ranking = rankTopicCandidates(clustering, options);
  if (ranking.status !== "no_eligible_candidates") {
    return { ...ranking, nextGate: "human_source_and_fact_review", evidenceGapFallback: null };
  }

  const evidenceGapFallback = buildEvidenceGapQueue(clustering, options);
  return {
    ...ranking,
    nextGate: evidenceGapFallback.leads.length ? "human_evidence_gap_shortlist" : "wait_for_more_sources",
    evidenceGapFallback,
  };
}
