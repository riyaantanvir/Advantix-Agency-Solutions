import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { shortUrlsTable } from "./shortUrls";

export const urlClicksTable = pgTable("url_clicks", {
  id: serial("id").primaryKey(),
  urlId: integer("url_id").notNull().references(() => shortUrlsTable.id, { onDelete: "cascade" }),
  countryCode: text("country_code"),
  country: text("country"),
  city: text("city"),
  referrer: text("referrer"),
  device: text("device"),
  browser: text("browser"),
  os: text("os"),
  ip: text("ip"),
  isp: text("isp"),
  isMobile: boolean("is_mobile"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UrlClick = typeof urlClicksTable.$inferSelect;
