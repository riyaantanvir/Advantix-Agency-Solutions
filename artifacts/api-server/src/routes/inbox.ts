import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { inboxMessagesTable, emailContactsTable, emailCampaignsTable, emailEventsTable } from "@workspace/db/schema";
import { eq, desc, and, sql, or } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { sendEmail } from "../services/resendMailer.js";
import crypto from "crypto";

const router = Router();

function generateThreadId(email1: string, email2: string): string {
  const sorted = [email1.toLowerCase(), email2.toLowerCase()].sort().join("|");
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

router.get("/inbox/threads", requireAdmin, async (_req: Request, res: Response) => {
  const threads = await db.execute(sql`
    SELECT DISTINCT ON (thread_id)
      thread_id,
      id,
      direction,
      from_email,
      from_name,
      to_email,
      subject,
      body_text,
      is_read,
      received_at,
      created_at
    FROM inbox_messages
    ORDER BY thread_id, received_at DESC
  `);

  const threadList = (threads.rows as any[]).map(r => ({
    threadId: r.thread_id,
    id: r.id,
    direction: r.direction,
    fromEmail: r.from_email,
    fromName: r.from_name,
    toEmail: r.to_email,
    subject: r.subject,
    preview: (r.body_text || "").slice(0, 120),
    isRead: r.is_read,
    receivedAt: r.received_at,
  }));

  threadList.sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  res.json(threadList);
});

router.get("/inbox/threads/:threadId", requireAdmin, async (req: Request, res: Response) => {
  const threadId = String(req.params.threadId);
  const messages = await db
    .select()
    .from(inboxMessagesTable)
    .where(eq(inboxMessagesTable.threadId, threadId))
    .orderBy(inboxMessagesTable.receivedAt);

  await db
    .update(inboxMessagesTable)
    .set({ isRead: true })
    .where(and(eq(inboxMessagesTable.threadId, threadId), eq(inboxMessagesTable.isRead, false)));

  res.json(messages);
});

router.get("/inbox/unread-count", requireAdmin, async (_req: Request, res: Response) => {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(inboxMessagesTable)
    .where(and(eq(inboxMessagesTable.isRead, false), eq(inboxMessagesTable.direction, "inbound")));
  res.json({ count: Number(result[0]?.count ?? 0) });
});

router.post("/inbox/reply", requireAdmin, async (req: Request, res: Response) => {
  const { threadId, to, subject, body, fromEmail, fromName } = req.body as {
    threadId: string;
    to: string;
    subject: string;
    body: string;
    fromEmail?: string;
    fromName?: string;
  };

  if (!threadId || !to || !subject || !body) {
    res.status(400).json({ error: "threadId, to, subject, and body are required" });
    return;
  }

  const senderEmail = fromEmail || "noreply@advantix.digital";
  const senderName = fromName || "Advantix Digital";
  const from = `${senderName} <${senderEmail}>`;

  const htmlBody = body.replace(/\n/g, "<br>");

  const result = await sendEmail({
    to,
    from,
    subject,
    html: htmlBody,
    replyTo: senderEmail,
  });

  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  const [msg] = await db.insert(inboxMessagesTable).values({
    threadId,
    direction: "outbound",
    fromEmail: senderEmail,
    fromName: senderName,
    toEmail: to,
    subject,
    bodyHtml: htmlBody,
    bodyText: body,
    isRead: true,
    resendId: result.resendId || null,
    receivedAt: new Date(),
  }).returning();

  res.json(msg);
});

router.post("/inbox/webhook", async (req: Request, res: Response) => {
  const payload = req.body;

  if (!payload || !payload.from || !payload.to) {
    res.status(200).json({ ok: true });
    return;
  }

  const fromEmail = typeof payload.from === "string" ? payload.from : payload.from?.address || "";
  const fromName = typeof payload.from === "string" ? "" : payload.from?.name || "";
  const toEmail = Array.isArray(payload.to) ? payload.to[0] : payload.to;
  const subject = payload.subject || "(No Subject)";
  const bodyHtml = payload.html || "";
  const bodyText = payload.text || "";

  const threadId = generateThreadId(fromEmail, toEmail);

  await db.insert(inboxMessagesTable).values({
    threadId,
    direction: "inbound",
    fromEmail,
    fromName,
    toEmail,
    subject,
    bodyHtml,
    bodyText,
    isRead: false,
    receivedAt: new Date(),
  });

  res.status(200).json({ ok: true });
});

router.post("/inbox/seed-from-campaigns", requireAdmin, async (_req: Request, res: Response) => {
  const campaigns = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.status, "sent"));
  const events = await db.select().from(emailEventsTable).where(eq(emailEventsTable.eventType, "sent"));

  let seeded = 0;
  for (const event of events) {
    const campaign = campaigns.find(c => c.id === event.campaignId);
    if (!campaign) continue;

    const contactEmail = event.contactEmail;
    const [contact] = await db.select().from(emailContactsTable).where(eq(emailContactsTable.email, contactEmail));

    const threadId = generateThreadId("noreply@advantix.digital", contactEmail);

    const existing = await db.select({ count: sql<number>`count(*)` })
      .from(inboxMessagesTable)
      .where(and(
        eq(inboxMessagesTable.threadId, threadId),
        eq(inboxMessagesTable.campaignId, campaign.id)
      ));

    if (Number(existing[0]?.count) > 0) continue;

    await db.insert(inboxMessagesTable).values({
      threadId,
      direction: "outbound",
      fromEmail: "noreply@advantix.digital",
      fromName: "Advantix Digital",
      toEmail: contactEmail,
      subject: campaign.subject,
      bodyHtml: campaign.htmlContent || "",
      bodyText: "",
      isRead: true,
      campaignId: campaign.id,
      receivedAt: campaign.sentAt || new Date(),
    });
    seeded++;
  }

  res.json({ seeded });
});

router.delete("/inbox/threads/:threadId", requireAdmin, async (req: Request, res: Response) => {
  const threadId = String(req.params.threadId);
  await db.delete(inboxMessagesTable).where(eq(inboxMessagesTable.threadId, threadId));
  res.json({ message: "Thread deleted" });
});

router.patch("/inbox/messages/:id/read", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { isRead } = req.body as { isRead: boolean };
  const [updated] = await db.update(inboxMessagesTable).set({ isRead }).where(eq(inboxMessagesTable.id, id)).returning();
  res.json(updated);
});

export default router;
