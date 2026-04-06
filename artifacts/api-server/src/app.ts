import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import redirectRouter from "./routes/shortRedirect.js";
import { logger } from "./lib/logger.js";
import { pool, db } from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.SESSION_SECRET) {
  // Auto-generate a random secret so the server starts.
  // WARNING: Sessions will be invalidated on every restart.
  // Set SESSION_SECRET env var in production for persistent sessions.
  const { randomBytes } = await import("node:crypto");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  logger.warn("SESSION_SECRET not set — auto-generated a random secret. Sessions will NOT persist across restarts. Set SESSION_SECRET in your environment variables.");
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

app.set("trust proxy", 1);

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

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use(
  session({
    store: new PgSession({ pool }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

        const postTitle   = row.seo_title ?? row.title;
        const postDesc    = row.seo_description ?? row.excerpt ?? `Read "${row.title}" on the Advantix Agency blog.`;
        const postImage   = row.cover_image_url ?? "https://advantix.agency/images/og-image.png";
        const postUrl     = `https://advantix.agency/blog/${slug}`;
        const fullTitle   = `${postTitle} | Advantix Agency`;

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

export default app;
