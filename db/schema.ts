import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  angle: text("angle").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("candidate"),
  douyinScore: integer("douyin_score").notNull(),
  tiktokScore: integer("tiktok_score").notNull(),
  xhsScore: integer("xhs_score").notNull(),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ideas_created_at").on(table.createdAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id").notNull(),
  status: text("status").notNull().default("queued"),
  stage: text("stage").notNull().default("脚本"),
  progress: integer("progress").notNull().default(0),
  platforms: text("platforms").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_jobs_created_at").on(table.createdAt), index("idx_jobs_idea_id").on(table.ideaId)]);

export const metrics = sqliteTable("metrics", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id").notNull(),
  platform: text("platform").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  completionRate: real("completion_rate").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_metrics_platform_created_at").on(table.platform, table.createdAt), index("idx_metrics_idea_id").on(table.ideaId)]);

export const accounts = sqliteTable("accounts", {
  platform: text("platform").primaryKey(),
  handle: text("handle"),
  status: text("status").notNull().default("not_connected"),
  publishMode: text("publish_mode").notNull(),
  updatedAt: text("updated_at").notNull(),
});
