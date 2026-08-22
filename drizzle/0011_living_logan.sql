ALTER TABLE `metrics` ADD `content_fingerprint` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `published_post_url` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `source_reference` text;--> statement-breakpoint
ALTER TABLE `metrics` ADD `source_evidence_fingerprint` text;--> statement-breakpoint
CREATE INDEX `idx_metrics_content_fingerprint` ON `metrics` (`content_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_metrics_source_evidence_fingerprint` ON `metrics` (`source_evidence_fingerprint`);