import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { aiSessionsTable } from "./aiSessions";

export const aiMessagesTable = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => aiSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  provider: text("provider"),
  model: text("model"),
  intentType: text("intent_type"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiMessageSchema = createInsertSchema(aiMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type AiMessage = typeof aiMessagesTable.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
