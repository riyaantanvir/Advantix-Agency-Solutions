import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { sendBulkEmails } from "../services/resendMailer.js";
import { buildBlogNotificationEmail } from "../services/blogEmailTemplate.js";

const router: IRouter = Router();

/* ── Newsletter Settings helpers ─────────────────────────── */
async function getNewsletterEnabled(): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT value FROM site_settings WHERE key = 'newsletter_enabled'
  `);
  const rows = r.rows as { value: string }[];
  if (rows.length === 0) return true;
  return rows[0].value !== "false";
}

/* Helper: get sender address from integrations */
async function getSenderAddress(): Promise<string> {
  const r = await db.execute(sql`
    SELECT value FROM integrations WHERE name = 'EMAIL_FROM_ADDRESS'
  `);
  const rows = r.rows as { value: string }[];
  return rows[0]?.value ?? "Advantix Digital <noreply@advantixdigital.com>";
}

/* Helper: get site base URL */
async function getSiteBaseUrl(): Promise<string> {
  const r = await db.execute(sql`
    SELECT value FROM site_settings WHERE key = 'site_base_url'
  `);
  const rows = r.rows as { value: string }[];
  return rows[0]?.value ?? "https://advantixdigital.com";
}

/* ── Public subscribe (newsletter modal / form) ──────────── */

/* POST /api/subscribe — public email capture */
router.post("/subscribe", async (req, res) => {
  const enabled = await getNewsletterEnabled();
  if (!enabled) {
    res.status(503).json({ error: "Newsletter subscriptions are currently disabled." });
    return;
  }

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

/* ── Admin Subscriber Management ─────────────────────────── */

/* GET /api/admin/subscribers — list with source/active filter */
router.get("/admin/subscribers", requireAdmin, async (req, res) => {
  const active = req.query.active;
  const source = req.query.source as string | undefined;

  // Build WHERE conditions
  const activeClause = active === "all"   ? sql``
    : active === "false" ? sql`AND active = false`
    : sql`AND active = true`;

  const sourceClause = source ? sql`AND source = ${source}` : sql``;

  const r = await db.execute(sql`
    SELECT id, email, name, source, tags, active, subscribed_at
    FROM email_subscribers
    WHERE 1=1 ${activeClause} ${sourceClause}
    ORDER BY subscribed_at DESC
  `);
  res.json(r.rows);
});

/* POST /api/admin/subscribers — manually add subscriber */
router.post("/admin/subscribers", requireAdmin, async (req, res) => {
  const { email, name, source } = req.body as {
    email?: string; name?: string; source?: string;
  };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email required" }); return;
  }

  const safeSource = source ?? "blog";
  try {
    const r = await db.execute(sql`
      INSERT INTO email_subscribers (email, name, source, active)
      VALUES (${email.toLowerCase().trim()}, ${name?.trim() ?? null}, ${safeSource}, true)
      ON CONFLICT (email) DO UPDATE SET active = true, source = ${safeSource}
      RETURNING id, email, name, source, active, subscribed_at
    `);
    res.json({ ok: true, subscriber: r.rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to add subscriber", detail: msg });
  }
});

/* PATCH /api/admin/subscribers/:id/toggle — pause / unpause */
router.patch("/admin/subscribers/:id/toggle", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const r = await db.execute(sql`
    UPDATE email_subscribers
    SET active = NOT active
    WHERE id = ${id}
    RETURNING id, email, active
  `);
  if (!r.rows.length) { res.status(404).json({ error: "Subscriber not found" }); return; }
  res.json({ ok: true, subscriber: r.rows[0] });
});

/* DELETE /api/admin/subscribers/:id — unsubscribe (soft) */
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

/* ── Blog Notification ───────────────────────────────────── */

/* Core blog notification sender — called from blog route and force-send */
export async function sendBlogNotificationToSubscribers(post: {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  author: string;
  category: string;
  readingTime?: string | null;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const r = await db.execute(sql`
    SELECT id, email, name FROM email_subscribers
    WHERE active = true AND source = 'blog'
  `);
  const subscribers = r.rows as { id: number; email: string; name: string | null }[];

  if (subscribers.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const baseUrl = await getSiteBaseUrl();
  const from = await getSenderAddress();
  const blogUrl = `${baseUrl}/blog/${post.slug}`;
  const unsubUrl = `${baseUrl}/unsubscribe`;

  const emails = subscribers.map(sub => ({
    to: sub.email,
    from,
    subject: `📝 New Post: ${post.title}`,
    html: buildBlogNotificationEmail({
      subscriberName: sub.name,
      blogTitle: post.title,
      blogExcerpt: post.excerpt,
      blogUrl,
      coverImageUrl: post.coverImageUrl
        ? post.coverImageUrl.startsWith("http")
          ? post.coverImageUrl
          : `${baseUrl}${post.coverImageUrl}`
        : null,
      author: post.author,
      category: post.category,
      readingTime: post.readingTime,
      unsubscribeUrl: unsubUrl,
    }),
    listUnsubscribe: unsubUrl,
  }));

  const result = await sendBulkEmails(emails);
  return { sent: result.sent, failed: result.failed, skipped: 0 };
}

/* POST /api/admin/blog-notify/:blogId — force send blog notification */
router.post("/admin/blog-notify/:blogId", requireAdmin, async (req, res) => {
  const blogId = parseInt(String(req.params.blogId ?? "0"), 10);

  const r = await db.execute(sql`
    SELECT id, title, slug, excerpt, cover_image_url, author, category, reading_time
    FROM blog_posts WHERE id = ${blogId}
  `);
  const post = r.rows[0] as {
    id: number; title: string; slug: string; excerpt: string | null;
    cover_image_url: string | null; author: string; category: string;
    reading_time: string | null;
  } | undefined;

  if (!post) { res.status(404).json({ error: "Blog post not found" }); return; }

  const result = await sendBlogNotificationToSubscribers({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    coverImageUrl: post.cover_image_url,
    author: post.author,
    category: post.category,
    readingTime: post.reading_time,
  });

  res.json({ ok: true, ...result });
});

/* GET /api/admin/blog-notify/posts — published blog posts list for dropdown */
router.get("/admin/blog-notify/posts", requireAdmin, async (_req, res) => {
  const r = await db.execute(sql`
    SELECT id, title, slug, published_at
    FROM blog_posts
    WHERE status = 'published'
    ORDER BY published_at DESC
    LIMIT 50
  `);
  res.json(r.rows);
});

/* ── Newsletter Toggle ───────────────────────────────────── */

/* GET /api/settings/newsletter — public */
router.get("/settings/newsletter", async (_req, res) => {
  res.json({ enabled: await getNewsletterEnabled() });
});

/* PUT /api/admin/settings/newsletter — admin toggle */
router.put("/admin/settings/newsletter", requireAdmin, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (enabled === undefined) { res.status(400).json({ error: "enabled required" }); return; }
  await db.execute(sql`
    INSERT INTO site_settings (key, value) VALUES ('newsletter_enabled', ${String(enabled)})
    ON CONFLICT (key) DO UPDATE SET value = ${String(enabled)}, updated_at = now()
  `);
  res.json({ enabled: await getNewsletterEnabled() });
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

/* ── General Site Settings ─────────────────────────────── */

const GENERAL_DEFAULTS: Record<string, string> = {
  site_name:            "Advantix",
  site_tagline:         "Digital Agency",
  site_logo:            "",
  ai_logo:              "",
  contact_email:        "hello@advantix.digital",
  contact_phone:        "",
  contact_address:      "",
  social_twitter:       "",
  social_linkedin:      "",
  social_facebook:      "",
  social_instagram:     "",
  meta_description:     "Advantix Digital — a full-service digital agency.",
  google_analytics_id:  "",
  maintenance_mode:     "false",
  maintenance_message:  "We're performing scheduled maintenance. We'll be back shortly.",
};

async function getGeneralSettings() {
  const r = await db.execute(sql`
    SELECT key, value FROM site_settings
    WHERE key LIKE 'site_%' OR key = 'ai_logo'
       OR key LIKE 'contact_%' OR key LIKE 'social_%'
       OR key LIKE 'meta_%' OR key = 'google_analytics_id'
       OR key LIKE 'maintenance_%'
  `);
  const map: Record<string, string> = { ...GENERAL_DEFAULTS };
  for (const row of r.rows as { key: string; value: string }[]) map[row.key] = row.value;
  return {
    siteName:           map.site_name,
    tagline:            map.site_tagline,
    logo:               map.site_logo,
    aiLogo:             map.ai_logo,
    contactEmail:       map.contact_email,
    contactPhone:       map.contact_phone,
    contactAddress:     map.contact_address,
    twitter:            map.social_twitter,
    linkedin:           map.social_linkedin,
    facebook:           map.social_facebook,
    instagram:          map.social_instagram,
    metaDescription:    map.meta_description,
    googleAnalyticsId:  map.google_analytics_id,
    maintenanceMode:    map.maintenance_mode === "true",
    maintenanceMessage: map.maintenance_message,
  };
}

/* GET /api/settings/general — public */
router.get("/settings/general", async (_req, res) => {
  res.json(await getGeneralSettings());
});

/* PUT /api/admin/settings/general — admin update */
router.put("/admin/settings/general", requireAdmin, async (req, res) => {
  const body = req.body as Record<string, string | boolean>;
  const upsert = async (key: string, value: string) => {
    await db.execute(sql`
      INSERT INTO site_settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
    `);
  };
  const map: Record<string, string> = {
    siteName:           "site_name",
    tagline:            "site_tagline",
    logo:               "site_logo",
    aiLogo:             "ai_logo",
    contactEmail:       "contact_email",
    contactPhone:       "contact_phone",
    contactAddress:     "contact_address",
    twitter:            "social_twitter",
    linkedin:           "social_linkedin",
    facebook:           "social_facebook",
    instagram:          "social_instagram",
    metaDescription:    "meta_description",
    googleAnalyticsId:  "google_analytics_id",
    maintenanceMode:    "maintenance_mode",
    maintenanceMessage: "maintenance_message",
  };
  for (const [jsKey, dbKey] of Object.entries(map)) {
    if (body[jsKey] !== undefined) {
      await upsert(dbKey, String(body[jsKey]));
    }
  }
  res.json(await getGeneralSettings());
});

export default router;
