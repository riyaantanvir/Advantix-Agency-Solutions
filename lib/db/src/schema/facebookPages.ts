import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const facebookPagesTable = pgTable("facebook_pages", {
  id: serial("id").primaryKey(),
  toolUserId: integer("tool_user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull(),
  pageAccessToken: text("page_access_token").notNull(),
  userAccessToken: text("user_access_token"),
  isActive: boolean("is_active").notNull().default(true),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

export type FacebookPage = typeof facebookPagesTable.$inferSelect;
export type InsertFacebookPage = typeof facebookPagesTable.$inferInsert;
