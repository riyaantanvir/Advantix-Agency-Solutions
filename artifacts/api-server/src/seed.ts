import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger.js";

export async function runMigrations(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS whatsapp text,
      ADD COLUMN IF NOT EXISTS budget text,
      ADD COLUMN IF NOT EXISTS details text
  `);
  logger.info("Migrations applied");
}

export async function ensureSessionTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'session_pkey'
      ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey"
          PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

export async function seedAdmin(): Promise<void> {
  const username = "admin";
  const password = "2816";

  const [existing] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(adminsTable).values({ username, passwordHash });
    logger.info("Admin user seeded successfully");
  } else {
    logger.info("Admin user already exists, skipping seed");
  }
}
