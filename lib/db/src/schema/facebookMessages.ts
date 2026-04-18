import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { facebookPagesTable } from "./facebookPages";

export const facebookMessagesTable = pgTable("facebook_messages", {
  id: serial("id").primaryKey(),
  facebookPageId: integer("facebook_page_id").notNull().references(() => facebookPagesTable.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().unique(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name"),
  messageText: text("message_text").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  isReplied: boolean("is_replied").notNull().default(false),
  replyText: text("reply_text"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  replyType: text("reply_type"),
  ruleId: integer("rule_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FacebookMessage = typeof facebookMessagesTable.$inferSelect;
export type InsertFacebookMessage = typeof facebookMessagesTable.$inferInsert;
