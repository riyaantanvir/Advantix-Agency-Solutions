import { Router } from "express";
import { db, pageEventsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { getIp, getBrowser, getOS, getDevice, parseLanguage, getGeoData } from "../lib/urlClickAnalytics.js";
import { cacheGet, cacheSet } from "../lib/cache.js";

const ANALYTICS_TTL = 5 * 60 * 1000; // 5 minutes

const router = Router();

/* POST /api/analytics/track — public, fire-and-forget */
router.post("/analytics/track", async (req, res) => {
  res.json({ ok: true }); // respond immediately

  const { sessionId, eventType, pagePath, referrer, scrollDepth, timeOnPage, clickX, clickY } =
    req.body as {
      sessionId?: string; eventType?: string; pagePath?: string;
      referrer?: string; scrollDepth?: number; timeOnPage?: number;
      clickX?: number; clickY?: number;
    };

  if (!sessionId || !eventType || !pagePath) return;

  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const geo = getGeoData(ip);
  const language = parseLanguage(req.headers["accept-language"]);

  db.insert(pageEventsTable).values({
    sessionId,
    eventType,
    pagePath,
    referrer: referrer ?? null,
    scrollDepth: scrollDepth ?? null,
    timeOnPage: timeOnPage ?? null,
    clickX: clickX ?? null,
    clickY: clickY ?? null,
    ip,
    country: geo.country,
    city: geo.city,
    browser: getBrowser(ua),
    os: getOS(ua),
    device: getDevice(ua),
    language,
  }).catch(() => {});
});

/* GET /api/analytics/website — admin only */
router.get("/analytics/website", requireAdmin, async (req, res) => {
  const fromParam = req.query.from as string | undefined;
  const toParam   = req.query.to   as string | undefined;
  const rawDays   = parseInt(String(req.query.days ?? "30"));
  // Sanitize days — always a safe integer, never NaN
  const days = isNaN(rawDays) || rawDays <= 0 ? 30 : Math.min(rawDays, 3650);

  // Build WHERE time clause
  // NOTE: Use sql.raw() for the days integer to avoid PostgreSQL type-inference
  // errors with parameterized `$1 * INTERVAL '1 day'` on some server versions.
  let timeFilter: ReturnType<typeof sql>;
  let cacheKey: string;
  if (fromParam && toParam) {
    // Sanitize date strings to prevent injection (must match YYYY-MM-DD)
    const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : "";
    const safeTo   = /^\d{4}-\d{2}-\d{2}$/.test(toParam)   ? toParam   : "";
    if (!safeFrom || !safeTo) { res.status(400).json({ error: "Invalid date range" }); return; }
    timeFilter = sql.raw(`created_at >= '${safeFrom}'::date AND created_at < ('${safeTo}'::date + INTERVAL '1 day')`);
    cacheKey = `analytics:website:${safeFrom}:${safeTo}`;
  } else {
    // Embed sanitized integer directly — safe because days is always parseInt-validated above
    timeFilter = sql.raw(`created_at >= NOW() - INTERVAL '${days} days'`);
    cacheKey = `analytics:website:${days}`;
  }

  const cached = cacheGet(cacheKey);
  if (cached) { res.json(cached); return; }

  const [totalSessions, totalPageViews, bounceStats, avgTime] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(DISTINCT session_id) AS sessions
      FROM page_events
      WHERE event_type = 'pageview' AND ${timeFilter}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS pageviews
      FROM page_events
      WHERE event_type = 'pageview' AND ${timeFilter}
    `),
    db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE pv_count = 1) AS bounced,
             COUNT(*) AS total_sessions
      FROM (
        SELECT session_id, COUNT(*) AS pv_count
        FROM page_events
        WHERE event_type = 'pageview' AND ${timeFilter}
        GROUP BY session_id
      ) s
    `),
    db.execute(sql`
      SELECT ROUND(AVG(time_on_page)) AS avg_time_on_page
      FROM page_events
      WHERE event_type = 'exit' AND time_on_page IS NOT NULL AND ${timeFilter}
    `),
  ]);

  const [byDay, byPage, byCountry, byReferrer, byBrowser, byOS, byDevice,
         byHour, byDayOfWeek, byLanguage, scrollByPage, userJourney, recentSessions] = await Promise.all([
    db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS pageviews,
             COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY day ORDER BY day
    `),
    db.execute(sql`
      SELECT page_path, COUNT(*) AS views,
             COUNT(DISTINCT session_id) AS sessions,
             ROUND(AVG(CASE WHEN e.event_type = 'exit' THEN e.time_on_page END)) AS avg_time
      FROM page_events e
      WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY page_path ORDER BY views DESC LIMIT 15
    `),
    db.execute(sql`
      SELECT COALESCE(country, 'Unknown') AS country, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY country ORDER BY sessions DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT
        CASE
          WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
          ELSE referrer
        END AS referrer,
        COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY
        CASE
          WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
          ELSE referrer
        END
      ORDER BY sessions DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COALESCE(browser, 'Unknown') AS browser, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY browser ORDER BY sessions DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT COALESCE(os, 'Unknown') AS os, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY os ORDER BY sessions DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT COALESCE(device, 'Unknown') AS device, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY device ORDER BY sessions DESC
    `),
    db.execute(sql`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS pageviews
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY hour ORDER BY hour
    `),
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'Dy') AS day_name,
             EXTRACT(DOW FROM created_at)::int AS dow,
             COUNT(*) AS pageviews
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY day_name, dow ORDER BY dow
    `),
    db.execute(sql`
      SELECT COALESCE(language, 'Unknown') AS language, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY language ORDER BY sessions DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT page_path,
             ROUND(AVG(scroll_depth)) AS avg_scroll,
             COUNT(*) AS readings
      FROM page_events
      WHERE event_type = 'scroll' AND scroll_depth IS NOT NULL AND ${timeFilter}
      GROUP BY page_path ORDER BY readings DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT session_id,
             ARRAY_AGG(page_path ORDER BY created_at) AS journey,
             COUNT(*) AS pages_visited,
             MIN(created_at) AS started_at
      FROM page_events WHERE event_type = 'pageview' AND ${timeFilter}
      GROUP BY session_id
      ORDER BY started_at DESC LIMIT 20
    `),
    db.execute(sql`
      SELECT session_id, country, city, browser, os, device, language,
             COUNT(*) FILTER (WHERE event_type = 'pageview') AS page_views,
             MAX(created_at) AS last_seen
      FROM page_events
      WHERE ${timeFilter}
      GROUP BY session_id, country, city, browser, os, device, language
      ORDER BY last_seen DESC LIMIT 20
    `),
  ]);

  const bounceRow = bounceStats.rows[0] as { bounced: string; total_sessions: string } | undefined;
  const bounceRate = bounceRow && parseInt(bounceRow.total_sessions) > 0
    ? Math.round((parseInt(bounceRow.bounced) / parseInt(bounceRow.total_sessions)) * 100)
    : 0;

  const payload = {
    summary: {
      sessions: parseInt(String((totalSessions.rows[0] as any)?.sessions ?? "0")),
      pageviews: parseInt(String((totalPageViews.rows[0] as any)?.pageviews ?? "0")),
      bounceRate,
      avgTimeOnPage: Math.round(parseFloat(String((avgTime.rows[0] as any)?.avg_time_on_page ?? "0"))),
    },
    byDay: byDay.rows,
    byPage: byPage.rows,
    byCountry: byCountry.rows,
    byReferrer: byReferrer.rows,
    byBrowser: byBrowser.rows,
    byOS: byOS.rows,
    byDevice: byDevice.rows,
    byHour: byHour.rows,
    byDayOfWeek: byDayOfWeek.rows,
    byLanguage: byLanguage.rows,
    scrollByPage: scrollByPage.rows,
    userJourney: userJourney.rows,
    recentSessions: recentSessions.rows,
  };
  cacheSet(cacheKey, payload, ANALYTICS_TTL);
  res.json(payload);
});

export default router;
