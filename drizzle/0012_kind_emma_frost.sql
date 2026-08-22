CREATE TABLE `account_topic_weight_update_items` (
	`receipt_id` text NOT NULL,
	`scope` text NOT NULL,
	`weight_key` text NOT NULL,
	`previous_weight` real NOT NULL,
	`applied_weight` real NOT NULL,
	`delta` real NOT NULL,
	`source_unique_idea_count` integer NOT NULL,
	`source_mean_signal` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_topic_weight_update_item_receipt_scope_key` ON `account_topic_weight_update_items` (`receipt_id`,`scope`,`weight_key`);--> statement-breakpoint
CREATE INDEX `idx_account_topic_weight_update_item_receipt` ON `account_topic_weight_update_items` (`receipt_id`);--> statement-breakpoint
CREATE TABLE `account_topic_weight_update_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`source_review_fingerprint` text NOT NULL,
	`authorization_preview_fingerprint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_topic_weight_update_source_review` ON `account_topic_weight_update_receipts` (`source_review_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_topic_weight_update_authorization_preview` ON `account_topic_weight_update_receipts` (`authorization_preview_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_topic_weight_update_idempotency_key` ON `account_topic_weight_update_receipts` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_account_topic_weight_update_profile_created_at` ON `account_topic_weight_update_receipts` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `account_topic_weight_values` (
	`profile_id` text NOT NULL,
	`scope` text NOT NULL,
	`weight_key` text NOT NULL,
	`weight` real NOT NULL,
	`source_update_receipt_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_topic_weight_value_profile_scope_key` ON `account_topic_weight_values` (`profile_id`,`scope`,`weight_key`);--> statement-breakpoint
CREATE INDEX `idx_account_topic_weight_value_source_receipt` ON `account_topic_weight_values` (`source_update_receipt_id`);