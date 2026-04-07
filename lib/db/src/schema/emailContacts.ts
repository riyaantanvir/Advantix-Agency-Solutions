import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailContactsTable = pgTable("email_contacts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  tags: text("tags").notNull().default(""),
  listName: text("list_name").notNull().default("default"),
  source: text("source").notNull().default("manual"),
  unsubscribed: boolean("unsubscribed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_contacts_email_list_idx").on(table.email, table.listName),
]);

export const insertEmailContactSchema = createInsertSchema(emailContactsTable).omit({ id: true, createdAt: true });
export type InsertEmailContact = z.infer<typeof insertEmailContactSchema>;
export type EmailContact = typeof emailContactsTable.$inferSelect;
