/**
 * Facebook Auto-Reply Scheduler
 * Runs every 20 minutes to fetch and reply to new messages
 */
import { db } from "@workspace/db";
import {
  facebookPagesTable, facebookMessagesTable, facebookAutoReplyRulesTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import pino from "pino";

const logger = pino({ name: "fb-scheduler" });

async function fbGet(path: string, token: string): Promise<Record<string, unknown>> {
  const r = await fetch(
    `https://graph.facebook.com/v21.0${path}${path.includes("?") ? "&" : "?"}access_token=${token}`
  );
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
    isOpenRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions",
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

async function processAndReply(fbPageDbId: number, messageDbId: number, messageText: string): Promise<void> {
  try {
    const [msgRow] = await db.select().from(facebookMessagesTable).where(eq(facebookMessagesTable.id, messageDbId));
    if (!msgRow || msgRow.isReplied) return;

    const [fbPage] = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.id, fbPageDbId));
    if (!fbPage) return;

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

async function runFacebookCheck(): Promise<void> {
  try {
    const pages = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.isActive, true));
    if (!pages.length) return;

    logger.info({ pages: pages.length }, "[FB Scheduler] Checking messages for all pages");

    for (const page of pages) {
      try {
        const convRes = await fbGet(
          `/me/conversations?fields=messages{message,from,created_time,id}&limit=10`,
          page.pageAccessToken
        ) as { data?: Array<{ messages?: { data?: Array<{ id: string; message: string; from: { id: string; name: string }; created_time: string }> } }> };

        if ((convRes as any).error) {
          logger.warn({ page: page.pageName, error: (convRes as any).error }, "[FB Scheduler] Graph API error");
          continue;
        }

        let newCount = 0;
        for (const conv of convRes.data ?? []) {
          for (const msg of conv.messages?.data ?? []) {
            if (msg.from.id === page.pageId) continue;

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
              newCount++;
              await processAndReply(page.id, newMsg.id, newMsg.messageText);
            }
          }
        }

        await db.update(facebookPagesTable).set({ lastCheckedAt: new Date() }).where(eq(facebookPagesTable.id, page.id));
        if (newCount > 0) logger.info({ page: page.pageName, newMessages: newCount }, "[FB Scheduler] New messages processed");

      } catch (err) {
        logger.error({ err, page: page.pageName }, "[FB Scheduler] Error checking page");
      }
    }
  } catch (err) {
    logger.error({ err }, "[FB Scheduler] Fatal error");
  }
}

export function startFacebookScheduler(): void {
  const INTERVAL_MS = 20 * 60 * 1000; /* 20 minutes */
  logger.info({ intervalMinutes: 20 }, "[FB Scheduler] Started");
  setInterval(() => {
    runFacebookCheck().catch(err => logger.error({ err }, "[FB Scheduler] Unhandled error"));
  }, INTERVAL_MS);
}
