CREATE TABLE `accounts` (
	`platform` text PRIMARY KEY NOT NULL,
	`handle` text,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`publish_mode` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`angle` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`douyin_score` integer NOT NULL,
	`tiktok_score` integer NOT NULL,
	`xhs_score` integer NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT '脚本' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`platforms` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`platform` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`saves` integer DEFAULT 0 NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`completion_rate` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
