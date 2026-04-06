import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

/* ── Email Subscribers ──────────────────────────────────── */

/* POST /api/subscribe — public email capture */
router.post("/subscribe", async (req, res) => {
  const { email, name, source } = req.body as {
    email?: string; name?: string; source?: string;
  };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email required" }); return;
  }
  try {
    await db.execute(sql`
      INSERT INTO email_subscribers (email, name, source)
      VALUES (${email.toLowerCase().trim()}, ${name?.trim() ?? null}, ${source ?? "website"})
      ON CONFLICT (email) DO UPDATE SET active = true
    `);
    res.json({ ok: true, message: "Subscribed successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("conflict")) {
      res.json({ ok: true, message: "You're already subscribed!" });
    } else {
      res.status(500).json({ error: "Subscription failed. Please try again." });
    }
  }
});

/* GET /api/admin/subscribers */
router.get("/admin/subscribers", requireAdmin, async (req, res) => {
  const active = req.query.active;
  const where = active === "false" ? sql`WHERE active = false` : active === "all" ? sql`` : sql`WHERE active = true`;
  const r = await db.execute(sql`
    SELECT id, email, name, source, tags, active, subscribed_at
    FROM email_subscribers
    ${where}
    ORDER BY subscribed_at DESC
  `);
  res.json(r.rows);
});

/* DELETE /api/admin/subscribers/:id — unsubscribe */
router.delete("/admin/subscribers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.execute(sql`UPDATE email_subscribers SET active = false WHERE id = ${id}`);
  res.json({ ok: true });
});

/* DELETE /api/admin/subscribers/:id/hard — permanently delete */
router.delete("/admin/subscribers/:id/hard", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.execute(sql`DELETE FROM email_subscribers WHERE id = ${id}`);
  res.json({ ok: true });
});

/* ── CTA Bar Settings ────────────────────────────────────── */

const CTA_DEFAULTS = {
  cta_enabled:      "true",
  cta_text:         "Ready to transform your business? Let's build something amazing together.",
  cta_button_text:  "Get Started",
  cta_button_url:   "/contact",
  cta_bg:           "primary",
};

async function getCTASettings() {
  const r = await db.execute(sql`
    SELECT key, value FROM site_settings
    WHERE key IN ('cta_enabled','cta_text','cta_button_text','cta_button_url','cta_bg')
  `);
  const map: Record<string, string> = { ...CTA_DEFAULTS };
  for (const row of r.rows as { key: string; value: string }[]) map[row.key] = row.value;
  return {
    enabled:    map.cta_enabled === "true",
    text:       map.cta_text,
    buttonText: map.cta_button_text,
    buttonUrl:  map.cta_button_url,
    bg:         map.cta_bg,
  };
}

/* GET /api/settings/cta-bar — public */
router.get("/settings/cta-bar", async (_req, res) => {
  res.json(await getCTASettings());
});

/* PUT /api/admin/settings/cta-bar — admin update */
router.put("/admin/settings/cta-bar", requireAdmin, async (req, res) => {
  const { enabled, text, buttonText, buttonUrl, bg } = req.body as {
    enabled?: boolean; text?: string; buttonText?: string; buttonUrl?: string; bg?: string;
  };
  const upsert = async (key: string, value: string) => {
    await db.execute(sql`
      INSERT INTO site_settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
    `);
  };
  if (enabled !== undefined) await upsert("cta_enabled", String(enabled));
  if (text)       await upsert("cta_text",       text);
  if (buttonText) await upsert("cta_button_text", buttonText);
  if (buttonUrl)  await upsert("cta_button_url",  buttonUrl);
  if (bg)         await upsert("cta_bg",          bg);
  res.json(await getCTASettings());
});

export default router;
