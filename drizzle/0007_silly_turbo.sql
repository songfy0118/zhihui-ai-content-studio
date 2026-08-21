CREATE TABLE `source_lock_evidence` (
	`source_lock_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`title` text NOT NULL,
	`canonical_url` text NOT NULL,
	`published_at` text,
	`evidence_role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_lock_evidence_lock_role` ON `source_lock_evidence` (`source_lock_id`,`evidence_role`);--> statement-breakpoint
CREATE INDEX `idx_source_lock_evidence_canonical_url` ON `source_lock_evidence` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_source_lock_evidence_source_id` ON `source_lock_evidence` (`source_id`);--> statement-breakpoint
CREATE TABLE `source_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`title` text NOT NULL,
	`review_fingerprint` text NOT NULL,
	`save_plan_fingerprint` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_locks_review_fingerprint` ON `source_locks` (`review_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_locks_save_plan_fingerprint` ON `source_locks` (`save_plan_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_source_locks_lead_created_at` ON `source_locks` (`lead_id`,`created_at`);