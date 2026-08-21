CREATE TABLE `review_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`action` text NOT NULL,
	`checklist` text NOT NULL,
	`publish_triggered` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_review_audits_job_created_at` ON `review_audits` (`job_id`,`created_at`);