import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contestParticipantsTable = pgTable("contest_participants", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  acceptedRules: boolean("accepted_rules").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertContestParticipantSchema = createInsertSchema(contestParticipantsTable).omit({
  id: true,
  createdAt: true,
});

export type ContestParticipant = typeof contestParticipantsTable.$inferSelect;
export type InsertContestParticipant = z.infer<typeof insertContestParticipantSchema>;
