import { Router, type IRouter } from "express";
import { db, leadsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { sendTelegramMessage, buildNewLeadMessage } from "../services/telegram.js";

const router: IRouter = Router();

router.post("/leads", async (req, res) => {
  const { service, sourcePage, visitorId, name, email } = req.body as {
    service?: string;
    sourcePage?: string;
    visitorId?: string;
    name?: string;
    email?: string;
  };

  if (!service) {
    res.status(400).json({ error: "Service is required" });
    return;
  }

  const [lead] = await db
    .insert(leadsTable)
    .values({
      service,
      sourcePage: sourcePage ?? null,
      visitorId: visitorId ?? null,
      name: name ?? null,
      email: email ?? null,
    })
    .returning();

  res.status(201).json(lead);

  // Telegram alert (non-blocking)
  sendTelegramMessage(buildNewLeadMessage({ service, name, email, sourcePage }), "TELEGRAM_NOTIFY_NEW_LEAD").catch(() => {});
});

router.get("/leads", requireAdmin, async (_req, res) => {
  const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  res.json(leads);
});

export default router;
