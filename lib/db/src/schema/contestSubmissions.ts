import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contestSubmissionsTable = pgTable("contest_submissions", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull(),
  participantId: integer("participant_id").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  description: text("description"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertContestSubmissionSchema = createInsertSchema(contestSubmissionsTable).omit({
  id: true,
  submittedAt: true,
});

export type ContestSubmission = typeof contestSubmissionsTable.$inferSelect;
export type InsertContestSubmission = z.infer<typeof insertContestSubmissionSchema>;
