import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { toolUsersTable } from "./toolUsers";

export const landingPageProjectsTable = pgTable("landing_page_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => toolUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Untitled Project"),
  html: text("html").notNull().default(""),
  messages: jsonb("messages").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLandingPageProjectSchema = createInsertSchema(landingPageProjectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LandingPageProject = typeof landingPageProjectsTable.$inferSelect;
export type InsertLandingPageProject = z.infer<typeof insertLandingPageProjectSchema>;
