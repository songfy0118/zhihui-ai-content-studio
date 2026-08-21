CREATE TABLE `news_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`published_at` text,
	`fetched_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_news_items_canonical_url` ON `news_items` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_news_items_source_published_at` ON `news_items` (`source_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_news_items_content_hash` ON `news_items` (`content_hash`);--> statement-breakpoint
CREATE TABLE `news_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`language` text NOT NULL,
	`category` text NOT NULL,
	`source_type` text NOT NULL,
	`base_url` text NOT NULL,
	`feed_url` text,
	`rights_policy` text NOT NULL,
	`requires_login` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`refresh_minutes` integer DEFAULT 60 NOT NULL,
	`last_checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_news_sources_enabled_category` ON `news_sources` (`enabled`,`category`);--> statement-breakpoint
CREATE INDEX `idx_news_sources_type` ON `news_sources` (`source_type`);--> statement-breakpoint
CREATE TABLE `topic_cluster_items` (
	`cluster_id` text NOT NULL,
	`item_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_topic_cluster_items_cluster_item` ON `topic_cluster_items` (`cluster_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_topic_cluster_items_item_id` ON `topic_cluster_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `topic_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`heat_score` real DEFAULT 0 NOT NULL,
	`confidence_score` real DEFAULT 0 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_topic_clusters_slug` ON `topic_clusters` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_topic_clusters_status_last_seen_at` ON `topic_clusters` (`status`,`last_seen_at`);