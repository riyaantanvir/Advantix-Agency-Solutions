import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

/* GET /api/admin/tools/stats ─────────────────────────────────────
   Aggregate analytics for the admin Tools Dashboard tab           */
router.get("/admin/tools/stats", requireAdmin, async (_req, res) => {
  try {
    /* ── URL Shortener ────────────────────────────────────────── */
    const [urlRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int                          AS total_links,
        COALESCE(SUM(clicks), 0)::int          AS total_clicks
      FROM short_urls
    `)).rows as { total_links: number; total_clicks: number }[];

    const refRows = (await db.execute(sql`
      SELECT
        COALESCE(referrer, 'Direct') AS source,
        COUNT(*)::int                AS clicks
      FROM url_clicks
      WHERE is_bot IS DISTINCT FROM true
      GROUP BY 1
      ORDER BY clicks DESC
      LIMIT 8
    `)).rows as { source: string; clicks: number }[];

    const deviceRows = (await db.execute(sql`
      SELECT
        COALESCE(device, 'Unknown') AS device,
        COUNT(*)::int               AS clicks
      FROM url_clicks
      WHERE is_bot IS DISTINCT FROM true
      GROUP BY 1
      ORDER BY clicks DESC
    `)).rows as { device: string; clicks: number }[];

    const browserRows = (await db.execute(sql`
      SELECT
        COALESCE(browser, 'Unknown') AS browser,
        COUNT(*)::int                AS clicks
      FROM url_clicks
      WHERE is_bot IS DISTINCT FROM true
      GROUP BY 1
      ORDER BY clicks DESC
      LIMIT 6
    `)).rows as { browser: string; clicks: number }[];

    /* ── Screen Recorder ──────────────────────────────────────── */
    const [recRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int                              AS total_recordings,
        COALESCE(SUM(duration_seconds), 0)::int   AS total_seconds
      FROM recording_sessions
    `)).rows as { total_recordings: number; total_seconds: number }[];

    /* ── PDF Audio ────────────────────────────────────────────── */
    const [pdfRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int                      AS total_books,
        COALESCE(SUM(num_pages), 0)::int   AS total_pages
      FROM tool_pdf_books
    `)).rows as { total_books: number; total_pages: number }[];

    /* ── Advantix AI ──────────────────────────────────────────── */
    const [aiRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int                               AS total_requests,
        COALESCE(SUM(total_tokens), 0)::int         AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)        AS total_cost_usd
      FROM ai_usage_logs
    `)).rows as { total_requests: number; total_tokens: number; total_cost_usd: string }[];

    const aiModelRows = (await db.execute(sql`
      SELECT
        provider,
        model,
        COUNT(*)::int  AS requests,
        SUM(total_tokens)::int AS tokens
      FROM ai_usage_logs
      GROUP BY provider, model
      ORDER BY requests DESC
      LIMIT 6
    `)).rows as { provider: string; model: string; requests: number; tokens: number }[];

    /* ── Total tool users ─────────────────────────────────────── */
    const [userRow] = (await db.execute(sql`
      SELECT COUNT(*)::int AS total_users FROM tool_users
    `)).rows as { total_users: number }[];

    /* ── Top users by short links ─────────────────────────────── */
    const topLinkUsers = (await db.execute(sql`
      SELECT
        u.name,
        u.email,
        COUNT(s.id)::int              AS link_count,
        COALESCE(SUM(s.clicks), 0)::int AS click_count
      FROM tool_users u
      JOIN short_urls s ON s.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY click_count DESC
      LIMIT 5
    `)).rows as { name: string; email: string; link_count: number; click_count: number }[];

    /* ── Top users by recording time ──────────────────────────── */
    const topRecordUsers = (await db.execute(sql`
      SELECT
        u.name,
        u.email,
        COUNT(r.id)::int                        AS rec_count,
        COALESCE(SUM(r.duration_seconds), 0)::int AS total_seconds
      FROM tool_users u
      JOIN recording_sessions r ON r.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY total_seconds DESC
      LIMIT 5
    `)).rows as { name: string; email: string; rec_count: number; total_seconds: number }[];

    /* ── Top users by AI usage ────────────────────────────────── */
    const topAiUsers = (await db.execute(sql`
      SELECT
        u.name,
        u.email,
        COUNT(a.id)::int AS requests,
        COALESCE(SUM(a.total_tokens), 0)::int AS tokens
      FROM tool_users u
      JOIN ai_usage_logs a ON a.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY requests DESC
      LIMIT 5
    `)).rows as { name: string; email: string; requests: number; tokens: number }[];

    return res.json({
      urlShortener: {
        totalLinks:   Number(urlRow?.total_links  ?? 0),
        totalClicks:  Number(urlRow?.total_clicks ?? 0),
        referrers:    refRows.map(r => ({ source: r.source, clicks: Number(r.clicks) })),
        devices:      deviceRows.map(r => ({ device: r.device, clicks: Number(r.clicks) })),
        browsers:     browserRows.map(r => ({ browser: r.browser, clicks: Number(r.clicks) })),
      },
      screenRecorder: {
        totalRecordings: Number(recRow?.total_recordings ?? 0),
        totalSeconds:    Number(recRow?.total_seconds    ?? 0),
      },
      pdfAudio: {
        totalBooks: Number(pdfRow?.total_books  ?? 0),
        totalPages: Number(pdfRow?.total_pages  ?? 0),
      },
      ai: {
        totalRequests: Number(aiRow?.total_requests ?? 0),
        totalTokens:   Number(aiRow?.total_tokens   ?? 0),
        totalCostUsd:  parseFloat(String(aiRow?.total_cost_usd ?? "0")),
        models: aiModelRows.map(r => ({
          provider: r.provider, model: r.model,
          requests: Number(r.requests), tokens: Number(r.tokens),
        })),
      },
      totalUsers: Number(userRow?.total_users ?? 0),
      topLinkUsers,
      topRecordUsers,
      topAiUsers,
    });
  } catch (err) {
    console.error("[admin/tools/stats]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
