import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { toolUsersTable } from "./toolUsers";

export const toolPdfBooksTable = pgTable("tool_pdf_books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => toolUsersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  text: text("text").notNull(),
  numPages: integer("num_pages").notNull().default(1),
  totalLines: integer("total_lines").notNull().default(0),
  lastLine: integer("last_line").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
