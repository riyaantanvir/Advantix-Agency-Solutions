import { Router } from "express";
import { createRequire } from "module";
import { db, shortUrlsTable, urlClicksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const geoip = require("geoip-lite") as {
  lookup: (ip: string) => { country: string; city: string; ll: [number, number]; region: string } | null;
};

const router = Router();

const countryNames: Record<string, string> = {
  BD: "Bangladesh", US: "United States", GB: "United Kingdom", IN: "India",
  PK: "Pakistan", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
  SG: "Singapore", AE: "UAE", SA: "Saudi Arabia", MY: "Malaysia", ID: "Indonesia",
  NG: "Nigeria", PH: "Philippines", BR: "Brazil", MX: "Mexico", TR: "Turkey",
  EG: "Egypt", NL: "Netherlands", IT: "Italy", ES: "Spain", JP: "Japan",
  KR: "South Korea", RU: "Russia", ZA: "South Africa", TH: "Thailand", VN: "Vietnam",
};

function getIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "127.0.0.1";
}

function getDevice(ua: string): string {
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) return "Mobile";
  if (/tablet/i.test(ua)) return "Tablet";
  return "Desktop";
}

function parseReferrer(ref: string | undefined): string {
  if (!ref) return "Direct";
  try {
    const hostname = new URL(ref).hostname.replace(/^www\./, "");
    if (hostname.includes("google")) return "Google";
    if (hostname.includes("facebook") || hostname.includes("fb.com")) return "Facebook";
    if (hostname.includes("twitter") || hostname.includes("t.co")) return "Twitter / X";
    if (hostname.includes("instagram")) return "Instagram";
    if (hostname.includes("linkedin")) return "LinkedIn";
    if (hostname.includes("youtube")) return "YouTube";
    if (hostname.includes("tiktok")) return "TikTok";
    if (hostname.includes("reddit")) return "Reddit";
    if (hostname.includes("whatsapp")) return "WhatsApp";
    if (hostname.includes("t.me") || hostname.includes("telegram")) return "Telegram";
    return hostname;
  } catch {
    return "Other";
  }
}

/**
 * GET /s/:code
 * Server-side 302 redirect — no React SPA, no JS needed.
 * Responds instantly and records analytics in the background.
 */
router.get("/s/:code", async (req, res) => {
  const code = String(req.params.code);

  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url) {
    res.status(404).send(`
      <html><head><title>Link Not Found</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Link Not Found</h2>
        <p>This short link doesn't exist or has been deleted.</p>
        <a href="/">Go to Advantix</a>
      </body></html>
    `);
    return;
  }

  // Fire-and-forget: increment click + record analytics
  db.update(shortUrlsTable)
    .set({ clicks: url.clicks + 1 })
    .where(eq(shortUrlsTable.id, url.id))
    .catch(() => {});

  const ip = getIp(req);
  const geo = ip === "127.0.0.1" || ip === "::1" ? null : geoip.lookup(ip);

  db.insert(urlClicksTable).values({
    urlId: url.id,
    countryCode: geo?.country ?? "XX",
    country: geo?.country ? (countryNames[geo.country] ?? geo.country) : "Unknown",
    city: geo?.city ?? null,
    referrer: parseReferrer(req.headers.referer),
    device: getDevice(req.headers["user-agent"] ?? ""),
  }).catch(() => {});

  // Instant 302 — browser redirects before any JS loads
  res.redirect(302, url.originalUrl);
});

export default router;
