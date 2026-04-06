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

// Strip ?sslmode= from the URL so the explicit ssl option below takes full
// precedence — mixing both can cause "SSL certificate chain" errors on
// DigitalOcean managed PostgreSQL.
const cleanUrl = databaseUrl.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");

// Log the host (without credentials) at startup to help debug connection issues.
try {
  const u = new URL(cleanUrl);
  console.log(`[db] Connecting to ${u.hostname}:${u.port || 5432}${u.pathname}`);
} catch {
  console.log("[db] DATABASE_URL could not be parsed as a URL");
}

// DigitalOcean managed PostgreSQL always requires SSL but uses a self-signed
// certificate chain. rejectUnauthorized:false accepts DO's certs while still
// encrypting the connection. In development, SSL is left off entirely.
const sslConfig =
  process.env.NODE_ENV === "production"
    ? { ssl: { rejectUnauthorized: false } }
    : {};

export const pool = new Pool({ connectionString: cleanUrl, ...sslConfig });
export const db = drizzle(pool, { schema });

export * from "./schema";
