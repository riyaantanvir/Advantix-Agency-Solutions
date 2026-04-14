import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const toolUsersTable = pgTable("tool_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  companyName: text("company_name"),
  phone: text("phone"),
  website: text("website"),
  googleId: text("google_id"),
  emailVerified: boolean("email_verified").notNull().default(true),
  verificationCode: text("verification_code"),
  verificationExpires: timestamp("verification_expires"),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
