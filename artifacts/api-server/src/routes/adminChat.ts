import { Router, type IRouter } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, inArray, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

/* GET /api/admin/chat/sessions — all non-ai sessions */
router.get("/admin/chat/sessions", requireAdmin, async (_req, res) => {
  const sessions = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.status, ["pending_human", "human", "closed"]))
    .orderBy(desc(conversations.updatedAt));

  res.json(sessions);
});

/* GET /api/admin/chat/sessions/all — all sessions including AI */
router.get("/admin/chat/sessions/all", requireAdmin, async (_req, res) => {
  const sessions = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  res.json(sessions);
});

/* GET /api/admin/chat/sessions/:id/messages */
router.get("/admin/chat/sessions/:id/messages", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  // Mark visitor messages as read
  await db.update(conversations)
    .set({ hasUnreadVisitor: false })
    .where(eq(conversations.id, id));

  res.json(msgs);
});

/* POST /api/admin/chat/sessions/:id/reply — admin sends message */
router.post("/admin/chat/sessions/:id/reply", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  // Upgrade status to human if pending
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Session not found" }); return; }

  const [msg] = await db
    .insert(messages)
    .values({ conversationId: id, role: "admin", content: content.trim() })
    .returning();

  await db.update(conversations)
    .set({
      status: conv.status === "pending_human" ? "human" : conv.status,
      hasUnreadAdmin: true,
      hasUnreadVisitor: false,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, id));

  res.json(msg);
});

/* PATCH /api/admin/chat/sessions/:id — update status */
router.patch("/admin/chat/sessions/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { status } = req.body as { status?: string };

  const [updated] = await db
    .update(conversations)
    .set({ status: status ?? "closed", updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();

  res.json(updated);
});

export default router;
