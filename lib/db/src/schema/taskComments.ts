import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskCommentsTable = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTaskCommentSchema = createInsertSchema(taskCommentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TaskComment = typeof taskCommentsTable.$inferSelect;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
