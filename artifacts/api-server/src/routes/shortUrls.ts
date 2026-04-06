import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, shortUrlsTable, urlClicksTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import { getIp, getDevice, getBrowser, getOS, parseReferrer, getGeoData, lookupIpData, parseLanguage, isBot } from "../lib/urlClickAnalytics.js";

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

  await db.update(shortUrlsTable).set({ clicks: url.clicks + 1 }).where(eq(shortUrlsTable.id, url.id));

  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const geo = getGeoData(ip);
  const language = parseLanguage(req.headers["accept-language"]);
  const bot = isBot(ua);

  if (!bot) {
    lookupIpData(ip).then((ipData) => {
      db.insert(urlClicksTable).values({
        urlId: url.id,
        countryCode: geo.countryCode,
        country: geo.country,
        city: geo.city,
        region: ipData.region,
        referrer: parseReferrer(req.headers.referer),
        device: getDevice(ua),
        browser: getBrowser(ua),
        os: getOS(ua),
        language,
        ip,
        isp: ipData.isp,
        org: ipData.org,
        timezone: ipData.timezone,
        isBot: false,
        isMobile: ipData.isMobile,
      }).catch(() => {});
    });
  }

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

  const [byDay, byHour, byCountry, byReferrer, byDevice, byBrowser, byOS, byISP,
         byLanguage, byRegion, byOrg, connectionSplit, recentClicks] = await Promise.all([
    db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND created_at >= NOW() - INTERVAL '30 days'
        AND (is_bot IS NULL OR is_bot = false)
      GROUP BY day ORDER BY day
    `),
    db.execute(sql`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY hour ORDER BY hour
    `),
    db.execute(sql`
      SELECT country, country_code, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND country IS NOT NULL
        AND (is_bot IS NULL OR is_bot = false)
      GROUP BY country, country_code ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT referrer, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY referrer ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT device, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY device ORDER BY clicks DESC
    `),
    db.execute(sql`
      SELECT COALESCE(browser, 'Unknown') AS browser, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY browser ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COALESCE(os, 'Unknown') AS os, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY os ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COALESCE(isp, 'Unknown') AS isp, COUNT(*) AS clicks,
             BOOL_OR(is_mobile) AS is_mobile
      FROM url_clicks WHERE url_id = ${id} AND isp IS NOT NULL
        AND (is_bot IS NULL OR is_bot = false)
      GROUP BY isp ORDER BY clicks DESC LIMIT 15
    `),
    db.execute(sql`
      SELECT COALESCE(language, 'Unknown') AS language, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
      GROUP BY language ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COALESCE(region, 'Unknown') AS region, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND region IS NOT NULL
        AND (is_bot IS NULL OR is_bot = false)
      GROUP BY region ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COALESCE(org, 'Unknown') AS org, COUNT(*) AS clicks
      FROM url_clicks WHERE url_id = ${id} AND org IS NOT NULL
        AND (is_bot IS NULL OR is_bot = false)
      GROUP BY org ORDER BY clicks DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_mobile = true)  AS cellular,
        COUNT(*) FILTER (WHERE is_mobile = false OR is_mobile IS NULL) AS wifi_or_broadband
      FROM url_clicks WHERE url_id = ${id} AND (is_bot IS NULL OR is_bot = false)
    `),
    db.execute(sql`
      SELECT ip, country, city, region, browser, os, isp, org, timezone, language,
             is_bot, is_mobile, referrer, device, created_at
      FROM url_clicks WHERE url_id = ${id}
      ORDER BY created_at DESC LIMIT 20
    `),
  ]);

  res.json({
    totalClicks: url.clicks,
    byDay: byDay.rows,
    byHour: byHour.rows,
    byCountry: byCountry.rows,
    byReferrer: byReferrer.rows,
    byDevice: byDevice.rows,
    byBrowser: byBrowser.rows,
    byOS: byOS.rows,
    byISP: byISP.rows,
    byLanguage: byLanguage.rows,
    byRegion: byRegion.rows,
    byOrg: byOrg.rows,
    connectionSplit: connectionSplit.rows[0] ?? { cellular: "0", wifi_or_broadband: "0" },
    recentClicks: recentClicks.rows,
  });
});

/* POST /api/tools/urls — create short URL */
router.post("/tools/urls", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const { originalUrl, title, customSlug, password, clickLimit } = req.body as {
    originalUrl?: string; title?: string; customSlug?: string;
    password?: string; clickLimit?: number;
  };

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

  let passwordHash: string | null = null;
  if (password?.trim()) {
    passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  const limit = clickLimit && clickLimit > 0 ? Math.floor(clickLimit) : null;

  const [newUrl] = await db.insert(shortUrlsTable).values({
    shortCode,
    originalUrl: normalized,
    title: title?.trim() || null,
    userId: session.toolUserId!,
    passwordHash,
    clickLimit: limit,
  }).returning();

  res.json(newUrl);
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
