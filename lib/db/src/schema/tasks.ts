import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  type: text("type").notNull().default("internal"),
  clientName: text("client_name"),
  assignedTo: text("assigned_to"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  tags: text("tags"),
  position: integer("position").default(0).notNull(),
  projectId: integer("project_id"),
  createdBy: text("created_by"),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrenceType: text("recurrence_type"),
  recurrenceTime: text("recurrence_time"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
