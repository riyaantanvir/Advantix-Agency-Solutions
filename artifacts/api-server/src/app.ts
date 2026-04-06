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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
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
    store: new PgSession({ conString: process.env.DATABASE_URL }),
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

// ── Uploaded blog images (must be before API prefix) ─────────────────────────
const uploadsDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ── URL shortener (must be before API prefix) ─────────────────────────────────
app.use(redirectRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

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
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/s/")) {
        next();
        return;
      }
      res.sendFile(path.join(websiteDir, "index.html"));
    });
  }
}

export default app;
