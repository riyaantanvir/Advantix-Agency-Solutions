import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { toolUsersTable } from "./toolUsers";

export const aiProjectsTable = pgTable("ai_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => toolUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  instructions: text("instructions").notNull().default(""),
  emoji: text("emoji").notNull().default("📁"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiProjectSchema = createInsertSchema(aiProjectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiProject = typeof aiProjectsTable.$inferSelect;
export type InsertAiProject = z.infer<typeof insertAiProjectSchema>;
