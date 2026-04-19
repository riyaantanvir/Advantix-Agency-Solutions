import { pgTable, integer, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const whatsappSessionsTable = pgTable("whatsapp_sessions", {
  userId: integer("user_id").primaryKey().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("disconnected"),
  phoneNumber: text("phone_number"),
  displayName: text("display_name"),
  authState: jsonb("auth_state"),
  lastQr: text("last_qr"),
  triggerWord: text("trigger_word").notNull().default("@bot"),
  autoReplyDm: boolean("auto_reply_dm").notNull().default(true),
  autoReplyGroups: boolean("auto_reply_groups").notNull().default(false),
  allowedJids: jsonb("allowed_jids").$type<string[]>().default([]),
  blockedJids: jsonb("blocked_jids").$type<string[]>().default([]),
  connectedAt: timestamp("connected_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
