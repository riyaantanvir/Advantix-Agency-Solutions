import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const isProd = process.env.NODE_ENV === "production";

function jsonHandler(req: Request, res: Response) {
  res.status(429).json({
    error: "Too many requests. Please slow down and try again later.",
    retryAfter: res.getHeader("Retry-After"),
  });
}

// ── Login brute-force limiter ─────────────────────────────────────────────────
// 10 attempts per 15 minutes per IP. In production failures are counted
// separately so a correct login does NOT reset the window.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  handler: jsonHandler,
});

// ── Public form submissions (contact, lead, bug report, contest submit) ───────
// 5 submissions per 30 minutes per IP to stop spam bots.
export const formLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: isProd ? 5 : 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many submissions from this IP. Please wait 30 minutes." },
  handler: jsonHandler,
});

// ── General API rate limiter ───────────────────────────────────────────────────
// 300 requests per 15 minutes per IP. Blocks API scanners and scrapers.
// Enough headroom for legitimate admin dashboard usage.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 300 : 2000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "API rate limit exceeded. Please slow down." },
  handler: jsonHandler,
  // Skip static file-like requests and health checks
  skip: (req) => req.path === "/health" || req.path === "/healthz",
});

// ── AI / heavy compute limiter ─────────────────────────────────────────────────
// AI endpoints are expensive — 30 requests per 10 minutes per IP.
export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: isProd ? 30 : 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before sending more requests." },
  handler: jsonHandler,
});
