import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bugReportsTable = pgTable("bug_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  screenshot: text("screenshot"),
  status: text("status").default("pending").notNull(),
  priority: text("priority").default("medium").notNull(),
  reporterName: text("reporter_name"),
  reporterEmail: text("reporter_email"),
  pageUrl: text("page_url"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBugReportSchema = createInsertSchema(bugReportsTable).omit({
  id: true,
  status: true,
  priority: true,
  adminNote: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;
export type BugReport = typeof bugReportsTable.$inferSelect;
