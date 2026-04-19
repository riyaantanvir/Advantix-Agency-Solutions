import { Router, type Request, type Response, type IRouter } from "express";
import { db } from "@workspace/db";
import { whatsappSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import * as wa from "../lib/whatsappService.js";

const router: IRouter = Router();

function uid(req: Request): number {
  return (req.session as { toolUserId: number }).toolUserId;
}

/* ── Status / settings ────────────────────────────────────────────── */
router.get("/tools/whatsapp/status", requireToolUser, async (req, res) => {
  const u = uid(req);
  const [row] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.userId, u)).limit(1);
  const live = wa.getStatus(u);
  res.json({
    status: live.status !== "disconnected" ? live.status : (row?.status ?? "disconnected"),
    phone: live.phone ?? row?.phoneNumber ?? null,
    displayName: live.displayName ?? row?.displayName ?? null,
    error: live.error,
    qr: live.qrPng ?? null,
    triggerWord: row?.triggerWord ?? "@bot",
    autoReplyDm: row?.autoReplyDm ?? true,
    autoReplyGroups: row?.autoReplyGroups ?? false,
    allowedJids: row?.allowedJids ?? [],
    blockedJids: row?.blockedJids ?? [],
    connectedAt: row?.connectedAt ?? null,
  });
});

router.post("/tools/whatsapp/connect", requireToolUser, async (req, res) => {
  const u = uid(req);
  await db.insert(whatsappSessionsTable).values({ userId: u }).onConflictDoNothing();
  wa.connect(u).catch(e => console.error("[whatsapp.connect]", e));
  res.json({ ok: true });
});

router.post("/tools/whatsapp/disconnect", requireToolUser, async (req, res) => {
  const fullLogout = req.body?.logout === true;
  await wa.disconnect(uid(req), fullLogout);
  res.json({ ok: true });
});

router.put("/tools/whatsapp/settings", requireToolUser, async (req, res) => {
  const u = uid(req);
  const body = req.body as {
    triggerWord?: string;
    autoReplyDm?: boolean;
    autoReplyGroups?: boolean;
    allowedJids?: string[];
    blockedJids?: string[];
  };
  const updates: any = { updatedAt: new Date() };
  if (typeof body.triggerWord === "string") updates.triggerWord = body.triggerWord.trim().slice(0, 30) || "@bot";
  if (typeof body.autoReplyDm === "boolean") updates.autoReplyDm = body.autoReplyDm;
  if (typeof body.autoReplyGroups === "boolean") updates.autoReplyGroups = body.autoReplyGroups;
  if (Array.isArray(body.allowedJids)) updates.allowedJids = body.allowedJids.filter(j => typeof j === "string").slice(0, 200);
  if (Array.isArray(body.blockedJids)) updates.blockedJids = body.blockedJids.filter(j => typeof j === "string").slice(0, 200);

  const [exists] = await db.select({ userId: whatsappSessionsTable.userId }).from(whatsappSessionsTable).where(eq(whatsappSessionsTable.userId, u)).limit(1);
  if (!exists) {
    await db.insert(whatsappSessionsTable).values({ userId: u, ...updates });
  } else {
    await db.update(whatsappSessionsTable).set(updates).where(eq(whatsappSessionsTable.userId, u));
  }
  res.json({ ok: true });
});

/* ── QR + status SSE stream ───────────────────────────────────────── */
router.get("/tools/whatsapp/stream", requireToolUser, (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (payload: object) => {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* ignore */ }
  };

  const unsub = wa.subscribeStatus(uid(req), send);
  const heartbeat = setInterval(() => { try { res.write(`: ping\n\n`); } catch { /* ignore */ } }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsub();
  });
});

export default router;
