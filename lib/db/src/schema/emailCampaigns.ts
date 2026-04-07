import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { emailTemplatesTable } from "./emailTemplates";
import { emailSendersTable } from "./emailSenders";

export const emailCampaignsTable = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  previewText: text("preview_text").notNull().default(""),
  templateId: integer("template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  senderId: integer("sender_id").references(() => emailSendersTable.id, { onDelete: "set null" }),
  htmlContent: text("html_content").notNull().default(""),
  recipientListName: text("recipient_list_name").notNull().default("default"),
  recipientCount: integer("recipient_count").notNull().default(0),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;
