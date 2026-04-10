import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const projectMembersTable = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  adminId: integer("admin_id").notNull(),
  role: text("role").notNull().default("member"),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProjectMember = typeof projectMembersTable.$inferSelect;
