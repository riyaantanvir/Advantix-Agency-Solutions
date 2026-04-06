import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Log the host (without credentials) at startup to help debug connection issues
try {
  const u = new URL(databaseUrl);
  console.log(`[db] Connecting to ${u.hostname}:${u.port || 5432}${u.pathname}`);
} catch {
  console.log("[db] DATABASE_URL could not be parsed as a URL");
}

// DigitalOcean managed PostgreSQL always requires SSL.
// rejectUnauthorized:false accepts DO's self-signed certs in the
// private-network URL while still encrypting the connection.
const sslConfig =
  process.env.NODE_ENV === "production"
    ? { ssl: { rejectUnauthorized: false } }
    : {};

export const pool = new Pool({ connectionString: databaseUrl, ...sslConfig });
export const db = drizzle(pool, { schema });

export * from "./schema";
