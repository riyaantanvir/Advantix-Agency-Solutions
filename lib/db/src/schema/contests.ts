import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contestsTable = pgTable("contests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("logo"),
  instructions: text("instructions"),
  rules: text("rules"),
  prize: text("prize"),
  coverImageUrl: text("cover_image_url"),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("draft"),
  winnerSubmissionId: text("winner_submission_id"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertContestSchema = createInsertSchema(contestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Contest = typeof contestsTable.$inferSelect;
export type InsertContest = z.infer<typeof insertContestSchema>;
