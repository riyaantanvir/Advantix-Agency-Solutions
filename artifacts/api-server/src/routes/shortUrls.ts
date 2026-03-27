import { Router } from "express";
import { createRequire } from "module";
import { db, shortUrlsTable, urlClicksTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const geoip = require("geoip-lite") as {
  lookup: (ip: string) => { country: string; city: string; ll: [number, number]; region: string } | null;
};

const router = Router();

function generateCode(len = 7): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    const [existing] = await db
      .select({ id: shortUrlsTable.id })
      .from(shortUrlsTable)
      .where(eq(shortUrlsTable.shortCode, code))
      .limit(1);
    if (!existing) return code;
  }
  return generateCode(9);
}

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

/* GET /api/tools/urls/resolve/:code */
router.get("/tools/urls/resolve/:code", async (req, res) => {
  const code = String(req.params.code);
  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url) {
    res.status(404).json({ error: "Short URL not found" });
    return;
  }

  // Increment clicks
  await db.update(shortUrlsTable).set({ clicks: url.clicks + 1 }).where(eq(shortUrlsTable.id, url.id));

  // Record detailed click (fire-and-forget)
  const ip = getIp(req);
  const geo = ip === "127.0.0.1" || ip === "::1" ? null : geoip.lookup(ip);
  const referrer = parseReferrer(req.headers.referer);
  const device = getDevice(req.headers["user-agent"] ?? "");

  const countryNames: Record<string, string> = {
    BD: "Bangladesh", US: "United States", GB: "United Kingdom", IN: "India",
    PK: "Pakistan", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
    SG: "Singapore", AE: "UAE", SA: "Saudi Arabia", MY: "Malaysia", ID: "Indonesia",
    NG: "Nigeria", PH: "Philippines", BR: "Brazil", MX: "Mexico", TR: "Turkey",
    EG: "Egypt", NL: "Netherlands", IT: "Italy", ES: "Spain", JP: "Japan",
    KR: "South Korea", RU: "Russia", ZA: "South Africa", TH: "Thailand", VN: "Vietnam",
  };

  db.insert(urlClicksTable).values({
    urlId: url.id,
    countryCode: geo?.country ?? "XX",
    country: geo?.country ? (countryNames[geo.country] ?? geo.country) : "Unknown",
    city: geo?.city ?? null,
    referrer,
    device,
  }).catch(() => { /* non-critical */ });

  res.json({ url: url.originalUrl, title: url.title });
});

/* GET /api/tools/urls — list user's URLs */
router.get("/tools/urls", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const urls = await db.select().from(shortUrlsTable).where(eq(shortUrlsTable.userId, session.toolUserId!)).orderBy(desc(shortUrlsTable.createdAt));
  res.json(urls);
});

/* GET /api/tools/urls/:id/analytics */
router.get("/tools/urls/:id/analytics", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const id = parseInt(String(req.params.id));

  const [url] = await db.select().from(shortUrlsTable).where(and(eq(shortUrlsTable.id, id), eq(shortUrlsTable.userId, session.toolUserId!))).limit(1);
  if (!url) { res.status(404).json({ error: "Not found" }); return; }

  // Clicks by day (last 30 days)
  const byDay = await db.execute(sql`
    SELECT
      to_char(created_at, 'YYYY-MM-DD') AS day,
      COUNT(*) AS clicks
    FROM url_clicks
    WHERE url_id = ${id}
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY day
    ORDER BY day
  `);

  // Clicks by country (top 10)
  const byCountry = await db.execute(sql`
    SELECT country, country_code, COUNT(*) AS clicks
    FROM url_clicks
    WHERE url_id = ${id} AND country IS NOT NULL
    GROUP BY country, country_code
    ORDER BY clicks DESC
    LIMIT 10
  `);

  // Clicks by referrer
  const byReferrer = await db.execute(sql`
    SELECT referrer, COUNT(*) AS clicks
    FROM url_clicks
    WHERE url_id = ${id}
    GROUP BY referrer
    ORDER BY clicks DESC
    LIMIT 10
  `);

  // Clicks by device
  const byDevice = await db.execute(sql`
    SELECT device, COUNT(*) AS clicks
    FROM url_clicks
    WHERE url_id = ${id}
    GROUP BY device
    ORDER BY clicks DESC
  `);

  res.json({
    totalClicks: url.clicks,
    byDay: byDay.rows,
    byCountry: byCountry.rows,
    byReferrer: byReferrer.rows,
    byDevice: byDevice.rows,
  });
});

/* POST /api/tools/urls — create short URL */
router.post("/tools/urls", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const { originalUrl, title, customSlug } = req.body as { originalUrl?: string; title?: string; customSlug?: string };

  if (!originalUrl) { res.status(400).json({ error: "originalUrl is required" }); return; }

  let normalized = originalUrl.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "https://" + normalized;
  try { new URL(normalized); } catch { res.status(400).json({ error: "Invalid URL" }); return; }

  let shortCode: string;

  if (customSlug?.trim()) {
    const slug = customSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 50);
    if (slug.length < 2) { res.status(400).json({ error: "Custom alias must be at least 2 characters" }); return; }
    const [existing] = await db.select({ id: shortUrlsTable.id }).from(shortUrlsTable).where(eq(shortUrlsTable.shortCode, slug)).limit(1);
    if (existing) { res.status(409).json({ error: "That custom alias is already taken. Try another." }); return; }
    shortCode = slug;
  } else {
    shortCode = await uniqueCode();
  }

  const [url] = await db.insert(shortUrlsTable).values({
    shortCode,
    originalUrl: normalized,
    title: title?.trim() || null,
    userId: session.toolUserId!,
  }).returning();

  res.json(url);
});

/* PATCH /api/tools/urls/:id */
router.patch("/tools/urls/:id", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const id = parseInt(String(req.params.id));
  const { title } = req.body as { title?: string };
  await db.update(shortUrlsTable).set({ title: title?.trim() || null }).where(and(eq(shortUrlsTable.id, id), eq(shortUrlsTable.userId, session.toolUserId!)));
  res.json({ ok: true });
});

/* DELETE /api/tools/urls/:id */
router.delete("/tools/urls/:id", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const id = parseInt(String(req.params.id));
  await db.delete(shortUrlsTable).where(and(eq(shortUrlsTable.id, id), eq(shortUrlsTable.userId, session.toolUserId!)));
  res.json({ ok: true });
});

export default router;
