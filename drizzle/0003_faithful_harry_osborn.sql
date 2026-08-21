CREATE TABLE `pilot_authorization_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_request_hash` text NOT NULL,
	`execution_request_hash` text NOT NULL,
	`provider` text NOT NULL,
	`image_model` text NOT NULL,
	`video_model` text NOT NULL,
	`image_cost_cny` real NOT NULL,
	`video_cost_cny` real NOT NULL,
	`quoted_total_cost_cny` real NOT NULL,
	`max_cost_cny` real NOT NULL,
	`pricing_confirmed` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`issued_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	`consumed_at_ms` integer,
	`external_calls` integer DEFAULT false NOT NULL,
	`cost_incurred` integer DEFAULT false NOT NULL,
	`execution_triggered` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_receipts_execution_hash_issued_at` ON `pilot_authorization_receipts` (`execution_request_hash`,`issued_at_ms`);--> statement-breakpoint
CREATE INDEX `idx_pilot_receipts_status_expires_at` ON `pilot_authorization_receipts` (`status`,`expires_at_ms`);