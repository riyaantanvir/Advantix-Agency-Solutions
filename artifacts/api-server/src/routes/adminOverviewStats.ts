import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

/* GET /api/admin/overview-stats */
router.get("/admin/overview-stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    /* ── Scalar counts ────────────────────────────────────────── */
    const counts = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM tool_users)                                                     AS total_users,
        (SELECT COUNT(*)::int FROM admins)                                                         AS total_admins,
        (SELECT COUNT(*)::int
           FROM tool_users u
           WHERE EXISTS (
             SELECT 1 FROM ai_usage_logs  WHERE user_id = u.id AND created_at  > NOW() - INTERVAL '30 days'
             UNION ALL
             SELECT 1 FROM recording_sessions WHERE user_id = u.id AND created_at > NOW() - INTERVAL '30 days'
             UNION ALL
             SELECT 1 FROM url_clicks c
               JOIN short_urls s ON s.id = c.url_id
               WHERE s.user_id = u.id AND c.created_at > NOW() - INTERVAL '30 days'
           )
        )                                                                                          AS active_users_30d,
        ((SELECT COUNT(*)::int FROM ai_usage_logs) + (SELECT COUNT(*)::int FROM agent_usage))      AS total_ai_requests,
        (SELECT COUNT(*)::int FROM conversations WHERE has_unread_admin = true)                    AS pending_chat_requests,
        (SELECT COUNT(*)::int FROM tasks WHERE status NOT IN ('done','completed','cancelled','closed')) AS pending_tasks,
        (SELECT COUNT(*)::int FROM bug_reports WHERE status NOT IN ('resolved','closed'))          AS pending_bugs,
        (SELECT COUNT(*)::int FROM inbox_messages WHERE is_read = false AND direction = 'inbound') AS unread_inbox,
        (SELECT COUNT(*)::int FROM integrations WHERE value IS NOT NULL AND value != '')           AS active_integrations,
        (SELECT COUNT(*)::int FROM integrations)                                                   AS total_integrations,
        (SELECT COUNT(*)::int FROM email_events
           WHERE event_type = 'sent' AND occurred_at >= CURRENT_DATE)                             AS emails_sent_today,
        (SELECT COUNT(*)::int FROM email_events
           WHERE event_type IN ('opened','click') AND occurred_at >= CURRENT_DATE)                AS email_engagements_today
    `);

    const c = (counts.rows[0] ?? {}) as Record<string, number>;

    /* ── Recent activity feed ─────────────────────────────────── */
    const activity = await db.execute(sql`
      SELECT * FROM (
        SELECT 'lead'        AS type, 'New Lead'         AS action, name AS title,
               NULL::text    AS sub, created_at          AS ts FROM leads
        UNION ALL
        SELECT 'contact'     AS type, 'New Contact'      AS action, name AS title,
               subject       AS sub, created_at          AS ts FROM contacts
        UNION ALL
        SELECT 'user'        AS type, 'User Registered'  AS action, name AS title,
               email         AS sub, created_at          AS ts FROM tool_users
        UNION ALL
        SELECT 'task'        AS type, 'Task Created'     AS action, title AS title,
               status        AS sub, created_at          AS ts FROM tasks
        UNION ALL
        SELECT 'bug'         AS type, 'Bug Report'       AS action, title AS title,
               status        AS sub, created_at          AS ts FROM bug_reports
        UNION ALL
        SELECT 'chat'        AS type, 'Chat Started'     AS action, title AS title,
               visitor_email AS sub, created_at          AS ts FROM conversations
        UNION ALL
        SELECT 'email'       AS type, 'Email Sent'       AS action, subject AS title,
               NULL::text    AS sub, created_at          AS ts FROM inbox_messages WHERE direction = 'outbound'
      ) AS combined
      ORDER BY ts DESC
      LIMIT 20
    `);

    res.json({
      totalUsers:            c.total_users            ?? 0,
      totalAdmins:           c.total_admins           ?? 0,
      activeUsers30d:        c.active_users_30d       ?? 0,
      totalAiRequests:       c.total_ai_requests      ?? 0,
      pendingChatRequests:   c.pending_chat_requests  ?? 0,
      pendingTasks:          c.pending_tasks          ?? 0,
      pendingBugs:           c.pending_bugs           ?? 0,
      unreadInbox:           c.unread_inbox           ?? 0,
      activeIntegrations:    c.active_integrations    ?? 0,
      totalIntegrations:     c.total_integrations     ?? 0,
      emailsSentToday:       c.emails_sent_today      ?? 0,
      emailEngagementsToday: c.email_engagements_today ?? 0,
      recentActivity: (activity.rows as any[]).map(r => ({
        type:   r.type,
        action: r.action,
        title:  r.title,
        sub:    r.sub,
        ts:     r.ts,
      })),
    });
  } catch (err) {
    console.error("[overview-stats]", err);
    res.status(500).json({ error: "Failed to load overview stats" });
  }
});

export default router;
