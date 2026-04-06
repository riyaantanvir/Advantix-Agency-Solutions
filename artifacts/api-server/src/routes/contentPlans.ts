import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

/* GET /api/admin/content-plans */
router.get("/admin/content-plans", requireAdmin, async (req, res) => {
  const { month, platform, status } = req.query as Record<string, string>;

  const conditions: string[] = [];
  if (month) conditions.push(`to_char(scheduled_date::date, 'YYYY-MM') = '${month.replace(/[^0-9-]/g, "")}'`);
  if (platform && platform !== "all") conditions.push(`platform = '${platform.replace(/[^a-z_]/g, "")}'`);
  if (status && status !== "all") conditions.push(`status = '${status.replace(/[^a-z_]/g, "")}'`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const r = await db.execute(sql.raw(`
    SELECT * FROM content_plans ${where} ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST
  `));
  res.json(r.rows);
});

/* POST /api/admin/content-plans */
router.post("/admin/content-plans", requireAdmin, async (req, res) => {
  const { platform, title, description, content, scheduledDate, scheduledTime, status, postUrl, tags, notes } = req.body as {
    platform?: string; title?: string; description?: string; content?: string;
    scheduledDate?: string; scheduledTime?: string; status?: string;
    postUrl?: string; tags?: string; notes?: string;
  };

  if (!platform || !title || !scheduledDate) {
    res.status(400).json({ error: "platform, title, and scheduledDate are required" });
    return;
  }

  const r = await db.execute(sql`
    INSERT INTO content_plans (platform, title, description, content, scheduled_date, scheduled_time, status, post_url, tags, notes)
    VALUES (
      ${platform}, ${title}, ${description ?? null}, ${content ?? null},
      ${scheduledDate}, ${scheduledTime ?? null}, ${status ?? "planned"},
      ${postUrl ?? null}, ${tags ?? null}, ${notes ?? null}
    )
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

/* PATCH /api/admin/content-plans/:id */
router.patch("/admin/content-plans/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { platform, title, description, content, scheduledDate, scheduledTime, status, postUrl, tags, notes } = req.body as {
    platform?: string; title?: string; description?: string; content?: string;
    scheduledDate?: string; scheduledTime?: string; status?: string;
    postUrl?: string; tags?: string; notes?: string;
  };

  const r = await db.execute(sql`
    UPDATE content_plans SET
      platform = COALESCE(${platform ?? null}, platform),
      title = COALESCE(${title ?? null}, title),
      description = ${description !== undefined ? description : sql`description`},
      content = ${content !== undefined ? content : sql`content`},
      scheduled_date = COALESCE(${scheduledDate ?? null}, scheduled_date),
      scheduled_time = ${scheduledTime !== undefined ? scheduledTime : sql`scheduled_time`},
      status = COALESCE(${status ?? null}, status),
      post_url = ${postUrl !== undefined ? postUrl : sql`post_url`},
      tags = ${tags !== undefined ? tags : sql`tags`},
      notes = ${notes !== undefined ? notes : sql`notes`},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `);

  if (!r.rows.length) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r.rows[0]);
});

/* DELETE /api/admin/content-plans/:id */
router.delete("/admin/content-plans/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.execute(sql`DELETE FROM content_plans WHERE id = ${id}`);
  res.json({ ok: true });
});

export default router;
