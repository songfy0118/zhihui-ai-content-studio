CREATE TABLE `platform_text_draft_review_platforms` (
	`receipt_id` text NOT NULL,
	`platform` text NOT NULL,
	`draft_fingerprint` text NOT NULL,
	`review_note` text NOT NULL,
	`review_checks_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_draft_review_platform_receipt_platform` ON `platform_text_draft_review_platforms` (`receipt_id`,`platform`);--> statement-breakpoint
CREATE INDEX `idx_platform_text_draft_review_platform_draft` ON `platform_text_draft_review_platforms` (`platform`,`draft_fingerprint`);--> statement-breakpoint
CREATE TABLE `platform_text_draft_review_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_preview_fingerprint` text NOT NULL,
	`blueprint_fingerprint` text NOT NULL,
	`review_fingerprint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_draft_review_fingerprint` ON `platform_text_draft_review_receipts` (`review_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_draft_review_idempotency_key` ON `platform_text_draft_review_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_platform_text_draft_review_preview_created_at` ON `platform_text_draft_review_receipts` (`draft_preview_fingerprint`,`created_at`);