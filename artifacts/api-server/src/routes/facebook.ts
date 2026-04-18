/**
 * Facebook Auto-Reply System
 * OAuth → Page Connect → Webhook → Auto-Reply Engine → Scheduler
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  facebookPagesTable, facebookMessagesTable, facebookAutoReplyRulesTable,
  integrationsTable,
} from "@workspace/db/schema";
import { eq, desc, and, count, sql, isNull } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function toolUserId(req: Request): number {
  return (req.session as { toolUserId?: number }).toolUserId!;
}

async function getDbKey(name: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, name));
    return row?.value || null;
  } catch { return null; }
}

async function getAppId(): Promise<string> {
  return (await getDbKey("FACEBOOK_APP_ID")) ?? process.env.FACEBOOK_APP_ID ?? "";
}
async function getAppSecret(): Promise<string> {
  return (await getDbKey("FACEBOOK_APP_SECRET")) ?? process.env.FACEBOOK_APP_SECRET ?? "";
}
async function getVerifyToken(): Promise<string> {
  return (await getDbKey("FACEBOOK_WEBHOOK_VERIFY_TOKEN"))
    ?? process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN
    ?? "advantix_fb_verify_2025";
}

/* ── Admin: GET/PUT Facebook App Settings ───────────────────────────────── */
router.get("/admin/facebook/settings", requireAdmin, async (_req: Request, res: Response) => {
  const keys = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_WEBHOOK_VERIFY_TOKEN"];
  const result: Record<string, string> = {};
  for (const k of keys) {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, k));
    result[k] = row?.value
      ? (k === "FACEBOOK_APP_SECRET" ? "••••••••" + row.value.slice(-4) : row.value)
      : "";
  }
  res.json(result);
});

router.put("/admin/facebook/settings", requireAdmin, async (req: Request, res: Response) => {
  const allowed = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_WEBHOOK_VERIFY_TOKEN"];
  const body = req.body as Record<string, string>;
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    const value = body[key].trim();
    if (!value) continue;
    const [existing] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, key));
    if (existing) {
      await db.update(integrationsTable).set({ value, updatedAt: new Date() }).where(eq(integrationsTable.name, key));
    } else {
      await db.insert(integrationsTable).values({
        name: key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        value,
        category: "facebook",
        description: `Facebook Auto-Reply: ${key}`,
      });
    }
  }
  res.json({ success: true });
});

function getWebhookBase(): string {
  return process.env.FACEBOOK_WEBHOOK_BASE_URL
    ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost"}`;
}

async function fbGet(path: string, token: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://graph.facebook.com/v21.0${path}${path.includes("?") ? "&" : "?"}access_token=${token}`);
  return r.json() as Promise<Record<string, unknown>>;
}

async function fbPost(path: string, token: string, body: object): Promise<Record<string, unknown>> {
  const r = await fetch(`https://graph.facebook.com/v21.0${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  return r.json() as Promise<Record<string, unknown>>;
}

async function getAiReply(instructions: string, userMessage: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "";

  const r = await fetch(
    isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(isOpenRouter ? { "HTTP-Referer": "https://advantix.digital" } : {}),
      },
      body: JSON.stringify({
        model: isOpenRouter ? "z-ai/glm-5.1" : "gpt-4o-mini",
        max_tokens: 500,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: userMessage },
        ],
      }),
    }
  );
  const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
  return d.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ── Auto-Reply Engine ────────────────────────────────────────────────────── */
async function processAndReply(fbPageDbId: number, messageDbId: number, messageText: string): Promise<void> {
  try {
    const [msgRow] = await db.select().from(facebookMessagesTable).where(eq(facebookMessagesTable.id, messageDbId));
    if (!msgRow || msgRow.isReplied) return;

    const [fbPage] = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.id, fbPageDbId));
    if (!fbPage) return;

    /* Find best matching rule */
    const rules = await db.select().from(facebookAutoReplyRulesTable)
      .where(and(eq(facebookAutoReplyRulesTable.facebookPageId, fbPageDbId), eq(facebookAutoReplyRulesTable.isActive, true)))
      .orderBy(desc(facebookAutoReplyRulesTable.priority));

    let matchedRule = null;
    for (const rule of rules) {
      if (rule.triggerType === "all") { matchedRule = rule; break; }
      if (rule.triggerType === "keyword" && rule.triggerKeywords) {
        const kws = rule.triggerKeywords.split(",").map(k => k.trim().toLowerCase());
        if (kws.some(k => messageText.toLowerCase().includes(k))) { matchedRule = rule; break; }
      }
    }

    if (!matchedRule) return;

    let replyText = "";
    let replyType = "template";

    if (matchedRule.replyMode === "template" && matchedRule.replyTemplate) {
      replyText = matchedRule.replyTemplate.replace("{name}", msgRow.senderName ?? "there");
    } else if (matchedRule.replyMode === "ai" && matchedRule.aiInstructions) {
      replyText = await getAiReply(matchedRule.aiInstructions, messageText);
      replyType = "ai";
    }

    if (!replyText) return;

    /* Send reply via Facebook Graph API */
    const sendResult = await fbPost(`/me/messages`, fbPage.pageAccessToken, {
      recipient: { id: msgRow.senderId },
      message: { text: replyText },
      messaging_type: "RESPONSE",
    });

    const hasError = (sendResult as any).error;
    await db.update(facebookMessagesTable).set({
      isReplied: !hasError,
      replyText,
      repliedAt: hasError ? null : new Date(),
      replyType,
      ruleId: matchedRule.id,
      error: hasError ? JSON.stringify((sendResult as any).error) : null,
    }).where(eq(facebookMessagesTable.id, messageDbId));

  } catch (err) {
    await db.update(facebookMessagesTable).set({ error: String(err) }).where(eq(facebookMessagesTable.id, messageDbId));
  }
}

/* ── Webhook ─────────────────────────────────────────────────────────────── */

/* GET — Facebook verification handshake */
router.get("/facebook/webhook", async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === await getVerifyToken()) {
    console.log("[FB Webhook] Verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: "Forbidden" });
  }
});

/* POST — Receive messages */
router.post("/facebook/webhook", async (req: Request, res: Response) => {
  const body = req.body as {
    object?: string;
    entry?: Array<{
      id: string;
      messaging?: Array<{
        sender: { id: string };
        recipient: { id: string };
        timestamp: number;
        message?: { mid: string; text: string };
      }>;
    }>;
  };

  if (body.object !== "page") { res.sendStatus(404); return; }
  res.sendStatus(200); /* Respond immediately */

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;
    const [fbPage] = await db.select().from(facebookPagesTable)
      .where(and(eq(facebookPagesTable.pageId, pageId), eq(facebookPagesTable.isActive, true)));
    if (!fbPage) continue;

    for (const event of entry.messaging ?? []) {
      if (!event.message?.text || event.sender.id === pageId) continue;

      /* Get sender name */
      let senderName: string | null = null;
      try {
        const profile = await fbGet(`/${event.sender.id}?fields=name`, fbPage.pageAccessToken) as { name?: string };
        senderName = profile.name ?? null;
      } catch { /* ignore */ }

      /* Store message */
      const [msg] = await db.insert(facebookMessagesTable).values({
        facebookPageId: fbPage.id,
        messageId: event.message.mid,
        senderId: event.sender.id,
        senderName,
        messageText: event.message.text,
        receivedAt: new Date(event.timestamp),
      }).onConflictDoNothing().returning();

      if (msg) {
        /* Reply immediately */
        await processAndReply(fbPage.id, msg.id, msg.messageText);
      }
    }
  }
});

/* ── OAuth Flow ──────────────────────────────────────────────────────────── */

/* Step 1: Get Facebook OAuth URL */
router.get("/facebook/auth-url", requireToolUser, async (req: Request, res: Response) => {
  const appId = await getAppId();
  if (!appId) { res.status(500).json({ error: "FACEBOOK_APP_ID not configured. Go to Admin → Facebook Settings." }); return; }
  const redirectUri = encodeURIComponent(`${getWebhookBase()}/api/facebook/callback`);
  const scope = "pages_manage_metadata,pages_messaging,pages_read_engagement,pages_show_list";
  const state = Buffer.from(JSON.stringify({ uid: toolUserId(req), ts: Date.now() })).toString("base64");
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;
  res.json({ url });
});

/* Step 2: OAuth Callback — exchange code for tokens + list pages */
router.get("/facebook/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) { res.status(400).send("Missing code or state"); return; }

  let uid: number;
  try {
    uid = JSON.parse(Buffer.from(state, "base64").toString()).uid;
  } catch { res.status(400).send("Invalid state"); return; }

  const appId = await getAppId();
  const appSecret = await getAppSecret();
  const redirectUri = `${getWebhookBase()}/api/facebook/callback`;

  try {
    /* Exchange code → short-lived token */
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? "Token exchange failed");

    /* Exchange short-lived → long-lived token */
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json() as { access_token?: string; error?: { message: string } };
    const longToken = longData.access_token ?? tokenData.access_token;

    /* Get pages list */
    const pagesData = await fbGet("/me/accounts", longToken) as { data?: Array<{ id: string; name: string; access_token: string }> };
    const pages = pagesData.data ?? [];

    /* Store pages in session for the select step */
    req.session.oauthState = JSON.stringify({ uid, pages, longToken });
    await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));

    /* Redirect to frontend with success */
    const appBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/ai`
      : "/ai";
    res.redirect(`${appBase}/facebook?oauth=success`);
  } catch (err) {
    const appBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/ai`
      : "/ai";
    res.redirect(`${appBase}/facebook?oauth=error&msg=${encodeURIComponent(String(err))}`);
  }
});

/* Step 3: List pages from OAuth session for user to pick */
router.get("/facebook/oauth-pages", requireToolUser, (req: Request, res: Response) => {
  const raw = req.session.oauthState;
  if (!raw) { res.json({ pages: [] }); return; }
  try {
    const { pages } = JSON.parse(raw) as { pages: Array<{ id: string; name: string }> };
    res.json({ pages });
  } catch { res.json({ pages: [] }); }
});

/* Step 4: Connect a specific page */
router.post("/facebook/connect-page", requireToolUser, async (req: Request, res: Response) => {
  const raw = req.session.oauthState;
  if (!raw) { res.status(400).json({ error: "No OAuth session, please reconnect" }); return; }

  const { pageId } = req.body as { pageId?: string };
  if (!pageId) { res.status(400).json({ error: "pageId required" }); return; }

  try {
    const { pages, longToken, uid } = JSON.parse(raw) as {
      pages: Array<{ id: string; name: string; access_token: string }>;
      longToken: string;
      uid: number;
    };
    const page = pages.find(p => p.id === pageId);
    if (!page) { res.status(404).json({ error: "Page not found in OAuth session" }); return; }

    /* Subscribe webhook to this page */
    const appId = await getAppId();
    const appSecret = await getAppSecret();
    const appToken = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`
    ).then(r => r.json() as Promise<{ access_token?: string }>).then(d => d.access_token ?? "");

    await fbPost(`/${pageId}/subscribed_apps`, page.access_token, {
      subscribed_fields: "messages,messaging_postbacks",
    });

    /* Upsert page in DB */
    const [existing] = await db.select().from(facebookPagesTable)
      .where(and(eq(facebookPagesTable.toolUserId, uid), eq(facebookPagesTable.pageId, pageId)));

    if (existing) {
      await db.update(facebookPagesTable).set({
        pageName: page.name,
        pageAccessToken: page.access_token,
        userAccessToken: longToken,
        isActive: true,
      }).where(eq(facebookPagesTable.id, existing.id));
    } else {
      await db.insert(facebookPagesTable).values({
        toolUserId: uid,
        pageId,
        pageName: page.name,
        pageAccessToken: page.access_token,
        userAccessToken: longToken,
      });
    }

    req.session.oauthState = undefined;
    res.json({ ok: true, pageName: page.name });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ── Pages Management ─────────────────────────────────────────────────────── */

router.get("/facebook/pages", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const pages = await db.select({
    id: facebookPagesTable.id,
    pageId: facebookPagesTable.pageId,
    pageName: facebookPagesTable.pageName,
    isActive: facebookPagesTable.isActive,
    connectedAt: facebookPagesTable.connectedAt,
    lastCheckedAt: facebookPagesTable.lastCheckedAt,
  }).from(facebookPagesTable).where(eq(facebookPagesTable.toolUserId, uid))
    .orderBy(desc(facebookPagesTable.connectedAt));
  res.json({ pages });
});

router.delete("/facebook/pages/:id", requireToolUser, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const uid = toolUserId(req);
  const [page] = await db.select().from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, id), eq(facebookPagesTable.toolUserId, uid)));
  if (!page) { res.status(404).json({ error: "Not found" }); return; }

  /* Unsubscribe app from page */
  try {
    await fetch(`https://graph.facebook.com/v21.0/${page.pageId}/subscribed_apps?access_token=${page.pageAccessToken}`, { method: "DELETE" });
  } catch { /* ignore */ }

  await db.delete(facebookPagesTable).where(eq(facebookPagesTable.id, id));
  res.json({ ok: true });
});

/* ── Stats ────────────────────────────────────────────────────────────────── */

router.get("/facebook/stats", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const pages = await db.select({ id: facebookPagesTable.id })
    .from(facebookPagesTable).where(eq(facebookPagesTable.toolUserId, uid));
  const pageIds = pages.map(p => p.id);

  if (!pageIds.length) {
    res.json({ totalMessages: 0, aiReplies: 0, templateReplies: 0, pendingReplies: 0, connectedPages: 0 });
    return;
  }

  const [stats] = await db.execute(sql`
    SELECT
      COUNT(*) AS total_messages,
      COUNT(*) FILTER (WHERE is_replied = true AND reply_type = 'ai') AS ai_replies,
      COUNT(*) FILTER (WHERE is_replied = true AND reply_type = 'template') AS template_replies,
      COUNT(*) FILTER (WHERE is_replied = false AND error IS NULL) AS pending_replies
    FROM facebook_messages
    WHERE facebook_page_id = ANY(${pageIds})
  `);
  const s = (stats as any).rows[0];
  res.json({
    totalMessages: Number(s.total_messages),
    aiReplies: Number(s.ai_replies),
    templateReplies: Number(s.template_replies),
    pendingReplies: Number(s.pending_replies),
    connectedPages: pageIds.length,
  });
});

/* ── Message History ──────────────────────────────────────────────────────── */

router.get("/facebook/messages", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const pageIdParam = req.query.pageId ? Number(req.query.pageId) : null;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);

  const pages = await db.select({ id: facebookPagesTable.id })
    .from(facebookPagesTable).where(eq(facebookPagesTable.toolUserId, uid));
  const pageIds = pages.map(p => p.id);
  if (!pageIds.length) { res.json({ messages: [] }); return; }

  const msgs = await db.select({
    id: facebookMessagesTable.id,
    messageId: facebookMessagesTable.messageId,
    senderId: facebookMessagesTable.senderId,
    senderName: facebookMessagesTable.senderName,
    messageText: facebookMessagesTable.messageText,
    receivedAt: facebookMessagesTable.receivedAt,
    isReplied: facebookMessagesTable.isReplied,
    replyText: facebookMessagesTable.replyText,
    repliedAt: facebookMessagesTable.repliedAt,
    replyType: facebookMessagesTable.replyType,
    error: facebookMessagesTable.error,
    facebookPageId: facebookMessagesTable.facebookPageId,
    pageName: facebookPagesTable.pageName,
  }).from(facebookMessagesTable)
    .innerJoin(facebookPagesTable, eq(facebookMessagesTable.facebookPageId, facebookPagesTable.id))
    .where(pageIdParam
      ? and(eq(facebookMessagesTable.facebookPageId, pageIdParam), eq(facebookPagesTable.toolUserId, uid))
      : sql`${facebookMessagesTable.facebookPageId} = ANY(${pageIds})`
    )
    .orderBy(desc(facebookMessagesTable.receivedAt))
    .limit(limit);

  res.json({ messages: msgs });
});

/* ── Rules CRUD ──────────────────────────────────────────────────────────── */

router.get("/facebook/rules", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const pageIdParam = req.query.pageId ? Number(req.query.pageId) : null;
  const pages = await db.select({ id: facebookPagesTable.id })
    .from(facebookPagesTable).where(eq(facebookPagesTable.toolUserId, uid));
  const pageIds = pages.map(p => p.id);
  if (!pageIds.length) { res.json({ rules: [] }); return; }

  const rules = await db.select().from(facebookAutoReplyRulesTable)
    .where(pageIdParam
      ? eq(facebookAutoReplyRulesTable.facebookPageId, pageIdParam)
      : sql`${facebookAutoReplyRulesTable.facebookPageId} = ANY(${pageIds})`
    )
    .orderBy(desc(facebookAutoReplyRulesTable.priority), desc(facebookAutoReplyRulesTable.createdAt));
  res.json({ rules });
});

router.post("/facebook/rules", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const { facebookPageId, ruleName, triggerType, triggerKeywords, replyMode, replyTemplate, aiInstructions, priority } = req.body as {
    facebookPageId: number; ruleName: string; triggerType: string; triggerKeywords?: string;
    replyMode: string; replyTemplate?: string; aiInstructions?: string; priority?: number;
  };

  const [page] = await db.select().from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, facebookPageId), eq(facebookPagesTable.toolUserId, uid)));
  if (!page) { res.status(403).json({ error: "Page not found" }); return; }

  const [rule] = await db.insert(facebookAutoReplyRulesTable).values({
    facebookPageId, ruleName, triggerType: triggerType ?? "all",
    triggerKeywords: triggerKeywords ?? null, replyMode: replyMode ?? "template",
    replyTemplate: replyTemplate ?? null, aiInstructions: aiInstructions ?? null,
    priority: priority ?? 0,
  }).returning();
  res.json({ rule });
});

router.put("/facebook/rules/:id", requireToolUser, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const uid = toolUserId(req);
  const body = req.body as Partial<{
    ruleName: string; triggerType: string; triggerKeywords: string;
    replyMode: string; replyTemplate: string; aiInstructions: string;
    priority: number; isActive: boolean;
  }>;

  const [existing] = await db.select({ facebookPageId: facebookAutoReplyRulesTable.facebookPageId })
    .from(facebookAutoReplyRulesTable).where(eq(facebookAutoReplyRulesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Rule not found" }); return; }

  const [page] = await db.select().from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, existing.facebookPageId), eq(facebookPagesTable.toolUserId, uid)));
  if (!page) { res.status(403).json({ error: "Forbidden" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.ruleName !== undefined) updates.ruleName = body.ruleName;
  if (body.triggerType !== undefined) updates.triggerType = body.triggerType;
  if (body.triggerKeywords !== undefined) updates.triggerKeywords = body.triggerKeywords;
  if (body.replyMode !== undefined) updates.replyMode = body.replyMode;
  if (body.replyTemplate !== undefined) updates.replyTemplate = body.replyTemplate;
  if (body.aiInstructions !== undefined) updates.aiInstructions = body.aiInstructions;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const [rule] = await db.update(facebookAutoReplyRulesTable).set(updates).where(eq(facebookAutoReplyRulesTable.id, id)).returning();
  res.json({ rule });
});

router.delete("/facebook/rules/:id", requireToolUser, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const uid = toolUserId(req);
  const [existing] = await db.select({ facebookPageId: facebookAutoReplyRulesTable.facebookPageId })
    .from(facebookAutoReplyRulesTable).where(eq(facebookAutoReplyRulesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Rule not found" }); return; }
  const [page] = await db.select().from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.id, existing.facebookPageId), eq(facebookPagesTable.toolUserId, uid)));
  if (!page) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(facebookAutoReplyRulesTable).where(eq(facebookAutoReplyRulesTable.id, id));
  res.json({ ok: true });
});

/* ── Manual Check / Scheduler ────────────────────────────────────────────── */

/* Manual "Check Now" — fetch latest messages from Graph API */
router.post("/facebook/check-now", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const { pageId } = req.body as { pageId?: number };

  const pages = await db.select().from(facebookPagesTable)
    .where(and(eq(facebookPagesTable.toolUserId, uid), eq(facebookPagesTable.isActive, true)));
  const targetPages = pageId ? pages.filter(p => p.id === pageId) : pages;

  let newMessages = 0;
  let repliedCount = 0;

  for (const page of targetPages) {
    try {
      /* Fetch conversations from Graph API */
      const convRes = await fbGet(
        `/me/conversations?fields=messages{message,from,created_time,id}&limit=10`,
        page.pageAccessToken
      ) as { data?: Array<{ messages?: { data?: Array<{ id: string; message: string; from: { id: string; name: string }; created_time: string }> } }> };

      for (const conv of convRes.data ?? []) {
        for (const msg of conv.messages?.data ?? []) {
          if (msg.from.id === page.pageId) continue; /* skip page's own messages */

          const [existing] = await db.select({ id: facebookMessagesTable.id })
            .from(facebookMessagesTable).where(eq(facebookMessagesTable.messageId, msg.id));
          if (existing) continue;

          const [newMsg] = await db.insert(facebookMessagesTable).values({
            facebookPageId: page.id,
            messageId: msg.id,
            senderId: msg.from.id,
            senderName: msg.from.name,
            messageText: msg.message,
            receivedAt: new Date(msg.created_time),
          }).onConflictDoNothing().returning();

          if (newMsg) {
            newMessages++;
            await processAndReply(page.id, newMsg.id, newMsg.messageText);
            repliedCount++;
          }
        }
      }

      await db.update(facebookPagesTable).set({ lastCheckedAt: new Date() }).where(eq(facebookPagesTable.id, page.id));
    } catch (err) {
      console.error(`[FB] Check failed for page ${page.pageName}:`, err);
    }
  }

  res.json({ ok: true, newMessages, repliedCount });
});

/* ── Webhook URL info ─────────────────────────────────────────────────────── */
router.get("/facebook/webhook-info", requireToolUser, async (_req: Request, res: Response) => {
  res.json({
    webhookUrl: `${getWebhookBase()}/api/facebook/webhook`,
    verifyToken: await getVerifyToken(),
    callbackFields: "messages,messaging_postbacks",
  });
});

export default router;
