CREATE TABLE `human_claim_acceptance_items` (
	`receipt_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`proposed_claim` text NOT NULL,
	`review_note` text NOT NULL,
	`acceptance_checks_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_human_claim_acceptance_items_receipt_claim` ON `human_claim_acceptance_items` (`receipt_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_human_claim_acceptance_items_claim_id` ON `human_claim_acceptance_items` (`claim_id`);--> statement-breakpoint
CREATE TABLE `human_claim_acceptance_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_selection_fingerprint` text NOT NULL,
	`acceptance_fingerprint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_human_claim_acceptance_fingerprint` ON `human_claim_acceptance_receipts` (`acceptance_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_human_claim_acceptance_idempotency_key` ON `human_claim_acceptance_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_human_claim_acceptance_selection_created_at` ON `human_claim_acceptance_receipts` (`claim_selection_fingerprint`,`created_at`);--> statement-breakpoint
CREATE TABLE `human_claim_acceptance_sources` (
	`receipt_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`source_id` text NOT NULL,
	`evidence_role` text NOT NULL,
	`canonical_url` text NOT NULL,
	`source_sentence` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_human_claim_acceptance_sources_receipt_claim_role` ON `human_claim_acceptance_sources` (`receipt_id`,`claim_id`,`evidence_role`);--> statement-breakpoint
CREATE INDEX `idx_human_claim_acceptance_sources_candidate_id` ON `human_claim_acceptance_sources` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_human_claim_acceptance_sources_source_id` ON `human_claim_acceptance_sources` (`source_id`);