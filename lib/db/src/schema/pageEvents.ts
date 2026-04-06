import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const pageEventsTable = pgTable("page_events", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(), // 'pageview' | 'scroll' | 'click' | 'exit'
  pagePath: text("page_path").notNull(),
  referrer: text("referrer"),
  scrollDepth: integer("scroll_depth"),
  timeOnPage: integer("time_on_page"),
  clickX: real("click_x"),
  clickY: real("click_y"),
  ip: text("ip"),
  country: text("country"),
  city: text("city"),
  browser: text("browser"),
  os: text("os"),
  device: text("device"),
  language: text("language"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PageEvent = typeof pageEventsTable.$inferSelect;
