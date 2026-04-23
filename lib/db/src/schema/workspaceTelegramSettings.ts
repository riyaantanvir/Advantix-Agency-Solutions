import { pgTable, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const workspaceTelegramSettingsTable = pgTable("workspace_telegram_settings", {
  workspaceId: integer("workspace_id").primaryKey(),
  chatIds: text("chat_ids"),
  enabled: boolean("enabled").notNull().default(false),
  taskRemindIntervalHours: integer("task_remind_interval_hours").notNull().default(2),
  workHoursStart: integer("work_hours_start").notNull().default(9),
  workHoursEnd: integer("work_hours_end").notNull().default(22),
  notifyOnCreate: boolean("notify_on_create").notNull().default(true),
  notifyOnStatusChange: boolean("notify_on_status_change").notNull().default(true),
  notifyOnComment: boolean("notify_on_comment").notNull().default(true),
  lastOverdueRunAt: timestamp("last_overdue_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceTelegramSettings = typeof workspaceTelegramSettingsTable.$inferSelect;
export type InsertWorkspaceTelegramSettings = typeof workspaceTelegramSettingsTable.$inferInsert;
