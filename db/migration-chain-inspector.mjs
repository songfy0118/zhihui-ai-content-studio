export const INSPECT_SCHEMA_OBJECTS_SQL = `SELECT name, type FROM sqlite_schema
WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'`;
export const INSPECT_METRICS_COLUMNS_SQL = "PRAGMA table_info(`metrics`)";

export const MIGRATION_CHAIN = [
  { tag: "0000_serious_tinkerer", artifacts: ["table:accounts", "table:ideas", "table:jobs", "table:metrics"] },
  { tag: "0001_modern_hydra", artifacts: ["index:idx_ideas_created_at", "index:idx_jobs_created_at", "index:idx_jobs_idea_id", "index:idx_metrics_platform_created_at", "index:idx_metrics_idea_id"] },
  { tag: "0002_shiny_spitfire", artifacts: ["table:review_audits", "index:idx_review_audits_job_created_at"] },
  { tag: "0003_faithful_harry_osborn", artifacts: ["table:pilot_authorization_receipts", "index:idx_pilot_receipts_execution_hash_issued_at", "index:idx_pilot_receipts_status_expires_at"] },
  { tag: "0004_strange_doorman", artifacts: ["column:source_kind", "column:external_post_id", "column:captured_at", "column:imported_at", "index:uq_metrics_platform_post_captured_at"] },
  { tag: "0005_jazzy_toad", artifacts: ["table:script_review_acceptances", "index:uq_script_review_acceptances_output_source_lock", "index:idx_script_review_acceptances_idea_reviewed_at"] },
  { tag: "0006_amused_vulture", artifacts: [
    "table:news_items",
    "table:news_sources",
    "table:topic_cluster_items",
    "table:topic_clusters",
    "index:uq_news_items_canonical_url",
    "index:idx_news_items_source_published_at",
    "index:idx_news_items_content_hash",
    "index:idx_news_sources_enabled_category",
    "index:idx_news_sources_type",
    "index:uq_topic_cluster_items_cluster_item",
    "index:idx_topic_cluster_items_item_id",
    "index:uq_topic_clusters_slug",
    "index:idx_topic_clusters_status_last_seen_at",
  ] },
  { tag: "0007_silly_turbo", artifacts: [
    "table:source_locks",
    "table:source_lock_evidence",
    "index:uq_source_locks_review_fingerprint",
    "index:uq_source_locks_save_plan_fingerprint",
    "index:idx_source_locks_lead_created_at",
    "index:uq_source_lock_evidence_lock_role",
    "index:idx_source_lock_evidence_canonical_url",
    "index:idx_source_lock_evidence_source_id",
  ] },
  { tag: "0008_overconfident_vance_astro", artifacts: [
    "table:human_claim_acceptance_receipts",
    "table:human_claim_acceptance_items",
    "table:human_claim_acceptance_sources",
    "index:uq_human_claim_acceptance_fingerprint",
    "index:uq_human_claim_acceptance_idempotency_key",
    "index:idx_human_claim_acceptance_selection_created_at",
    "index:uq_human_claim_acceptance_items_receipt_claim",
    "index:idx_human_claim_acceptance_items_claim_id",
    "index:uq_human_claim_acceptance_sources_receipt_claim_role",
    "index:idx_human_claim_acceptance_sources_candidate_id",
    "index:idx_human_claim_acceptance_sources_source_id",
  ] },
  { tag: "0009_chunky_praxagora", artifacts: [
    "table:platform_text_draft_review_receipts",
    "table:platform_text_draft_review_platforms",
    "index:uq_platform_text_draft_review_fingerprint",
    "index:uq_platform_text_draft_review_idempotency_key",
    "index:idx_platform_text_draft_review_preview_created_at",
    "index:uq_platform_text_draft_review_platform_receipt_platform",
    "index:idx_platform_text_draft_review_platform_draft",
  ] },
  { tag: "0010_tranquil_donald_blake", artifacts: [
    "table:platform_text_visual_review_receipts",
    "table:platform_text_visual_review_platforms",
    "table:platform_text_visual_review_assets",
    "index:uq_platform_text_visual_review_fingerprint",
    "index:uq_platform_text_visual_review_idempotency_key",
    "index:idx_platform_text_visual_review_render_created_at",
    "index:uq_platform_text_visual_review_platform_receipt_platform",
    "index:idx_platform_text_visual_review_platform_platform",
    "index:uq_platform_text_visual_review_asset_receipt_platform_card",
    "index:idx_platform_text_visual_review_asset_svg_fingerprint",
  ] },
  { tag: "0011_living_logan", artifacts: [
    "column:content_fingerprint",
    "column:published_post_url",
    "column:published_at",
    "column:source_reference",
    "column:source_evidence_fingerprint",
    "index:idx_metrics_content_fingerprint",
    "index:idx_metrics_source_evidence_fingerprint",
  ] },
];

function safeResult(fields = {}) {
  return { verification: "read_only_sqlite_schema", databaseWrites: false, applyPerformed: false, externalCalls: false, costIncurred: false, publishTriggered: false, ...fields };
}

export async function inspectMigrationChain(d1) {
  if (!d1 || typeof d1.prepare !== "function") throw new Error("d1_binding_required");
  const [schemaResult, columnResult] = await Promise.all([
    d1.prepare(INSPECT_SCHEMA_OBJECTS_SQL).all(),
    d1.prepare(INSPECT_METRICS_COLUMNS_SQL).all(),
  ]);
  const schemaArtifacts = new Set(
    Array.isArray(schemaResult?.results)
      ? schemaResult.results.filter((row) => typeof row?.name === "string" && (row?.type === "table" || row?.type === "index")).map((row) => `${row.type}:${row.name}`)
      : [],
  );
  const metricColumns = new Set(Array.isArray(columnResult?.results) ? columnResult.results.map((row) => row?.name).filter((name) => typeof name === "string") : []);
  const migrationLedgerObjects = Array.isArray(schemaResult?.results)
    ? schemaResult.results.filter((row) => row?.type === "table" && typeof row?.name === "string" && /migration/i.test(row.name)).map((row) => row.name)
    : [];
  const steps = MIGRATION_CHAIN.map((step) => {
    const presentArtifacts = step.artifacts.filter((artifact) => artifact.startsWith("column:") ? metricColumns.has(artifact.slice(7)) : schemaArtifacts.has(artifact));
    return { ...step, presentArtifacts, missingArtifacts: step.artifacts.filter((artifact) => !presentArtifacts.includes(artifact)), complete: presentArtifacts.length === step.artifacts.length, partial: presentArtifacts.length > 0 && presentArtifacts.length < step.artifacts.length };
  });
  const completedSteps = steps.filter((step) => step.complete).length;
  const firstPending = steps.find((step) => !step.complete)?.tag ?? null;
  const applicationObjects = [...schemaArtifacts].filter((artifact) => !artifact.includes("_cf_") && !artifact.includes("d1_migrations"));
  const emptyApplicationSchema = applicationObjects.length === 0 && metricColumns.size === 0;
  return safeResult({
    status: completedSteps === steps.length ? "current" : emptyApplicationSchema ? "empty" : "incomplete",
    current: completedSteps === steps.length,
    emptyApplicationSchema,
    migrationLedgerObjects,
    completedSteps,
    totalSteps: steps.length,
    firstPending,
    steps,
    blockers: completedSteps === steps.length ? [] : emptyApplicationSchema ? ["full_migration_chain_missing"] : [steps.some((step) => step.partial) ? "partial_migration_detected" : "migration_chain_incomplete"],
  });
}
