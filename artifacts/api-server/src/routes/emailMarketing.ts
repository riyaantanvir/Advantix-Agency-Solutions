import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import {
  db,
  emailSendersTable,
  emailTemplatesTable,
  emailContactsTable,
  emailCampaignsTable,
  emailEventsTable,
  contactsTable,
  leadsTable,
} from "@workspace/db";
import { eq, desc, asc, sql, and, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { sendEmail, sendBulkEmails } from "../services/resendMailer.js";

const router: IRouter = Router();

const TRACKING_SECRET = process.env.SESSION_SECRET || process.env.TRACKING_SECRET || "advantix-track-default-key";

function signTrackingToken(campaignId: number, email: string, extra?: string): string {
  const payload = `${campaignId}:${email}${extra ? `:${extra}` : ""}`;
  const hmac = crypto.createHmac("sha256", TRACKING_SECRET).update(payload).digest("hex").slice(0, 16);
  return hmac;
}

function verifyTrackingToken(token: string, campaignId: number, email: string, extra?: string): boolean {
  return token === signTrackingToken(campaignId, email, extra);
}

function getTrackingBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return process.env.APP_URL || "https://advantix.digital";
  }
  const replitDomain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  return "http://localhost:3000";
}

function injectTrackingPixel(html: string, campaignId: number, email: string): string {
  const base = getTrackingBaseUrl();
  const t = signTrackingToken(campaignId, email);
  const params = new URLSearchParams({ c: String(campaignId), e: email, t });
  const pixelUrl = `${base}/api/email/track/open?${params.toString()}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}

function wrapLinksForTracking(html: string, campaignId: number, email: string): string {
  const base = getTrackingBaseUrl();
  return html.replace(
    /<a\s([^>]*?)href=["'](https?:\/\/[^"']+)["']([^>]*?)>/gi,
    (_match, before: string, url: string, after: string) => {
      if (url.includes("/track/") || url.includes("mailto:") || url.includes("unsubscribe@")) {
        return _match;
      }
      const t = signTrackingToken(campaignId, email, url);
      const params = new URLSearchParams({ c: String(campaignId), e: email, url, t });
      const trackUrl = `${base}/api/email/track/click?${params.toString()}`;
      return `<a ${before}href="${trackUrl}"${after}>`;
    }
  );
}

function appendUnsubscribeFooter(html: string, recipientEmail: string): string {
  const unsubLink = `mailto:unsubscribe@advantix.digital?subject=unsubscribe&body=${encodeURIComponent(recipientEmail)}`;
  const footer = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:20px;">
      <tr>
        <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#9ca3af;line-height:1.6;">
          <p style="margin:0 0 8px 0;">Advantix Digital &bull; Premium Digital Solutions</p>
          <p style="margin:0 0 8px 0;">
            <a href="${unsubLink}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
            &nbsp;&bull;&nbsp;
            <a href="https://advantix.digital" style="color:#6b7280;text-decoration:underline;">Visit our website</a>
          </p>
          <p style="margin:0;color:#d1d5db;font-size:11px;">You received this email because you are a valued contact of Advantix Digital.</p>
        </td>
      </tr>
    </table>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }
  return html + footer;
}

// ── SENDERS ────────────────────────────────────────────────────────────────

router.get("/email/senders", requireAdmin, async (_req, res) => {
  const items = await db.select().from(emailSendersTable).orderBy(desc(emailSendersTable.createdAt));
  res.json(items);
});

router.post("/email/senders", requireAdmin, async (req, res) => {
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }
  const existing = await db.select().from(emailSendersTable).where(eq(emailSendersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Sender with this email already exists" });
    return;
  }
  const hasDefault = await db.select().from(emailSendersTable).where(eq(emailSendersTable.isDefault, true));
  const [item] = await db.insert(emailSendersTable).values({
    name,
    email,
    status: "verified",
    isDefault: hasDefault.length === 0,
  }).returning();
  res.status(201).json(item);
});

router.put("/email/senders/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { name, email, isDefault } = req.body as { name?: string; email?: string; isDefault?: boolean };
  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }
  if (isDefault) {
    await db.update(emailSendersTable).set({ isDefault: false }).where(eq(emailSendersTable.isDefault, true));
  }
  const [updated] = await db.update(emailSendersTable)
    .set({ name, email, isDefault: isDefault ?? false })
    .where(eq(emailSendersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Sender not found" }); return; }
  res.json(updated);
});

router.delete("/email/senders/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(emailSendersTable).where(eq(emailSendersTable.id, id));
  res.json({ message: "Deleted" });
});

// ── TEMPLATES ──────────────────────────────────────────────────────────────

router.get("/email/templates", requireAdmin, async (_req, res) => {
  const items = await db.select().from(emailTemplatesTable).orderBy(desc(emailTemplatesTable.updatedAt));
  res.json(items);
});

router.get("/email/templates/backup/export", requireAdmin, async (_req, res) => {
  const items = await db.select().from(emailTemplatesTable).orderBy(desc(emailTemplatesTable.updatedAt));
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "advantix-digital",
    templates: items.map(t => ({
      name: t.name,
      subject: t.subject,
      previewText: t.previewText,
      htmlBody: t.htmlBody,
      jsonBlocks: t.jsonBlocks,
      isSystem: t.isSystem,
    })),
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="templates-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

router.post("/email/templates/backup/import", requireAdmin, async (req, res) => {
  const { templates, mode } = req.body as { templates: any[]; mode?: "merge" | "replace" };
  if (!Array.isArray(templates) || templates.length === 0) {
    res.status(400).json({ error: "No templates found in backup file" });
    return;
  }
  let imported = 0;
  let skipped = 0;
  if (mode === "replace") {
    await db.delete(emailTemplatesTable);
  }
  for (const t of templates) {
    if (!t.name) { skipped++; continue; }
    if (mode !== "replace") {
      const existing = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.name, t.name));
      if (existing.length > 0) { skipped++; continue; }
    }
    await db.insert(emailTemplatesTable).values({
      name: t.name,
      subject: t.subject ?? "",
      previewText: t.previewText ?? "",
      htmlBody: t.htmlBody ?? "",
      jsonBlocks: t.jsonBlocks ?? "[]",
      isSystem: t.isSystem ?? false,
    });
    imported++;
  }
  res.json({ imported, skipped, total: templates.length });
});

router.get("/email/templates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [item] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!item) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(item);
});

router.post("/email/templates", requireAdmin, async (req, res) => {
  const { name, subject, previewText, htmlBody, jsonBlocks, isSystem } = req.body as {
    name?: string; subject?: string; previewText?: string; htmlBody?: string; jsonBlocks?: string; isSystem?: boolean;
  };
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  const [item] = await db.insert(emailTemplatesTable).values({
    name,
    subject: subject ?? "",
    previewText: previewText ?? "",
    htmlBody: htmlBody ?? "",
    jsonBlocks: jsonBlocks ?? "[]",
    isSystem: isSystem ?? false,
  }).returning();
  res.status(201).json(item);
});

router.put("/email/templates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { name, subject, previewText, htmlBody, jsonBlocks } = req.body as {
    name?: string; subject?: string; previewText?: string; htmlBody?: string; jsonBlocks?: string;
  };
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  const [updated] = await db.update(emailTemplatesTable)
    .set({ name, subject: subject ?? "", previewText: previewText ?? "", htmlBody: htmlBody ?? "", jsonBlocks: jsonBlocks ?? "[]", updatedAt: new Date() })
    .where(eq(emailTemplatesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(updated);
});

router.delete("/email/templates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  res.json({ message: "Deleted" });
});

router.post("/email/templates/:id/duplicate", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [original] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!original) { res.status(404).json({ error: "Template not found" }); return; }
  const [item] = await db.insert(emailTemplatesTable).values({
    name: `${original.name} (Copy)`,
    subject: original.subject,
    previewText: original.previewText,
    htmlBody: original.htmlBody,
    jsonBlocks: original.jsonBlocks,
    isSystem: false,
  }).returning();
  res.status(201).json(item);
});

// ── CONTACTS ───────────────────────────────────────────────────────────────

router.get("/email/contacts", requireAdmin, async (req, res) => {
  const listName = (req.query.list as string) || undefined;
  const conditions = listName ? [eq(emailContactsTable.listName, listName)] : [];
  const items = await db.select().from(emailContactsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(emailContactsTable.createdAt));
  res.json(items);
});

router.post("/email/contacts", requireAdmin, async (req, res) => {
  const { email, name, tags, listName, source } = req.body as {
    email?: string; name?: string; tags?: string; listName?: string; source?: string;
  };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }
  const [item] = await db.insert(emailContactsTable).values({
    email,
    name: name ?? "",
    tags: tags ?? "",
    listName: listName ?? "default",
    source: source ?? "manual",
  }).returning();
  res.status(201).json(item);
});

router.post("/email/contacts/bulk", requireAdmin, async (req, res) => {
  const { contacts, listName, source } = req.body as {
    contacts: Array<{ email: string; name?: string }>;
    listName?: string;
    source?: string;
  };
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: "Contacts array is required" });
    return;
  }
  const values = contacts.map((c) => ({
    email: c.email,
    name: c.name ?? "",
    tags: "",
    listName: listName ?? "default",
    source: source ?? "csv",
  }));
  const items = await db.insert(emailContactsTable).values(values).onConflictDoNothing().returning();
  res.status(201).json({ imported: items.length });
});

router.post("/email/contacts/import-leads", requireAdmin, async (req, res) => {
  const { listName } = req.body as { listName?: string };
  const leads = await db.select().from(leadsTable);
  const emailLeads = leads.filter((l) => l.email);
  if (emailLeads.length === 0) { res.json({ imported: 0 }); return; }
  const values = emailLeads.map((l) => ({
    email: l.email!,
    name: l.name ?? "",
    tags: "lead",
    listName: listName ?? "leads",
    source: "leads" as const,
  }));
  const items = await db.insert(emailContactsTable).values(values).onConflictDoNothing().returning();
  res.json({ imported: items.length });
});

router.post("/email/contacts/import-site-contacts", requireAdmin, async (req, res) => {
  const { listName } = req.body as { listName?: string };
  const siteContacts = await db.select().from(contactsTable);
  if (siteContacts.length === 0) { res.json({ imported: 0 }); return; }
  const values = siteContacts.map((c) => ({
    email: c.email,
    name: c.name,
    tags: "contact",
    listName: listName ?? "contacts",
    source: "contacts" as const,
  }));
  const items = await db.insert(emailContactsTable).values(values).onConflictDoNothing().returning();
  res.json({ imported: items.length });
});

router.put("/email/contacts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { email, name, tags, listName, unsubscribed } = req.body as {
    email?: string; name?: string; tags?: string; listName?: string; unsubscribed?: boolean;
  };
  const [updated] = await db.update(emailContactsTable)
    .set({
      ...(email !== undefined ? { email } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(listName !== undefined ? { listName } : {}),
      ...(unsubscribed !== undefined ? { unsubscribed } : {}),
    })
    .where(eq(emailContactsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json(updated);
});

router.delete("/email/contacts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(emailContactsTable).where(eq(emailContactsTable.id, id));
  res.json({ message: "Deleted" });
});

router.post("/email/contacts/bulk-delete", requireAdmin, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!ids || !Array.isArray(ids)) { res.status(400).json({ error: "ids array required" }); return; }
  await db.delete(emailContactsTable).where(inArray(emailContactsTable.id, ids));
  res.json({ message: "Deleted", count: ids.length });
});

// ── CAMPAIGNS ──────────────────────────────────────────────────────────────

router.get("/email/campaigns", requireAdmin, async (_req, res) => {
  const items = await db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt));
  res.json(items);
});

router.get("/email/campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [item] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
  if (!item) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(item);
});

router.post("/email/campaigns", requireAdmin, async (req, res) => {
  const { name, subject, previewText, templateId, senderId, htmlContent, recipientListName, status } = req.body as {
    name?: string; subject?: string; previewText?: string; templateId?: number; senderId?: number;
    htmlContent?: string; recipientListName?: string; status?: string;
  };
  if (!name || !subject) { res.status(400).json({ error: "Name and subject are required" }); return; }

  let count = 0;
  const listForCount = recipientListName ?? "default";
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(emailContactsTable)
    .where(and(eq(emailContactsTable.listName, listForCount), eq(emailContactsTable.unsubscribed, false)));
  count = Number(countResult[0]?.count ?? 0);

  const [item] = await db.insert(emailCampaignsTable).values({
    name,
    subject,
    previewText: previewText ?? "",
    templateId: templateId ?? null,
    senderId: senderId ?? null,
    htmlContent: htmlContent ?? "",
    recipientListName: recipientListName ?? "default",
    recipientCount: count,
    status: status ?? "draft",
  }).returning();
  res.status(201).json(item);
});

router.put("/email/campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { name, subject, previewText, templateId, senderId, htmlContent, recipientListName, status, scheduledAt } = req.body as {
    name?: string; subject?: string; previewText?: string; templateId?: number; senderId?: number;
    htmlContent?: string; recipientListName?: string; status?: string; scheduledAt?: string;
  };

  let recipientCount: number | undefined;
  if (recipientListName) {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(emailContactsTable)
      .where(and(eq(emailContactsTable.listName, recipientListName), eq(emailContactsTable.unsubscribed, false)));
    recipientCount = Number(countResult[0]?.count ?? 0);
  }

  const [updated] = await db.update(emailCampaignsTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(previewText !== undefined ? { previewText } : {}),
      ...(templateId !== undefined ? { templateId } : {}),
      ...(senderId !== undefined ? { senderId } : {}),
      ...(htmlContent !== undefined ? { htmlContent } : {}),
      ...(recipientListName !== undefined ? { recipientListName } : {}),
      ...(recipientCount !== undefined ? { recipientCount } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(emailCampaignsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(updated);
});

router.delete("/email/campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
  res.json({ message: "Deleted" });
});

router.post("/email/campaigns/:id/duplicate", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [original] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
  if (!original) { res.status(404).json({ error: "Campaign not found" }); return; }
  const [item] = await db.insert(emailCampaignsTable).values({
    name: `${original.name} (Copy)`,
    subject: original.subject,
    previewText: original.previewText,
    templateId: original.templateId,
    senderId: original.senderId,
    htmlContent: original.htmlContent,
    recipientListName: original.recipientListName,
    recipientCount: original.recipientCount,
    status: "draft",
  }).returning();
  res.status(201).json(item);
});

router.post("/email/campaigns/:id/send", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status === "sent") { res.status(400).json({ error: "Campaign already sent" }); return; }

  const recipients = await db.select().from(emailContactsTable)
    .where(and(
      eq(emailContactsTable.listName, campaign.recipientListName),
      eq(emailContactsTable.unsubscribed, false),
    ));

  if (recipients.length === 0) { res.status(400).json({ error: "No recipients in this list" }); return; }

  let senderFrom = "Advantix Digital <noreply@advantix.digital>";
  let replyToAddr = "hello@advantix.digital";
  if (campaign.senderId) {
    const [sender] = await db.select().from(emailSendersTable).where(eq(emailSendersTable.id, campaign.senderId));
    if (sender) {
      senderFrom = `${sender.name} <${sender.email}>`;
      replyToAddr = sender.email;
    }
  }

  let templateHtml = campaign.htmlContent ?? "";
  if (campaign.templateId && !templateHtml) {
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, campaign.templateId));
    if (tmpl?.htmlBody) templateHtml = tmpl.htmlBody;
  }

  const emailsToSend = recipients.map((r) => {
    let html = (templateHtml || `<p>${campaign.subject}</p>`)
      .replace(/\{\{name\}\}/gi, r.name ?? "")
      .replace(/\{\{email\}\}/gi, r.email);

    if (!/unsubscribe/i.test(html)) {
      html = appendUnsubscribeFooter(html, r.email);
    }

    html = injectTrackingPixel(html, id, r.email);
    html = wrapLinksForTracking(html, id, r.email);

    return {
      to: r.email,
      from: senderFrom,
      subject: (campaign.subject ?? "")
        .replace(/\{\{name\}\}/gi, r.name ?? "")
        .replace(/\{\{email\}\}/gi, r.email),
      html,
      replyTo: replyToAddr,
      listUnsubscribe: `mailto:unsubscribe@advantix.digital?subject=unsubscribe&body=${encodeURIComponent(r.email)}`,
    };
  });

  const bulkResult = await sendBulkEmails(emailsToSend);

  for (const recipient of recipients) {
    await db.insert(emailEventsTable).values({
      campaignId: campaign.id,
      contactEmail: recipient.email,
      eventType: "sent",
      metadata: JSON.stringify({ name: recipient.name }),
    });
  }

  await db.update(emailCampaignsTable)
    .set({ status: "sent", sentAt: new Date(), recipientCount: recipients.length, updatedAt: new Date() })
    .where(eq(emailCampaignsTable.id, id));

  res.json({
    message: `Campaign sent: ${bulkResult.sent} delivered, ${bulkResult.failed} failed`,
    recipientCount: recipients.length,
    delivered: bulkResult.sent,
    failed: bulkResult.failed,
    errors: bulkResult.errors.length > 0 ? bulkResult.errors : undefined,
  });
});

// ── EVENTS / REPORTS ───────────────────────────────────────────────────────

router.get("/email/campaigns/:id/report", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const events = await db.select().from(emailEventsTable)
    .where(eq(emailEventsTable.campaignId, id))
    .orderBy(desc(emailEventsTable.occurredAt));

  const sent = events.filter((e) => e.eventType === "sent").length;
  const delivered = events.filter((e) => e.eventType === "delivered").length;
  const opened = events.filter((e) => e.eventType === "opened").length;
  const clicked = events.filter((e) => e.eventType === "clicked").length;
  const bounced = events.filter((e) => e.eventType === "bounced").length;
  const unsubscribed = events.filter((e) => e.eventType === "unsubscribed").length;

  res.json({
    campaign,
    stats: { sent, delivered, opened, clicked, bounced, unsubscribed },
    events,
  });
});

// ── DASHBOARD STATS ────────────────────────────────────────────────────────

router.get("/email/stats", requireAdmin, async (_req, res) => {
  const campaignsResult = await db.select({ count: sql<number>`count(*)` }).from(emailCampaignsTable);
  const sentCampaigns = await db.select({ count: sql<number>`count(*)` }).from(emailCampaignsTable)
    .where(eq(emailCampaignsTable.status, "sent"));
  const contactsResult = await db.select({ count: sql<number>`count(*)` }).from(emailContactsTable)
    .where(eq(emailContactsTable.unsubscribed, false));
  const templatesResult = await db.select({ count: sql<number>`count(*)` }).from(emailTemplatesTable);

  const sentEvents = await db.select({ count: sql<number>`count(*)` }).from(emailEventsTable)
    .where(eq(emailEventsTable.eventType, "sent"));
  const openedEvents = await db.select({ count: sql<number>`count(*)` }).from(emailEventsTable)
    .where(eq(emailEventsTable.eventType, "opened"));
  const clickedEvents = await db.select({ count: sql<number>`count(*)` }).from(emailEventsTable)
    .where(eq(emailEventsTable.eventType, "clicked"));
  const bouncedEvents = await db.select({ count: sql<number>`count(*)` }).from(emailEventsTable)
    .where(eq(emailEventsTable.eventType, "bounced"));

  const recentCampaigns = await db.select().from(emailCampaignsTable)
    .orderBy(desc(emailCampaignsTable.createdAt))
    .limit(5);

  res.json({
    totalCampaigns: Number(campaignsResult[0]?.count ?? 0),
    sentCampaigns: Number(sentCampaigns[0]?.count ?? 0),
    totalContacts: Number(contactsResult[0]?.count ?? 0),
    totalTemplates: Number(templatesResult[0]?.count ?? 0),
    totalSent: Number(sentEvents[0]?.count ?? 0),
    totalOpened: Number(openedEvents[0]?.count ?? 0),
    totalClicked: Number(clickedEvents[0]?.count ?? 0),
    totalBounced: Number(bouncedEvents[0]?.count ?? 0),
    recentCampaigns,
  });
});

// ── SEND SINGLE EMAIL ─────────────────────────────────────────────────────

router.post("/email/send-single", requireAdmin, async (req, res) => {
  const { to, toName, subject, htmlContent, senderId, templateId } = req.body as {
    to?: string; toName?: string; subject?: string; htmlContent?: string;
    senderId?: number; templateId?: number;
  };

  const trimmedTo = (to ?? "").trim();
  const rawSubject = (subject ?? "").trim();

  if (!trimmedTo || !rawSubject) {
    res.status(400).json({ error: "Recipient email and subject are required" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedTo)) {
    res.status(400).json({ error: "Invalid recipient email address" });
    return;
  }

  let senderInfo: { name: string; email: string } | null = null;
  if (senderId) {
    const [sender] = await db.select().from(emailSendersTable).where(eq(emailSendersTable.id, senderId));
    if (!sender) {
      res.status(400).json({ error: "Sender not found" });
      return;
    }
    senderInfo = { name: sender.name, email: sender.email };
  }

  const trimmedSubject = rawSubject
    .replace(/\{\{name\}\}/gi, toName ?? "")
    .replace(/\{\{email\}\}/gi, trimmedTo);

  let finalHtml = htmlContent ?? "";
  if (templateId) {
    const [template] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, templateId));
    if (!template) {
      res.status(400).json({ error: "Template not found" });
      return;
    }
    if (template.htmlBody) {
      finalHtml = template.htmlBody
        .replace(/\{\{name\}\}/gi, toName ?? "")
        .replace(/\{\{email\}\}/gi, trimmedTo);
    }
  } else if (finalHtml) {
    finalHtml = finalHtml
      .replace(/\{\{name\}\}/gi, toName ?? "")
      .replace(/\{\{email\}\}/gi, trimmedTo);
  }

  const fromAddress = senderInfo
    ? `${senderInfo.name} <${senderInfo.email}>`
    : "Advantix Digital <noreply@advantix.digital>";

  const replyToAddr = senderInfo?.email || "hello@advantix.digital";

  if (!finalHtml) {
    finalHtml = `<p>${trimmedSubject}</p>`;
  }

  if (!/unsubscribe/i.test(finalHtml)) {
    finalHtml = appendUnsubscribeFooter(finalHtml, trimmedTo);
  }

  const [singleCampaign] = await db.insert(emailCampaignsTable).values({
    name: `Single: ${trimmedSubject.slice(0, 60)}`,
    subject: trimmedSubject,
    previewText: "",
    templateId: templateId ?? null,
    senderId: senderId ?? null,
    htmlContent: finalHtml,
    recipientListName: "__single__",
    recipientCount: 1,
    status: "draft",
  }).returning();

  let trackedHtml = injectTrackingPixel(finalHtml, singleCampaign.id, trimmedTo);
  trackedHtml = wrapLinksForTracking(trackedHtml, singleCampaign.id, trimmedTo);

  const mailResult = await sendEmail({
    to: trimmedTo,
    from: fromAddress,
    subject: trimmedSubject,
    html: trackedHtml,
    replyTo: replyToAddr,
    listUnsubscribe: `mailto:unsubscribe@advantix.digital?subject=unsubscribe&body=${encodeURIComponent(trimmedTo)}`,
  });

  if (!mailResult.success) {
    await db.delete(emailCampaignsTable).where(eq(emailCampaignsTable.id, singleCampaign.id));
    res.status(502).json({ error: `Email delivery failed: ${mailResult.error}` });
    return;
  }

  await db.update(emailCampaignsTable)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(emailCampaignsTable.id, singleCampaign.id));

  await db.insert(emailEventsTable).values({
    campaignId: singleCampaign.id,
    contactEmail: trimmedTo,
    eventType: "sent",
    metadata: JSON.stringify({
      name: toName ?? "",
      singleEmail: true,
      sender: senderInfo,
      resendId: mailResult.resendId,
    }),
  });

  res.json({
    message: "Email sent",
    campaignId: singleCampaign.id,
    to: trimmedTo,
    subject: trimmedSubject,
    resendId: mailResult.resendId,
  });
});

// ── PUBLIC TRACKING ENDPOINTS (no auth — hit by email clients) ────────────

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

router.get("/email/track/open", async (req, res) => {
  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(TRANSPARENT_GIF);

  const campaignId = parseInt(String(req.query.c), 10);
  const contactEmail = String(req.query.e || "").trim();
  const token = String(req.query.t || "");
  if (!campaignId || !contactEmail || !token) return;
  if (!verifyTrackingToken(token, campaignId, contactEmail)) return;

  try {
    await db.execute(sql`
      INSERT INTO email_events (campaign_id, contact_email, event_type, metadata)
      SELECT ${campaignId}, ${contactEmail}, 'opened', ${JSON.stringify({ ua: req.headers["user-agent"] ?? "" })}
      WHERE NOT EXISTS (
        SELECT 1 FROM email_events
        WHERE campaign_id = ${campaignId}
          AND contact_email = ${contactEmail}
          AND event_type = 'opened'
      )
    `);
  } catch (_) {}
});

router.get("/email/track/click", async (req, res) => {
  const campaignId = parseInt(String(req.query.c), 10);
  const contactEmail = String(req.query.e || "").trim();
  const targetUrl = String(req.query.url || "");
  const token = String(req.query.t || "");

  if (!targetUrl || !targetUrl.startsWith("http")) {
    res.status(400).send("Invalid URL");
    return;
  }

  res.redirect(302, targetUrl);

  if (!campaignId || !contactEmail || !token) return;
  if (!verifyTrackingToken(token, campaignId, contactEmail, targetUrl)) return;

  try {
    await db.insert(emailEventsTable).values({
      campaignId,
      contactEmail,
      eventType: "clicked",
      metadata: JSON.stringify({
        url: targetUrl,
        ua: req.headers["user-agent"] ?? "",
      }),
    });
  } catch (_) {}
});

// ── WEBHOOK (for future Resend integration) ────────────────────────────────

router.post("/email/webhook", async (req, res) => {
  const { type, data } = req.body as { type?: string; data?: { email_id?: string; to?: string } };
  if (!type) { res.status(400).json({ error: "Event type required" }); return; }
  res.json({ received: true });
});

// ── CONTACT LISTS (distinct list names) ────────────────────────────────────

router.get("/email/lists", requireAdmin, async (_req, res) => {
  const result = await db.select({
    listName: emailContactsTable.listName,
    count: sql<number>`count(*)`,
  })
  .from(emailContactsTable)
  .groupBy(emailContactsTable.listName)
  .orderBy(asc(emailContactsTable.listName));
  res.json(result);
});

export default router;
