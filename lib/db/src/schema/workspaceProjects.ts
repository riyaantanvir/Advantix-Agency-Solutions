import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const workspaceProjectsTable = pgTable("workspace_projects", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3b82f6"),
  status: text("status").notNull().default("active"),
  createdByToolUserId: integer("created_by_tool_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceProject = typeof workspaceProjectsTable.$inferSelect;
export type InsertWorkspaceProject = typeof workspaceProjectsTable.$inferInsert;
