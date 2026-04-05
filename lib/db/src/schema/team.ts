import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  badge: text("badge"),
  tagline: text("tagline"),
  skills: text("skills").array(),
  order: serial("order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({ id: true, order: true, createdAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;
