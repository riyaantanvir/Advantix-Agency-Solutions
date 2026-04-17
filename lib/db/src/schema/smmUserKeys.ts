import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const smmUserKeysTable = pgTable("smm_user_keys", {
  id: serial("id").primaryKey(),
  toolUserId: integer("tool_user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  keyName: text("key_name").notNull(),
  keyValue: text("key_value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique("smm_user_keys_user_key").on(t.toolUserId, t.keyName),
]);

export type SmmUserKey = typeof smmUserKeysTable.$inferSelect;
export type InsertSmmUserKey = typeof smmUserKeysTable.$inferInsert;
