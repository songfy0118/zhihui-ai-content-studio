ALTER TABLE `metrics` ADD `source_kind` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `external_post_id` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `captured_at` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `imported_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_metrics_platform_post_captured_at` ON `metrics` (`platform`,`external_post_id`,`captured_at`);