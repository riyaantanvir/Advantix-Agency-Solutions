import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const workspaceTaskCommentsTable = pgTable("workspace_task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  authorToolUserId: integer("author_tool_user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceTaskComment = typeof workspaceTaskCommentsTable.$inferSelect;
export type InsertWorkspaceTaskComment = typeof workspaceTaskCommentsTable.$inferInsert;
