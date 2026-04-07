import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

async function getSetting(key: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT value FROM site_settings WHERE key = ${key}`);
  return (r.rows[0] as { value: string } | undefined)?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await db.execute(sql`
    INSERT INTO site_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
  `);
}

async function initVapid() {
  let publicKey  = await getSetting("vapid_public_key");
  let privateKey = await getSetting("vapid_private_key");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey  = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting("vapid_public_key",  publicKey);
    await setSetting("vapid_private_key", privateKey);
  }
  webpush.setVapidDetails("mailto:hello@advantix.digital", publicKey, privateKey);
  return publicKey;
}

initVapid().catch(() => {});

/* GET /api/push/vapid-key */
router.get("/push/vapid-key", async (_req, res) => {
  const key = await getSetting("vapid_public_key");
  if (!key) { res.status(503).json({ error: "Push not ready" }); return; }
  res.json({ publicKey: key });
});

/* POST /api/push/subscribe */
router.post("/push/subscribe", async (req, res) => {
  const { endpoint, p256dh, auth } = req.body as {
    endpoint?: string; p256dh?: string; auth?: string;
  };
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Missing subscription fields" }); return;
  }
  const ua = req.headers["user-agent"] ?? null;
  await db.execute(sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${ua})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = ${p256dh}, auth = ${auth}
  `);
  res.json({ ok: true });
});

/* DELETE /api/push/unsubscribe */
router.delete("/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (endpoint) await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`);
  res.json({ ok: true });
});

/* GET /api/admin/push/subscribers */
router.get("/admin/push/subscribers", requireAdmin, async (_req, res) => {
  const r = await db.execute(sql`
    SELECT id, endpoint, user_agent, subscribed_at FROM push_subscriptions ORDER BY subscribed_at DESC
  `);
  res.json({ count: r.rows.length, subscribers: r.rows });
});

/* POST /api/admin/push/send — broadcast a push notification */
router.post("/admin/push/send", requireAdmin, async (req, res) => {
  const { title, body, url } = req.body as {
    title?: string; body?: string; url?: string;
  };
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

  const privateKey = await getSetting("vapid_private_key");
  const publicKey  = await getSetting("vapid_public_key");
  if (!privateKey || !publicKey) { res.status(503).json({ error: "VAPID not initialised" }); return; }

  webpush.setVapidDetails("mailto:hello@advantix.digital", publicKey, privateKey);

  const subs = await db.execute(sql`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
  const payload = JSON.stringify({ title, body, url: url ?? "/" });

  let sent = 0; let failed = 0;
  const dead: string[] = [];

  await Promise.allSettled(
    subs.rows.map(async (row: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) dead.push(row.endpoint);
      }
    })
  );

  if (dead.length) {
    await Promise.all(dead.map(ep => db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${ep}`)));
  }

  res.json({ sent, failed, cleaned: dead.length });
});

export default router;
