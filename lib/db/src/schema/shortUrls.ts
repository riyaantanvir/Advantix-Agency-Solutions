import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const shortUrlsTable = pgTable("short_urls", {
  id: serial("id").primaryKey(),
  shortCode: text("short_code").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  title: text("title"),
  userId: integer("user_id")
    .notNull()
    .references(() => toolUsersTable.id, { onDelete: "cascade" }),
  clicks: integer("clicks").notNull().default(0),
  passwordHash: text("password_hash"),
  clickLimit: integer("click_limit"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
