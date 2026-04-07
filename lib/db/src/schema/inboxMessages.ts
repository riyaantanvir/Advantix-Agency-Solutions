import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inboxMessagesTable = pgTable("inbox_messages", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  direction: text("direction").notNull().default("inbound"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull().default(""),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  campaignId: integer("campaign_id"),
  resendId: text("resend_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertInboxMessageSchema = createInsertSchema(inboxMessagesTable).omit({ id: true, createdAt: true });
export type InsertInboxMessage = z.infer<typeof insertInboxMessageSchema>;
export type InboxMessage = typeof inboxMessagesTable.$inferSelect;
