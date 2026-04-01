import { integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { toolUsersTable } from "./toolUsers";

export const aiUserLimitsTable = pgTable("ai_user_limits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => toolUsersTable.id, { onDelete: "cascade" }),
  monthlyTokenLimit: integer("monthly_token_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiUserLimitSchema = createInsertSchema(aiUserLimitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiUserLimit = typeof aiUserLimitsTable.$inferSelect;
export type InsertAiUserLimit = z.infer<typeof insertAiUserLimitSchema>;
