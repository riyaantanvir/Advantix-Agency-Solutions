import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { emailCampaignsTable } from "./emailCampaigns";

export const emailEventsTable = pgTable("email_events", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => emailCampaignsTable.id, { onDelete: "cascade" }),
  contactEmail: text("contact_email").notNull(),
  eventType: text("event_type").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEmailEventSchema = createInsertSchema(emailEventsTable).omit({ id: true, occurredAt: true });
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEventsTable.$inferSelect;
