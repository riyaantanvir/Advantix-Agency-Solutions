import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../lib/cache.js";

const REPORT_TTL = 5 * 60 * 1000; // 5 minutes

const router = Router();

/* ── Weekly Report ─────────────────────────────────────────────────────────── */
router.get("/marketing/weekly-report", requireAdmin, async (req, res) => {
  const cacheKey = "marketing:weekly";
  const cached = cacheGet(cacheKey);
  if (cached) { res.json(cached); return; }

  const [
    trafficThisWeek, trafficLastWeek,
    leadsThisWeek, leadsLastWeek,
    contactsThisWeek, contactsLastWeek,
    clicksThisWeek, clicksLastWeek,
    dailyTraffic, dailyLeads,
    topPages, topSources,
    avgEngagement,
  ] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS pageviews
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS pageviews
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
        AND created_at <  DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(*) AS leads FROM leads
        WHERE created_at >= DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(*) AS leads FROM leads
        WHERE created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
          AND created_at <  DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(*) AS contacts FROM contacts
        WHERE created_at >= DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(*) AS contacts FROM contacts
        WHERE created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
          AND created_at <  DATE_TRUNC('week', NOW())
    `),
    db.execute(sql`
      SELECT COUNT(*) AS clicks FROM url_clicks
        WHERE created_at >= DATE_TRUNC('week', NOW())
          AND (is_bot IS NULL OR is_bot = false)
    `),
    db.execute(sql`
      SELECT COUNT(*) AS clicks FROM url_clicks
        WHERE created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
          AND created_at <  DATE_TRUNC('week', NOW())
          AND (is_bot IS NULL OR is_bot = false)
    `),
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'Dy') AS day,
             EXTRACT(DOW FROM created_at)::int AS dow,
             TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
             COUNT(DISTINCT session_id) AS sessions,
             COUNT(*) AS pageviews
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= DATE_TRUNC('week', NOW())
      GROUP BY day, dow, date ORDER BY dow
    `),
    db.execute(sql`
      SELECT TO_CHAR(created_at, 'Dy') AS day,
             EXTRACT(DOW FROM created_at)::int AS dow,
             COUNT(*) AS leads
      FROM leads WHERE created_at >= DATE_TRUNC('week', NOW())
      GROUP BY day, dow ORDER BY dow
    `),
    db.execute(sql`
      SELECT page_path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= DATE_TRUNC('week', NOW())
      GROUP BY page_path ORDER BY views DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT COALESCE(referrer, 'Direct') AS source, COUNT(DISTINCT session_id) AS sessions
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= DATE_TRUNC('week', NOW())
      GROUP BY source ORDER BY sessions DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT
        ROUND(AVG(CASE WHEN event_type = 'exit' THEN time_on_page END)) AS avg_time,
        ROUND(AVG(CASE WHEN event_type = 'exit' THEN scroll_depth END)) AS avg_scroll
      FROM page_events WHERE created_at >= DATE_TRUNC('week', NOW())
    `),
  ]);

  const tw = trafficThisWeek.rows[0] as any;
  const lw = trafficLastWeek.rows[0] as any;

  const pct = (now: number, prev: number) =>
    prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100);

  const thisTraffic    = parseInt(tw?.sessions   ?? "0");
  const lastTraffic    = parseInt(lw?.sessions   ?? "0");
  const thisLeads      = parseInt((leadsThisWeek.rows[0] as any)?.leads     ?? "0");
  const lastLeads      = parseInt((leadsLastWeek.rows[0] as any)?.leads     ?? "0");
  const thisContacts   = parseInt((contactsThisWeek.rows[0] as any)?.contacts ?? "0");
  const lastContacts   = parseInt((contactsLastWeek.rows[0] as any)?.contacts ?? "0");
  const thisClicks     = parseInt((clicksThisWeek.rows[0] as any)?.clicks   ?? "0");
  const lastClicks     = parseInt((clicksLastWeek.rows[0] as any)?.clicks   ?? "0");

  const weeklyPayload = {
    kpis: {
      sessions:  { current: thisTraffic, previous: lastTraffic, change: pct(thisTraffic, lastTraffic) },
      pageviews: { current: parseInt(tw?.pageviews ?? "0"), previous: parseInt(lw?.pageviews ?? "0"), change: pct(parseInt(tw?.pageviews ?? "0"), parseInt(lw?.pageviews ?? "0")) },
      leads:     { current: thisLeads, previous: lastLeads, change: pct(thisLeads, lastLeads) },
      contacts:  { current: thisContacts, previous: lastContacts, change: pct(thisContacts, lastContacts) },
      urlClicks: { current: thisClicks, previous: lastClicks, change: pct(thisClicks, lastClicks) },
      avgTime:   Math.round(parseFloat(String((avgEngagement.rows[0] as any)?.avg_time ?? "0"))),
      avgScroll: Math.round(parseFloat(String((avgEngagement.rows[0] as any)?.avg_scroll ?? "0"))),
    },
    dailyTraffic: dailyTraffic.rows,
    dailyLeads: dailyLeads.rows,
    topPages: topPages.rows,
    topSources: topSources.rows,
  };
  cacheSet(cacheKey, weeklyPayload, REPORT_TTL);
  res.json(weeklyPayload);
});

/* ── Conversion Funnel ─────────────────────────────────────────────────────── */
router.get("/marketing/funnel", requireAdmin, async (req, res) => {
  const days = parseInt(String(req.query.days ?? "30"));
  const funnelKey = `marketing:funnel:${days}`;
  const cachedFunnel = cacheGet(funnelKey);
  if (cachedFunnel) { res.json(cachedFunnel); return; }
  const interval = `${days} days`;

  const [visitors, engaged, leads, contacts, byChannel, dailyFunnel] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(DISTINCT session_id) AS count
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= NOW() - INTERVAL ${interval}
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT session_id) AS count
      FROM page_events
      WHERE created_at >= NOW() - INTERVAL ${interval}
        AND event_type IN ('exit', 'scroll')
        AND (time_on_page > 30 OR scroll_depth > 50)
    `),
    db.execute(sql`
      SELECT COUNT(*) AS count FROM leads
        WHERE created_at >= NOW() - INTERVAL ${interval}
    `),
    db.execute(sql`
      SELECT COUNT(*) AS count FROM contacts
        WHERE created_at >= NOW() - INTERVAL ${interval}
    `),
    db.execute(sql`
      SELECT
        COALESCE(referrer, 'Direct') AS channel,
        COUNT(DISTINCT session_id) AS visitors,
        0 AS leads
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= NOW() - INTERVAL ${interval}
      GROUP BY channel ORDER BY visitors DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT session_id) AS visitors
      FROM page_events WHERE event_type = 'pageview'
        AND created_at >= NOW() - INTERVAL ${interval}
      GROUP BY day ORDER BY day
    `),
  ]);

  const v = parseInt((visitors.rows[0] as any)?.count ?? "0");
  const e = parseInt((engaged.rows[0] as any)?.count ?? "0");
  const l = parseInt((leads.rows[0] as any)?.count ?? "0");
  const c = parseInt((contacts.rows[0] as any)?.count ?? "0");

  const funnelRate = (a: number, b: number) =>
    b === 0 ? 0 : parseFloat(((a / b) * 100).toFixed(1));

  const funnelPayload = {
    funnel: [
      { stage: "Visitors", count: v, color: "bg-blue-500", icon: "👥" },
      { stage: "Engaged", count: e, color: "bg-violet-500", icon: "🔥", rate: funnelRate(e, v) },
      { stage: "Leads", count: l, color: "bg-amber-500", icon: "🎯", rate: funnelRate(l, v) },
      { stage: "Contacts", count: c, color: "bg-green-500", icon: "📬", rate: funnelRate(c, v) },
    ],
    conversionRates: {
      visitorToEngaged: funnelRate(e, v),
      visitorToLead:    funnelRate(l, v),
      leadToContact:    funnelRate(c, l),
      overallRate:      funnelRate(c, v),
    },
    byChannel: byChannel.rows,
    dailyFunnel: dailyFunnel.rows,
  };
  cacheSet(funnelKey, funnelPayload, REPORT_TTL);
  res.json(funnelPayload);
});

/* ── Campaigns (ROI Tracker) ───────────────────────────────────────────────── */
router.get("/marketing/campaigns", requireAdmin, async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, name, channel, spend, revenue,
           CASE WHEN spend > 0 THEN ROUND(((revenue - spend) / spend) * 100, 1) ELSE NULL END AS roi,
           start_date, end_date, status, notes, created_at
    FROM marketing_campaigns
    ORDER BY created_at DESC
  `);
  res.json(result.rows);
});

router.post("/marketing/campaigns", requireAdmin, async (req, res) => {
  const { name, channel, spend, revenue, startDate, endDate, status, notes } = req.body as {
    name: string; channel: string; spend: number; revenue: number;
    startDate: string; endDate?: string; status?: string; notes?: string;
  };

  if (!name?.trim() || !channel?.trim() || !startDate) {
    res.status(400).json({ error: "name, channel, startDate required" }); return;
  }

  const result = await db.execute(sql`
    INSERT INTO marketing_campaigns (name, channel, spend, revenue, start_date, end_date, status, notes)
    VALUES (${name.trim()}, ${channel.trim()}, ${spend ?? 0}, ${revenue ?? 0},
            ${startDate}::date, ${endDate ? sql`${endDate}::date` : sql`NULL`},
            ${status ?? "active"}, ${notes?.trim() ?? null})
    RETURNING *
  `);
  res.json(result.rows[0]);
});

router.patch("/marketing/campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { name, channel, spend, revenue, startDate, endDate, status, notes } = req.body as {
    name?: string; channel?: string; spend?: number; revenue?: number;
    startDate?: string; endDate?: string; status?: string; notes?: string;
  };

  await db.execute(sql`
    UPDATE marketing_campaigns SET
      name        = COALESCE(${name?.trim() ?? null}, name),
      channel     = COALESCE(${channel?.trim() ?? null}, channel),
      spend       = COALESCE(${spend ?? null}, spend),
      revenue     = COALESCE(${revenue ?? null}, revenue),
      start_date  = COALESCE(${startDate ? sql`${startDate}::date` : sql`NULL`}, start_date),
      end_date    = ${endDate ? sql`${endDate}::date` : sql`NULL`},
      status      = COALESCE(${status ?? null}, status),
      notes       = ${notes?.trim() ?? null}
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

router.delete("/marketing/campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  await db.execute(sql`DELETE FROM marketing_campaigns WHERE id = ${id}`);
  res.json({ ok: true });
});

export default router;
