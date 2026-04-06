import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { sendTelegramMessage } from "../services/telegram.js";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router = Router();

const TELEGRAM_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TELEGRAM_NOTIFY_TASK_CREATED",
  "TELEGRAM_NOTIFY_TASK_ASSIGNED",
  "TELEGRAM_NOTIFY_TASK_STATUS",
  "TELEGRAM_NOTIFY_ASSISTANT_REQUEST",
];

/* GET /api/admin/notifications/settings */
router.get("/admin/notifications/settings", requireAdmin, async (_req: Request, res: Response) => {
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
router.put("/admin/notifications/settings/:key", requireAdmin, async (req: Request, res: Response) => {
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
router.post("/admin/notifications/telegram/test", requireAdmin, async (_req: Request, res: Response) => {
  const result = await sendTelegramMessage(
    `🔔 <b>Advantix Admin — Test Notification</b>\n\nYour Telegram integration is working correctly! You will receive task notifications here.\n\n<i>— Advantix Admin</i>`
  );
  res.json(result);
});

export default router;
