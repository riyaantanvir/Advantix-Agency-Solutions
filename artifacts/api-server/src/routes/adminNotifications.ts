import { Router, type Request, type Response } from "express";
import { requireSuperAdmin } from "../middleware/auth.js";
import { sendTelegramMessage, SETTING_KEYS } from "../services/telegram.js";
import { startTelegramBot } from "../lib/telegramBot.js";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router = Router();

const TELEGRAM_KEYS = [...SETTING_KEYS] as string[];

/* GET /api/admin/notifications/settings */
router.get("/admin/notifications/settings", requireSuperAdmin, async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(integrationsTable)
    .where(inArray(integrationsTable.name, TELEGRAM_KEYS));

  const settings: Record<string, { id: number; value: string; label: string; description: string | null }> = {};
  for (const r of rows) {
    const isSecret = r.name === "TELEGRAM_BOT_TOKEN";
    settings[r.name] = {
      id: r.id,
      label: r.label,
      description: r.description,
      value: isSecret && r.value ? "••••••••" + r.value.slice(-6) : r.value,
    };
  }
  res.json(settings);
});

/* PUT /api/admin/notifications/settings/:key */
router.put("/admin/notifications/settings/:key", requireSuperAdmin, async (req: Request, res: Response) => {
  const key = req.params.key?.toUpperCase();
  if (!TELEGRAM_KEYS.includes(key)) {
    res.status(400).json({ error: "Unknown setting key" });
    return;
  }
  const { value } = req.body as { value: string };
  if (value === undefined) {
    res.status(400).json({ error: "Value required" });
    return;
  }

  const [existing] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, key)).limit(1);
  if (existing) {
    await db.update(integrationsTable).set({ value, updatedAt: new Date() }).where(eq(integrationsTable.id, existing.id));
  } else {
    await db.insert(integrationsTable).values({ name: key, label: key, value, category: "Notifications" });
  }

  res.json({ ok: true });
});

/* POST /api/admin/notifications/telegram/test */
router.post("/admin/notifications/telegram/test", requireSuperAdmin, async (_req: Request, res: Response) => {
  const result = await sendTelegramMessage(
    `🔔 <b>Advantix Admin — Test Notification</b>\n\nYour Telegram integration is working correctly! You will receive task notifications here.\n\n<i>— Advantix Admin</i>`
  );
  res.json(result);
});

/* POST /api/admin/notifications/telegram/restart-bot */
router.post("/admin/notifications/telegram/restart-bot", requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    await startTelegramBot();
    res.json({ ok: true, message: "Telegram bot (re)started." });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

export default router;
