import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

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
