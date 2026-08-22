CREATE TABLE `platform_text_visual_review_assets` (
	`receipt_id` text NOT NULL,
	`platform` text NOT NULL,
	`card_index` integer NOT NULL,
	`role` text NOT NULL,
	`filename` text NOT NULL,
	`copy_fingerprint` text NOT NULL,
	`svg_fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_visual_review_asset_receipt_platform_card` ON `platform_text_visual_review_assets` (`receipt_id`,`platform`,`card_index`);--> statement-breakpoint
CREATE INDEX `idx_platform_text_visual_review_asset_svg_fingerprint` ON `platform_text_visual_review_assets` (`svg_fingerprint`);--> statement-breakpoint
CREATE TABLE `platform_text_visual_review_platforms` (
	`receipt_id` text NOT NULL,
	`platform` text NOT NULL,
	`asset_count` integer NOT NULL,
	`review_note` text NOT NULL,
	`review_checks_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_visual_review_platform_receipt_platform` ON `platform_text_visual_review_platforms` (`receipt_id`,`platform`);--> statement-breakpoint
CREATE INDEX `idx_platform_text_visual_review_platform_platform` ON `platform_text_visual_review_platforms` (`platform`);--> statement-breakpoint
CREATE TABLE `platform_text_visual_review_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`render_fingerprint` text NOT NULL,
	`bundle_manifest_fingerprint` text NOT NULL,
	`visual_review_fingerprint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_visual_review_fingerprint` ON `platform_text_visual_review_receipts` (`visual_review_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_platform_text_visual_review_idempotency_key` ON `platform_text_visual_review_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_platform_text_visual_review_render_created_at` ON `platform_text_visual_review_receipts` (`render_fingerprint`,`created_at`);