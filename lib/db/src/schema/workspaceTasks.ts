import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const workspaceTasksTable = pgTable("workspace_tasks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  projectId: integer("project_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  assignedToToolUserId: integer("assigned_to_tool_user_id"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  lastOverdueAlertAt: timestamp("last_overdue_alert_at", { withTimezone: true }),
  createdByToolUserId: integer("created_by_tool_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceTask = typeof workspaceTasksTable.$inferSelect;
export type InsertWorkspaceTask = typeof workspaceTasksTable.$inferInsert;
