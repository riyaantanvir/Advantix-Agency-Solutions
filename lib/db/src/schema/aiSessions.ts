import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { aiProjectsTable } from "./aiProjects";
import { toolUsersTable } from "./toolUsers";

export const aiSessionsTable = pgTable("ai_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => toolUsersTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => aiProjectsTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiSessionSchema = createInsertSchema(aiSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiSession = typeof aiSessionsTable.$inferSelect;
export type InsertAiSession = z.infer<typeof insertAiSessionSchema>;
