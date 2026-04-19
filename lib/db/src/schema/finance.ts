import { pgTable, serial, text, integer, timestamp, numeric, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const financeTagsTable = pgTable("finance_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("finance_tags_user_name_uniq").on(t.userId, t.name),
}));

export const financePaymentMethodsTable = pgTable("finance_payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("finance_pm_user_name_uniq").on(t.userId, t.name),
}));

export const financeEntriesTable = pgTable("finance_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(), // 'expense' | 'income'
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  details: text("details"),
  tagId: integer("tag_id").references(() => financeTagsTable.id, { onDelete: "set null" }),
  paymentMethodId: integer("payment_method_id").references(() => financePaymentMethodsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  idxUserDate: index("finance_entries_user_date_idx").on(t.userId, t.date),
}));

export const financePlannedPaymentsTable = pgTable("finance_planned_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").references(() => financeTagsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  frequency: text("frequency").notNull(), // 'once' | 'weekly' | 'monthly' | 'yearly'
  startDate: date("start_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const financeSubscriptionsTable = pgTable("finance_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  frequency: text("frequency").notNull(),
  nextDueDate: date("next_due_date").notNull(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
