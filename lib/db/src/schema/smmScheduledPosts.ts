import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const smmScheduledPostsTable = pgTable("smm_scheduled_posts", {
  id: serial("id").primaryKey(),
  platforms: text("platforms").notNull(), // comma-separated: "instagram,facebook"
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"), // pending | published | failed | cancelled
  publishedAt: timestamp("published_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  toolUserId: integer("tool_user_id").references(() => toolUsersTable.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SmmScheduledPost = typeof smmScheduledPostsTable.$inferSelect;
export type InsertSmmScheduledPost = typeof smmScheduledPostsTable.$inferInsert;
