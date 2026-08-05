CREATE INDEX `idx_ideas_created_at` ON `ideas` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_created_at` ON `jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_idea_id` ON `jobs` (`idea_id`);--> statement-breakpoint
CREATE INDEX `idx_metrics_platform_created_at` ON `metrics` (`platform`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_metrics_idea_id` ON `metrics` (`idea_id`);