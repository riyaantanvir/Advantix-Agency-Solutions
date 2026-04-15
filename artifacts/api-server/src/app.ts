import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import redirectRouter from "./routes/shortRedirect.js";
import { logger } from "./lib/logger.js";
import { apiLimiter } from "./lib/rateLimiter.js";
import { pool, db } from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.SESSION_SECRET) {
  // In production, a missing SESSION_SECRET means every restart generates a new random secret,
  // which invalidates ALL active sessions (logs out every user). Fail fast instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "\n" + "=".repeat(72) + "\n" +
      "  FATAL: SESSION_SECRET environment variable is not set.\n" +
      "  In production this MUST be a fixed secret string so sessions\n" +
      "  survive server restarts and deployments.\n" +
      "  In DigitalOcean App Platform: App Settings → Environment Variables\n" +
      "  → Add SESSION_SECRET as an Encrypted Secret with a long random value.\n" +
      "  Generate one with:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
      "=".repeat(72)
    );
  }

  const { randomBytes } = await import("node:crypto");

  // In development: persist the secret to a local file so server restarts
  // don't invalidate existing sessions.
  const secretFile = path.resolve(__dirname, "../../../.session-secret");
  let secret: string;

  try {
    if (fs.existsSync(secretFile)) {
      secret = fs.readFileSync(secretFile, "utf8").trim();
    } else {
      secret = randomBytes(32).toString("hex");
      fs.writeFileSync(secretFile, secret, { encoding: "utf8", mode: 0o600 });
    }
  } catch {
    secret = randomBytes(32).toString("hex");
  }

  process.env.SESSION_SECRET = secret;
  console.error("\n" + "=".repeat(72));
  console.error("  ⚠  SESSION_SECRET not set — using persisted dev secret.");
  console.error("  This is fine for development. NEVER deploy without setting it.");
  console.error("=".repeat(72) + "\n");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const isProd = process.env.NODE_ENV === "production";

// ── CORS origins ──────────────────────────────────────────────────────────────
// In production, set ALLOWED_ORIGINS (comma-separated) or leave empty for
// same-origin only. In dev we allow Replit + local dev servers.
const ALLOWED_ORIGINS: string[] = [];

if (isProd) {
  const env = process.env.ALLOWED_ORIGINS ?? "";
  env
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .forEach((o) => ALLOWED_ORIGINS.push(o));
} else {
  const replitDomains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  replitDomains.forEach((d) => {
    ALLOWED_ORIGINS.push(`https://${d}`);
    ALLOWED_ORIGINS.push(`http://${d}`);
  });
  ALLOWED_ORIGINS.push(
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
  );
}

const PgSession = connectPgSimple(session);

const app: Express = express();

// DigitalOcean App Platform runs behind multiple proxy layers (load balancer + VXLAN).
// Setting trust proxy to true tells Express to trust X-Forwarded-* headers from any proxy,
// which is needed for correct req.ip, req.protocol (https), and secure cookie behavior.
// This is safe because DO manages the network layer and we don't expose the container directly.
app.set("trust proxy", true);

// ── Security headers (Helmet) ─────────────────────────────────────────────────
// Sets many protective HTTP headers automatically:
//   X-Content-Type-Options: nosniff       — blocks MIME-type sniffing attacks
//   X-Frame-Options: SAMEORIGIN           — prevents clickjacking in iframes
//   Strict-Transport-Security             — forces HTTPS on modern browsers (HSTS)
//   Cross-Origin-Opener-Policy            — prevents cross-origin window access
//   Referrer-Policy: no-referrer          — don't leak URL to third parties
//   X-Powered-By removed                  — hides "Express" from attackers
// CSP is intentionally disabled here because the SPAs inject inline scripts at
// build time. Add a nonce-based CSP when you move to server-side rendering.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin requests have no Origin header — always allow
      if (!origin) { callback(null, true); return; }
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin) || !isProd) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  }),
);

// ── Request body limits ────────────────────────────────────────────────────────
// 2 MB is plenty for JSON API payloads. File uploads go through multer separately
// (which has its own per-upload limits) so this limit only affects JSON bodies.
// Keeping it low prevents memory-exhaustion DoS attacks via oversized JSON bodies.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const isReplit = !isProd && Boolean(process.env.REPLIT_DOMAINS);

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

app.use(
  session({
    store: new PgSession({
      pool,
      // Prune expired sessions every hour; store TTL matches the cookie maxAge
      pruningInterval: 60 * 60,
      ttl: SESSION_MAX_AGE_MS / 1000, // connect-pg-simple uses seconds
    }),
    secret: process.env.SESSION_SECRET,
    resave: true,          // Must be true when rolling:true so the store expire time is updated
    saveUninitialized: false,
    rolling: true,         // Reset cookie maxAge on every response so active users stay logged in
    cookie: {
      secure: isProd || isReplit,
      httpOnly: true,
      sameSite: isReplit ? "none" as const : "lax" as const,
      maxAge: SESSION_MAX_AGE_MS,
    },
  }),
);

// ── Uploaded blog images ─────────────────────────────────────────────────────
// Files are saved by blog.ts to <workspace_root>/uploads/blog/
// (3 levels up from dist/: dist/ → api-server/ → artifacts/ → workspace/)
// Served at /uploads/ for production AND /api/uploads/ for Replit dev proxy.
const uploadsDir = path.resolve(__dirname, "../../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));
app.use("/api/uploads", express.static(uploadsDir));

// ── URL shortener (must be before API prefix) ─────────────────────────────────
app.use(redirectRouter);

// ── API rate limiter ───────────────────────────────────────────────────────────
// Applied to all /api/* routes. Specific routes (login, forms) have stricter
// limiters applied directly in their router files.
app.use("/api", apiLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── HTML helpers for OG meta tag injection ────────────────────────────────────
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectBlogOg(
  html: string,
  { title, description, image, url }: { title: string; description: string; image: string; url: string },
): string {
  const t  = escHtml(title);
  const d  = escHtml(description);
  const im = escHtml(image);
  const u  = escHtml(url);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(name="description"[^>]*content=")[^"]*(")/i,         `$1${d}$2`)
    .replace(/(rel="canonical"[^>]*href=")[^"]*(")/i,               `$1${u}$2`)
    .replace(/(property="og:type"[^>]*content=")[^"]*(")/i,         `$1article$2`)
    .replace(/(property="og:title"[^>]*content=")[^"]*(")/i,        `$1${t}$2`)
    .replace(/(property="og:description"[^>]*content=")[^"]*(")/i,  `$1${d}$2`)
    .replace(/(property="og:image"[^>]*content=")[^"]*(")/i,        `$1${im}$2`)
    .replace(/(property="og:url"[^>]*content=")[^"]*(")/i,          `$1${u}$2`)
    .replace(/(name="twitter:title"[^>]*content=")[^"]*(")/i,       `$1${t}$2`)
    .replace(/(name="twitter:description"[^>]*content=")[^"]*(")/i, `$1${d}$2`)
    .replace(/(name="twitter:image"[^>]*content=")[^"]*(")/i,       `$1${im}$2`);
}

// ── Static file serving in production ─────────────────────────────────────────
if (isProd) {
  const websiteDir = path.resolve(__dirname, "../../advantix-website/dist/public");
  const adminDir   = path.resolve(__dirname, "../../advantix-admin/dist/public");
  const aiDir      = path.resolve(__dirname, "../../advantix-ai/dist/public");

  // Admin dashboard at /admin/
  if (fs.existsSync(adminDir)) {
    app.use("/admin", express.static(adminDir, { index: false }));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => {
      res.sendFile(path.join(adminDir, "index.html"));
    });
  }

  // AI tool at /ai/
  if (fs.existsSync(aiDir)) {
    app.use("/ai", express.static(aiDir, { index: false }));
    app.get(/^\/ai(\/.*)?$/, (_req, res) => {
      res.sendFile(path.join(aiDir, "index.html"));
    });
  }

  // Public website at /  (catch-all last)
  if (fs.existsSync(websiteDir)) {
    app.use(express.static(websiteDir, { index: false }));

    // ── Blog post OG injection — must come BEFORE the generic catch-all ────────
    // Facebook / LinkedIn / Telegram crawlers don't run JS, so React Helmet
    // never fires for them.  We read the post from DB and rewrite the OG meta
    // tags in the raw index.html before sending it so crawlers see real data.
    app.get("/blog/:slug", async (req, res, next) => {
      try {
        const { slug } = req.params;
        const result = await db.execute(sql`
          SELECT title, excerpt, cover_image_url, seo_title, seo_description
          FROM blog_posts
          WHERE slug = ${slug} AND status = 'published'
          LIMIT 1
        `);
        const row = result.rows[0] as {
          title: string;
          excerpt: string | null;
          cover_image_url: string | null;
          seo_title: string | null;
          seo_description: string | null;
        } | undefined;

        if (!row) { next(); return; }

        const SITE_ORIGIN = process.env.SITE_URL ?? "https://advantix.digital";
        const postTitle   = row.seo_title ?? row.title;
        const postDesc    = row.seo_description ?? row.excerpt ?? `Read "${row.title}" on the Advantix Digital blog.`;
        const rawCover    = row.cover_image_url ?? "";
        // Make sure og:image is always an absolute URL — uploaded files are stored as /api/uploads/...
        const postImage   = rawCover
          ? rawCover.startsWith("http") ? rawCover : `${SITE_ORIGIN}${rawCover.startsWith("/") ? "" : "/"}${rawCover}`
          : `${SITE_ORIGIN}/images/og-image.png`;
        const postUrl     = `${SITE_ORIGIN}/blog/${slug}`;
        const fullTitle   = `${postTitle} | Advantix Digital`;

        const template = fs.readFileSync(path.join(websiteDir, "index.html"), "utf-8");
        const injected  = injectBlogOg(template, {
          title:       fullTitle,
          description: postDesc,
          image:       postImage,
          url:         postUrl,
        });

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300"); // 5-min cache for bots
        res.send(injected);
      } catch (err) {
        logger.error({ err }, "Blog OG injection failed");
        next();
      }
    });

    // Express 5 requires named wildcard params — "/*path" instead of "*"
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/s/")) {
        next();
        return;
      }
      res.sendFile(path.join(websiteDir, "index.html"));
    });
  }
}

// ── Global error handler ────────────────────────────────────────────────────────
// Must be declared with 4 arguments so Express recognizes it as an error handler.
// In production: never expose stack traces or internal error details to the client.
// In development: include the message to aid debugging.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode
    ?? 500;

  logger.error({ err, method: req.method, url: req.url }, "Unhandled error");

  if (res.headersSent) return;

  res.status(status).json({
    error: isProd ? "An unexpected error occurred." : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

export default app;
