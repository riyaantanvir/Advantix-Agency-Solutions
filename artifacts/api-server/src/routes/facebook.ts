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
import { eq, desc, and, count, sql, isNull, inArray } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import { requireAdmin } from "../middleware/auth.js";
import { generateFbAutoReply, generateFbAutoReplyDetailed, getFbAutoReplyConfig } from "../lib/aiReply.js";
import { transcribeAudio } from "../lib/audioTranscribe.js";

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
  const keys = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_WEBHOOK_VERIFY_TOKEN", "FACEBOOK_WEBHOOK_BASE_URL"];
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
  const allowed = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_WEBHOOK_VERIFY_TOKEN", "FACEBOOK_WEBHOOK_BASE_URL"];
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

async function getWebhookBase(): Promise<string> {
  const fromDb = await getDbKey("FACEBOOK_WEBHOOK_BASE_URL");
  return fromDb
    ?? process.env.FACEBOOK_WEBHOOK_BASE_URL
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

/* AI reply generation lives in lib/aiReply.ts so it's shared with the
   scheduler and respects the admin-configured provider/model from the
   integrations table (FB_AUTOREPLY_PROVIDER, FB_AUTOREPLY_MODEL). */
async function getAiReply(instructions: string, userMessage: string): Promise<string> {
  return generateFbAutoReply(instructions, userMessage);
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

    /* Always persist *why* we couldn't reply — silent returns made auto-reply
       feel "broken with no clue why" for the user. Now the Messages tab can
       surface a clear reason badge for every unreplied message. */
    if (!matchedRule) {
      await db.update(facebookMessagesTable)
        .set({ error: rules.length === 0 ? "No active rules for this page" : "No rule matched this message" })
        .where(eq(facebookMessagesTable.id, messageDbId));
      return;
    }

    let replyText = "";
    let replyType = "template";
    /* AI picks the reaction based on the customer's tone (love for warm,
       like for neutral, none for abusive/profane). null = skip reaction. */
    let aiReaction: "love" | "like" | "smile" | "wow" | "sad" | "angry" | null = null;

    if (matchedRule.replyMode === "template" && matchedRule.replyTemplate) {
      replyText = matchedRule.replyTemplate.replace("{name}", msgRow.senderName ?? "there");
    } else if (matchedRule.replyMode === "ai" && matchedRule.aiInstructions) {
      const ai = await generateFbAutoReplyDetailed(matchedRule.aiInstructions, messageText);
      replyText = ai.text;
      replyType = "ai";
      aiReaction = ai.reaction;
      if (!replyText) {
        await db.update(facebookMessagesTable)
          .set({ ruleId: matchedRule.id, error: `AI (${ai.provider}/${ai.model}): ${ai.error ?? "empty response"}` })
          .where(eq(facebookMessagesTable.id, messageDbId));
        return;
      }
    } else {
      await db.update(facebookMessagesTable)
        .set({ ruleId: matchedRule.id, error: `Rule "${matchedRule.ruleName}" has no template or AI instructions` })
        .where(eq(facebookMessagesTable.id, messageDbId));
      return;
    }

    /* React on the customer's message based on AI's tone classification.
       AI returns null reaction for abusive/profane/spam messages — we skip
       the reaction in that case (no heart on insults). Best-effort: failure
       here doesn't block the text reply. */
    if (aiReaction) {
      try {
        await fbPost(`/me/messages`, fbPage.pageAccessToken, {
          recipient: { id: msgRow.senderId },
          sender_action: "react",
          payload: { message_id: msgRow.messageId, reaction: aiReaction },
        });
      } catch { /* swallow — reactions are optional */ }
    }

    /* Send reply via Facebook Graph API.
       NOTE: Messenger's Send API does NOT accept `reply_to` inside `message`
       for Page→user replies (returns "Invalid keys reply_to" error). The
       AI-picked reaction we drop on the customer's message above already
       provides the visual link between their message and our response. */
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
      error: hasError ? `Facebook send failed: ${JSON.stringify((sendResult as any).error)}` : null,
    }).where(eq(facebookMessagesTable.id, messageDbId));

  } catch (err) {
    await db.update(facebookMessagesTable)
      .set({ error: `processAndReply threw: ${err instanceof Error ? err.message : String(err)}` })
      .where(eq(facebookMessagesTable.id, messageDbId));
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
        message?: {
          mid: string;
          text?: string;
          attachments?: Array<{
            type: string;
            payload: { url?: string };
          }>;
        };
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
      /* Skip echoes (page sending to itself) */
      if (event.sender.id === pageId) continue;
      const evMsg = event.message;
      if (!evMsg) continue;

      /* ── Resolve message text (typed or voice-transcribed) ──────────────── */
      let messageText = evMsg.text ?? "";

      if (!messageText) {
        const audioAtt = evMsg.attachments?.find(a => a.type === "audio");
        if (audioAtt?.payload?.url) {
          try {
            /* Facebook audio CDN URLs are public — no auth header needed */
            const audioRes = await fetch(audioAtt.payload.url);
            if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
            messageText = await transcribeAudio(audioBuffer, "audio/mpeg");
            if (!messageText) messageText = "[Voice message — could not transcribe]";
          } catch (err) {
            messageText = `[Voice message — transcription error: ${err instanceof Error ? err.message : String(err)}]`;
          }
        }
      }

      /* Skip if still no usable text (sticker, image, video, etc.) */
      if (!messageText) continue;

      /* Get sender name */
      let senderName: string | null = null;
      try {
        const profile = await fbGet(`/${event.sender.id}?fields=name`, fbPage.pageAccessToken) as { name?: string };
        senderName = profile.name ?? null;
      } catch { /* ignore */ }

      /* Store message */
      const [msg] = await db.insert(facebookMessagesTable).values({
        facebookPageId: fbPage.id,
        messageId: evMsg.mid,
        senderId: event.sender.id,
        senderName,
        messageText,
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
  const redirectUri = encodeURIComponent(`${await getWebhookBase()}/api/facebook/callback`);
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
  const redirectUri = `${await getWebhookBase()}/api/facebook/callback`;

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

/* ── Manual token connect ────────────────────────────────────────────────────
   Power-user shortcut for users who already have a Page Access Token (e.g.
   from Graph API Explorer or a long-lived token they've generated). Avoids
   the OAuth round-trip entirely — paste the token, we verify it against
   `/me?fields=id,name`, subscribe webhooks, and store the page. Works for
   self-managed pages where the user can't / doesn't want to do the full
   Facebook Login dance. */
router.post("/facebook/connect-by-token", requireToolUser, async (req: Request, res: Response): Promise<void> => {
  const uid = toolUserId(req);
  const body = (req.body ?? {}) as { pageAccessToken?: unknown; userAccessToken?: unknown };
  const pageAccessToken = typeof body.pageAccessToken === "string" ? body.pageAccessToken.trim() : "";
  const userAccessToken = typeof body.userAccessToken === "string" ? body.userAccessToken.trim() : "";
  if (!pageAccessToken) { res.status(400).json({ error: "pageAccessToken is required" }); return; }

  try {
    /* Verify the token by asking Graph who it belongs to. A Page Access Token
       returns the Page; a User Access Token returns the user (which we
       reject because we don't know which page they meant). */
    const me = await fbGet("/me?fields=id,name,category", pageAccessToken) as {
      id?: string; name?: string; category?: string;
      error?: { message?: string; type?: string; code?: number };
    };
    if (me.error || !me.id || !me.name) {
      res.status(400).json({
        error: me.error?.message
          ?? "Token is invalid or expired. Make sure you pasted a Page Access Token, not a User Access Token.",
      });
      return;
    }
    /* User Access Tokens come back without a `category` field and `/me` is
       a User node; refuse with a clear hint instead of silently storing junk. */
    if (!me.category) {
      res.status(400).json({
        error: "This looks like a User Access Token. You need a Page Access Token. "
          + "In Graph API Explorer: pick your Page from the dropdown, request `pages_show_list`, `pages_messaging`, `pages_read_engagement`, then copy the token.",
      });
      return;
    }

    /* Subscribe the page to message webhooks so auto-reply works. Best-effort:
       if the App ID isn't configured, we still save the page (user may only
       want manual processing). */
    try {
      const sub = await fbPost(`/${me.id}/subscribed_apps`, pageAccessToken, {
        subscribed_fields: "messages,messaging_postbacks,feed",
      }) as { error?: { message?: string } };
      if (sub?.error?.message) {
        console.warn(`[FB] Webhook subscribe non-fatal error for page ${me.id}: ${sub.error.message}`);
      }
    } catch (err) {
      console.warn(`[FB] Webhook subscribe threw for page ${me.id} (continuing):`, err);
    }

    /* Upsert — same logic as OAuth flow's connect-page so reconnecting just
       refreshes the token instead of creating a duplicate row. */
    const [existing] = await db.select().from(facebookPagesTable)
      .where(and(eq(facebookPagesTable.toolUserId, uid), eq(facebookPagesTable.pageId, me.id)));

    if (existing) {
      await db.update(facebookPagesTable).set({
        pageName: me.name,
        pageAccessToken,
        userAccessToken: userAccessToken || existing.userAccessToken,
        isActive: true,
      }).where(eq(facebookPagesTable.id, existing.id));
    } else {
      await db.insert(facebookPagesTable).values({
        toolUserId: uid,
        pageId: me.id,
        pageName: me.name,
        pageAccessToken,
        userAccessToken: userAccessToken || null,
      });
    }

    res.json({ ok: true, pageName: me.name, pageId: me.id, reconnected: !!existing });
  } catch (err) {
    logger.error({ err }, "facebook: connect-by-token failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

  /* drizzle's db.execute returns a `{ rows: [...] }` result object, NOT an
     iterable — destructuring it threw "(intermediate value) is not iterable"
     and 500'd this endpoint on every poll. Read .rows directly. */
  const result = await db.execute(sql`
    SELECT
      COUNT(*) AS total_messages,
      COUNT(*) FILTER (WHERE is_replied = true AND reply_type = 'ai') AS ai_replies,
      COUNT(*) FILTER (WHERE is_replied = true AND reply_type = 'template') AS template_replies,
      COUNT(*) FILTER (WHERE is_replied = false AND error IS NULL) AS pending_replies
    FROM facebook_messages
    WHERE facebook_page_id = ANY(${sql`ARRAY[${sql.join(pageIds.map(i => sql`${i}`), sql`, `)}]::int[]`})
  `);
  const s = (result as any).rows?.[0] ?? {};
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
      : inArray(facebookMessagesTable.facebookPageId, pageIds)
    )
    .orderBy(desc(facebookMessagesTable.receivedAt))
    .limit(limit);

  res.json({ messages: msgs });
});

/* Manual retry — clears prior error/reply state on the message and re-runs
   processAndReply. Lets the user push a stuck message through after fixing
   the root cause (e.g. wrong AI model, missing rule) without deleting it. */
router.post("/facebook/messages/:id/retry", requireToolUser, async (req: Request, res: Response) => {
  const uid = toolUserId(req);
  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) { res.status(400).json({ error: "Invalid message id" }); return; }

  const [msg] = await db.select({
    id: facebookMessagesTable.id,
    facebookPageId: facebookMessagesTable.facebookPageId,
    messageText: facebookMessagesTable.messageText,
    isReplied: facebookMessagesTable.isReplied,
    pageOwner: facebookPagesTable.toolUserId,
  }).from(facebookMessagesTable)
    .innerJoin(facebookPagesTable, eq(facebookMessagesTable.facebookPageId, facebookPagesTable.id))
    .where(eq(facebookMessagesTable.id, messageId));

  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.pageOwner !== uid) { res.status(403).json({ error: "Forbidden" }); return; }
  if (msg.isReplied) { res.status(400).json({ error: "Message already replied" }); return; }

  /* Clear prior error so processAndReply writes a fresh outcome */
  await db.update(facebookMessagesTable)
    .set({ error: null })
    .where(eq(facebookMessagesTable.id, messageId));

  await processAndReply(msg.facebookPageId, msg.id, msg.messageText);

  const [after] = await db.select({
    isReplied: facebookMessagesTable.isReplied,
    replyText: facebookMessagesTable.replyText,
    error: facebookMessagesTable.error,
  }).from(facebookMessagesTable).where(eq(facebookMessagesTable.id, messageId));

  res.json({ ok: !!after?.isReplied, ...after });
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
      : inArray(facebookAutoReplyRulesTable.facebookPageId, pageIds)
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

  /* Detailed per-page diagnostics so the user can SEE why auto-reply isn't
     firing. Silent failures (no rules, no AI key, FB error, etc.) used to
     get swallowed — now each page reports back its own status. */
  type PageDiag = {
    pageName: string;
    pageId: string;
    rulesCount: number;
    activeRulesCount: number;
    aiKeyConfigured: boolean;
    fetchedMessages: number;
    newMessages: number;
    repliedCount: number;
    matchedNoReply: number;
    sendErrors: string[];
    graphError?: string;
  };
  /* Reflects the *active* FB auto-reply provider's configured key (DB or env),
     not just OPENROUTER/OPENAI env vars. */
  const aiKeyConfigured = (await getFbAutoReplyConfig()).apiKeyConfigured;
  const diags: PageDiag[] = [];
  let totalNew = 0;
  let totalReplied = 0;

  for (const page of targetPages) {
    const diag: PageDiag = {
      pageName: page.pageName, pageId: page.pageId,
      rulesCount: 0, activeRulesCount: 0, aiKeyConfigured,
      fetchedMessages: 0, newMessages: 0, repliedCount: 0, matchedNoReply: 0,
      sendErrors: [],
    };

    /* Count rules so we can tell the user "you have no rules yet" — the #1
       reason auto-reply silently does nothing. */
    const allRules = await db.select().from(facebookAutoReplyRulesTable)
      .where(eq(facebookAutoReplyRulesTable.facebookPageId, page.id));
    diag.rulesCount = allRules.length;
    diag.activeRulesCount = allRules.filter(r => r.isActive).length;

    try {
      const convRes = await fbGet(
        `/me/conversations?platform=messenger&fields=messages{message,from,created_time,id}&limit=10`,
        page.pageAccessToken
      ) as {
        data?: Array<{ messages?: { data?: Array<{ id: string; message: string; from: { id: string; name: string }; created_time: string }> } }>;
        error?: { message?: string; code?: number; type?: string };
      };

      if (convRes.error) {
        diag.graphError = `${convRes.error.type ?? "Error"} (${convRes.error.code ?? "?"}): ${convRes.error.message ?? "Unknown"}`;
        diags.push(diag);
        continue;
      }

      for (const conv of convRes.data ?? []) {
        for (const msg of conv.messages?.data ?? []) {
          diag.fetchedMessages++;
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
            diag.newMessages++;
            totalNew++;
            await processAndReply(page.id, newMsg.id, newMsg.messageText);

            /* Re-read to discover whether processAndReply actually replied or
               recorded an error — the function itself is fire-and-forget. */
            const [after] = await db.select().from(facebookMessagesTable)
              .where(eq(facebookMessagesTable.id, newMsg.id));
            if (after?.isReplied) { diag.repliedCount++; totalReplied++; }
            else if (after?.error) diag.sendErrors.push(after.error);
            else diag.matchedNoReply++; /* no rule matched OR AI returned empty */
          }
        }
      }

      await db.update(facebookPagesTable).set({ lastCheckedAt: new Date() }).where(eq(facebookPagesTable.id, page.id));
    } catch (err) {
      diag.graphError = err instanceof Error ? err.message : String(err);
      console.error(`[FB] Check failed for page ${page.pageName}:`, err);
    }
    diags.push(diag);
  }

  res.json({ ok: true, processed: totalNew, repliedCount: totalReplied, pages: diags });
});

/* ── Webhook URL info ─────────────────────────────────────────────────────── */
/**
 * Facebook Data Deletion Callback
 * Facebook calls this when a user removes our app.
 * Expects signed_request param; returns { url, confirmation_code }
 */
router.post("/facebook/data-deletion", async (req: Request, res: Response) => {
  try {
    const { createHmac } = await import("node:crypto");
    const signedRequest = (req.body as Record<string, string>).signed_request;
    if (!signedRequest) return res.status(400).json({ error: "Missing signed_request" });

    const [encodedSig, payload] = signedRequest.split(".");
    if (!encodedSig || !payload) return res.status(400).json({ error: "Invalid signed_request format" });

    const appSecret = await getAppSecret();
    if (appSecret) {
      const expectedSig = createHmac("sha256", appSecret)
        .update(payload)
        .digest("base64url");
      if (expectedSig !== encodedSig) {
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { user_id?: string };
    const userId = decoded.user_id ?? "unknown";
    const confirmationCode = `adx-del-${userId}-${Date.now()}`;

    // Best-effort: remove any facebook pages linked to this user_id
    await db.execute(sql`
      DELETE FROM facebook_pages WHERE fb_user_id = ${userId}
    `).catch(() => {/* table may not have this column, that's ok */});

    return res.json({
      url: `https://advantix.digital/pages/data-deletion`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/facebook/webhook-info", requireToolUser, async (req: Request, res: Response) => {
  /* Show the URL that matches the host the user is *currently* viewing this
     page from (dev preview vs production), so they paste a URL Facebook can
     actually reach. Fall back to the configured base for OAuth redirects. */
  const fwdProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  const host = fwdHost ?? req.headers.host;
  const proto = fwdProto ?? (req.secure ? "https" : "http");
  const currentBase = host ? `${proto}://${host}` : await getWebhookBase();
  const configuredBase = await getWebhookBase();

  res.json({
    webhookUrl: `${currentBase}/api/facebook/webhook`,
    configuredWebhookUrl: `${configuredBase}/api/facebook/webhook`,
    isDevEnvironment: currentBase !== configuredBase,
    verifyToken: await getVerifyToken(),
    callbackFields: "messages,messaging_postbacks",
  });
});

export default router;
