import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  value: text("value").notNull().default(""),
  description: text("description"),
  category: text("category").notNull().default("Other"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Integration = typeof integrationsTable.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
