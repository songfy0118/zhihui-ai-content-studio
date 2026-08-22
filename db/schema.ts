import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  angle: text("angle").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("candidate"),
  douyinScore: integer("douyin_score").notNull(),
  tiktokScore: integer("tiktok_score").notNull(),
  xhsScore: integer("xhs_score").notNull(),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ideas_created_at").on(table.createdAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id").notNull(),
  status: text("status").notNull().default("queued"),
  stage: text("stage").notNull().default("脚本"),
  progress: integer("progress").notNull().default(0),
  platforms: text("platforms").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_jobs_created_at").on(table.createdAt), index("idx_jobs_idea_id").on(table.ideaId)]);

export const reviewAudits = sqliteTable("review_audits", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  action: text("action").notNull(),
  checklist: text("checklist").notNull(),
  publishTriggered: integer("publish_triggered", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_review_audits_job_created_at").on(table.jobId, table.createdAt)]);

export const scriptReviewAcceptances = sqliteTable("script_review_acceptances", {
  id: text("id").primaryKey(),
  sourceIdeaId: text("source_idea_id").notNull(),
  dramaId: integer("drama_id").notNull(),
  outputFingerprint: text("output_fingerprint").notNull(),
  sourceLockFingerprint: text("source_lock_fingerprint").notNull(),
  reviewDraftFingerprint: text("review_draft_fingerprint").notNull(),
  previewFingerprint: text("preview_fingerprint").notNull(),
  checklist: text("checklist").notNull(),
  status: text("status").notNull().default("accepted"),
  reviewedAt: text("reviewed_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_script_review_acceptances_output_source_lock").on(table.outputFingerprint, table.sourceLockFingerprint),
  index("idx_script_review_acceptances_idea_reviewed_at").on(table.sourceIdeaId, table.reviewedAt),
]);

export const pilotAuthorizationReceipts = sqliteTable("pilot_authorization_receipts", {
  id: text("id").primaryKey(),
  candidateRequestHash: text("candidate_request_hash").notNull(),
  executionRequestHash: text("execution_request_hash").notNull(),
  provider: text("provider").notNull(),
  imageModel: text("image_model").notNull(),
  videoModel: text("video_model").notNull(),
  imageCostCny: real("image_cost_cny").notNull(),
  videoCostCny: real("video_cost_cny").notNull(),
  quotedTotalCostCny: real("quoted_total_cost_cny").notNull(),
  maxCostCny: real("max_cost_cny").notNull(),
  pricingConfirmed: integer("pricing_confirmed", { mode: "boolean" }).notNull(),
  status: text("status").notNull().default("active"),
  issuedAtMs: integer("issued_at_ms").notNull(),
  expiresAtMs: integer("expires_at_ms").notNull(),
  consumedAtMs: integer("consumed_at_ms"),
  externalCalls: integer("external_calls", { mode: "boolean" }).notNull().default(false),
  costIncurred: integer("cost_incurred", { mode: "boolean" }).notNull().default(false),
  executionTriggered: integer("execution_triggered", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_pilot_receipts_execution_hash_issued_at").on(table.executionRequestHash, table.issuedAtMs),
  index("idx_pilot_receipts_status_expires_at").on(table.status, table.expiresAtMs),
]);

export const metrics = sqliteTable("metrics", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id").notNull(),
  platform: text("platform").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  completionRate: real("completion_rate").notNull().default(0),
  sourceKind: text("source_kind"),
  externalPostId: text("external_post_id"),
  capturedAt: text("captured_at"),
  importedAt: text("imported_at"),
  contentFingerprint: text("content_fingerprint"),
  publishedPostUrl: text("published_post_url"),
  publishedAt: text("published_at"),
  sourceReference: text("source_reference"),
  sourceEvidenceFingerprint: text("source_evidence_fingerprint"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_metrics_platform_created_at").on(table.platform, table.createdAt),
  index("idx_metrics_idea_id").on(table.ideaId),
  index("idx_metrics_content_fingerprint").on(table.contentFingerprint),
  index("idx_metrics_source_evidence_fingerprint").on(table.sourceEvidenceFingerprint),
  uniqueIndex("uq_metrics_platform_post_captured_at").on(table.platform, table.externalPostId, table.capturedAt),
]);

export const accounts = sqliteTable("accounts", {
  platform: text("platform").primaryKey(),
  handle: text("handle"),
  status: text("status").notNull().default("not_connected"),
  publishMode: text("publish_mode").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const newsSources = sqliteTable("news_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  language: text("language").notNull(),
  category: text("category").notNull(),
  sourceType: text("source_type").notNull(),
  baseUrl: text("base_url").notNull(),
  feedUrl: text("feed_url"),
  rightsPolicy: text("rights_policy").notNull(),
  requiresLogin: integer("requires_login", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  refreshMinutes: integer("refresh_minutes").notNull().default(60),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_news_sources_enabled_category").on(table.enabled, table.category),
  index("idx_news_sources_type").on(table.sourceType),
]);

export const newsItems = sqliteTable("news_items", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  publishedAt: text("published_at"),
  fetchedAt: text("fetched_at").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("discovered"),
  language: text("language").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_news_items_canonical_url").on(table.canonicalUrl),
  index("idx_news_items_source_published_at").on(table.sourceId, table.publishedAt),
  index("idx_news_items_content_hash").on(table.contentHash),
]);

export const topicClusters = sqliteTable("topic_clusters", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("candidate"),
  heatScore: real("heat_score").notNull().default(0),
  confidenceScore: real("confidence_score").notNull().default(0),
  sourceCount: integer("source_count").notNull().default(0),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uq_topic_clusters_slug").on(table.slug),
  index("idx_topic_clusters_status_last_seen_at").on(table.status, table.lastSeenAt),
]);

export const topicClusterItems = sqliteTable("topic_cluster_items", {
  clusterId: text("cluster_id").notNull(),
  itemId: text("item_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_topic_cluster_items_cluster_item").on(table.clusterId, table.itemId),
  index("idx_topic_cluster_items_item_id").on(table.itemId),
]);

export const sourceLocks = sqliteTable("source_locks", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  title: text("title").notNull(),
  reviewFingerprint: text("review_fingerprint").notNull(),
  savePlanFingerprint: text("save_plan_fingerprint").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uq_source_locks_review_fingerprint").on(table.reviewFingerprint),
  uniqueIndex("uq_source_locks_save_plan_fingerprint").on(table.savePlanFingerprint),
  index("idx_source_locks_lead_created_at").on(table.leadId, table.createdAt),
]);

export const sourceLockEvidence = sqliteTable("source_lock_evidence", {
  sourceLockId: text("source_lock_id").notNull(),
  evidenceId: text("evidence_id").notNull(),
  sourceId: text("source_id").notNull(),
  sourceName: text("source_name").notNull(),
  title: text("title").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  publishedAt: text("published_at"),
  evidenceRole: text("evidence_role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_source_lock_evidence_lock_role").on(table.sourceLockId, table.evidenceRole),
  index("idx_source_lock_evidence_canonical_url").on(table.canonicalUrl),
  index("idx_source_lock_evidence_source_id").on(table.sourceId),
]);

export const humanClaimAcceptanceReceipts = sqliteTable("human_claim_acceptance_receipts", {
  id: text("id").primaryKey(),
  claimSelectionFingerprint: text("claim_selection_fingerprint").notNull(),
  acceptanceFingerprint: text("acceptance_fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_human_claim_acceptance_fingerprint").on(table.acceptanceFingerprint),
  uniqueIndex("uq_human_claim_acceptance_idempotency_key").on(table.idempotencyKey),
  index("idx_human_claim_acceptance_selection_created_at").on(table.claimSelectionFingerprint, table.createdAt),
]);

export const humanClaimAcceptanceItems = sqliteTable("human_claim_acceptance_items", {
  receiptId: text("receipt_id").notNull(),
  claimId: text("claim_id").notNull(),
  proposedClaim: text("proposed_claim").notNull(),
  reviewNote: text("review_note").notNull(),
  acceptanceChecksJson: text("acceptance_checks_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_human_claim_acceptance_items_receipt_claim").on(table.receiptId, table.claimId),
  index("idx_human_claim_acceptance_items_claim_id").on(table.claimId),
]);

export const humanClaimAcceptanceSources = sqliteTable("human_claim_acceptance_sources", {
  receiptId: text("receipt_id").notNull(),
  claimId: text("claim_id").notNull(),
  candidateId: text("candidate_id").notNull(),
  evidenceId: text("evidence_id").notNull(),
  sourceId: text("source_id").notNull(),
  evidenceRole: text("evidence_role").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  sourceSentence: text("source_sentence").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_human_claim_acceptance_sources_receipt_claim_role").on(table.receiptId, table.claimId, table.evidenceRole),
  index("idx_human_claim_acceptance_sources_candidate_id").on(table.candidateId),
  index("idx_human_claim_acceptance_sources_source_id").on(table.sourceId),
]);

export const platformTextDraftReviewReceipts = sqliteTable("platform_text_draft_review_receipts", {
  id: text("id").primaryKey(),
  draftPreviewFingerprint: text("draft_preview_fingerprint").notNull(),
  blueprintFingerprint: text("blueprint_fingerprint").notNull(),
  reviewFingerprint: text("review_fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_platform_text_draft_review_fingerprint").on(table.reviewFingerprint),
  uniqueIndex("uq_platform_text_draft_review_idempotency_key").on(table.idempotencyKey),
  index("idx_platform_text_draft_review_preview_created_at").on(table.draftPreviewFingerprint, table.createdAt),
]);

export const platformTextDraftReviewPlatforms = sqliteTable("platform_text_draft_review_platforms", {
  receiptId: text("receipt_id").notNull(),
  platform: text("platform").notNull(),
  draftFingerprint: text("draft_fingerprint").notNull(),
  reviewNote: text("review_note").notNull(),
  reviewChecksJson: text("review_checks_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_platform_text_draft_review_platform_receipt_platform").on(table.receiptId, table.platform),
  index("idx_platform_text_draft_review_platform_draft").on(table.platform, table.draftFingerprint),
]);

export const platformTextVisualReviewReceipts = sqliteTable("platform_text_visual_review_receipts", {
  id: text("id").primaryKey(),
  renderFingerprint: text("render_fingerprint").notNull(),
  bundleManifestFingerprint: text("bundle_manifest_fingerprint").notNull(),
  visualReviewFingerprint: text("visual_review_fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_platform_text_visual_review_fingerprint").on(table.visualReviewFingerprint),
  uniqueIndex("uq_platform_text_visual_review_idempotency_key").on(table.idempotencyKey),
  index("idx_platform_text_visual_review_render_created_at").on(table.renderFingerprint, table.createdAt),
]);

export const platformTextVisualReviewPlatforms = sqliteTable("platform_text_visual_review_platforms", {
  receiptId: text("receipt_id").notNull(),
  platform: text("platform").notNull(),
  assetCount: integer("asset_count").notNull(),
  reviewNote: text("review_note").notNull(),
  reviewChecksJson: text("review_checks_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_platform_text_visual_review_platform_receipt_platform").on(table.receiptId, table.platform),
  index("idx_platform_text_visual_review_platform_platform").on(table.platform),
]);

export const platformTextVisualReviewAssets = sqliteTable("platform_text_visual_review_assets", {
  receiptId: text("receipt_id").notNull(),
  platform: text("platform").notNull(),
  cardIndex: integer("card_index").notNull(),
  role: text("role").notNull(),
  filename: text("filename").notNull(),
  copyFingerprint: text("copy_fingerprint").notNull(),
  svgFingerprint: text("svg_fingerprint").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_platform_text_visual_review_asset_receipt_platform_card").on(table.receiptId, table.platform, table.cardIndex),
  index("idx_platform_text_visual_review_asset_svg_fingerprint").on(table.svgFingerprint),
]);

export const accountTopicWeightUpdateReceipts = sqliteTable("account_topic_weight_update_receipts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  sourceReviewFingerprint: text("source_review_fingerprint").notNull(),
  authorizationPreviewFingerprint: text("authorization_preview_fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_account_topic_weight_update_source_review").on(table.sourceReviewFingerprint),
  uniqueIndex("uq_account_topic_weight_update_authorization_preview").on(table.authorizationPreviewFingerprint),
  uniqueIndex("uq_account_topic_weight_update_idempotency_key").on(table.idempotencyKey),
  index("idx_account_topic_weight_update_profile_created_at").on(table.profileId, table.createdAt),
]);

export const accountTopicWeightUpdateItems = sqliteTable("account_topic_weight_update_items", {
  receiptId: text("receipt_id").notNull(),
  scope: text("scope").notNull(),
  weightKey: text("weight_key").notNull(),
  previousWeight: real("previous_weight").notNull(),
  appliedWeight: real("applied_weight").notNull(),
  delta: real("delta").notNull(),
  sourceUniqueIdeaCount: integer("source_unique_idea_count").notNull(),
  sourceMeanSignal: real("source_mean_signal").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("uq_account_topic_weight_update_item_receipt_scope_key").on(table.receiptId, table.scope, table.weightKey),
  index("idx_account_topic_weight_update_item_receipt").on(table.receiptId),
]);

export const accountTopicWeightValues = sqliteTable("account_topic_weight_values", {
  profileId: text("profile_id").notNull(),
  scope: text("scope").notNull(),
  weightKey: text("weight_key").notNull(),
  weight: real("weight").notNull(),
  sourceUpdateReceiptId: text("source_update_receipt_id").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uq_account_topic_weight_value_profile_scope_key").on(table.profileId, table.scope, table.weightKey),
  index("idx_account_topic_weight_value_source_receipt").on(table.sourceUpdateReceiptId),
]);
