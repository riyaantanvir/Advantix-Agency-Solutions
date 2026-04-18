import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { facebookPagesTable } from "./facebookPages";

export const facebookAutoReplyRulesTable = pgTable("facebook_auto_reply_rules", {
  id: serial("id").primaryKey(),
  facebookPageId: integer("facebook_page_id").notNull().references(() => facebookPagesTable.id, { onDelete: "cascade" }),
  ruleName: text("rule_name").notNull(),
  triggerType: text("trigger_type").notNull().default("all"),
  triggerKeywords: text("trigger_keywords"),
  replyMode: text("reply_mode").notNull().default("template"),
  replyTemplate: text("reply_template"),
  aiInstructions: text("ai_instructions"),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FacebookAutoReplyRule = typeof facebookAutoReplyRulesTable.$inferSelect;
export type InsertFacebookAutoReplyRule = typeof facebookAutoReplyRulesTable.$inferInsert;
