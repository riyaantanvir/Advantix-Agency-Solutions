import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { toolUsersTable } from "./toolUsers";

export const aiMemoriesTable = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => toolUsersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiMemorySchema = createInsertSchema(aiMemoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiMemory = typeof aiMemoriesTable.$inferSelect;
export type InsertAiMemory = z.infer<typeof insertAiMemorySchema>;
