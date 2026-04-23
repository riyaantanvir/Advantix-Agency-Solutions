import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const workspaceInvitesTable = pgTable("workspace_invites", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedByToolUserId: integer("invited_by_tool_user_id").notNull(),
  accepted: boolean("accepted").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceInvite = typeof workspaceInvitesTable.$inferSelect;
export type InsertWorkspaceInvite = typeof workspaceInvitesTable.$inferInsert;
