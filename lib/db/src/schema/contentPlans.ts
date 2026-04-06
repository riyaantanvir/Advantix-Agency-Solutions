import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const contentPlansTable = pgTable("content_plans", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  status: text("status").default("planned").notNull(),
  postUrl: text("post_url"),
  tags: text("tags"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ContentPlan = typeof contentPlansTable.$inferSelect;
export type InsertContentPlan = typeof contentPlansTable.$inferInsert;
