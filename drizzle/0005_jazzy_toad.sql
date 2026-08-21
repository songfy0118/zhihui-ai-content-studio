CREATE TABLE `script_review_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`source_idea_id` text NOT NULL,
	`drama_id` integer NOT NULL,
	`output_fingerprint` text NOT NULL,
	`source_lock_fingerprint` text NOT NULL,
	`review_draft_fingerprint` text NOT NULL,
	`preview_fingerprint` text NOT NULL,
	`checklist` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL,
	`reviewed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_script_review_acceptances_output_source_lock` ON `script_review_acceptances` (`output_fingerprint`,`source_lock_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_script_review_acceptances_idea_reviewed_at` ON `script_review_acceptances` (`source_idea_id`,`reviewed_at`);