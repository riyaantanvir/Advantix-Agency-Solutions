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
import { generateFbAutoReply, generateFbAutoReplyDetailed } from "./aiReply.js";

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

/* Mirrors `processAndReply` in routes/facebook.ts — both call sites must record
   *why* a reply was skipped (no rule, AI empty, FB error). Keep in sync. */
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

    if (!matchedRule) {
      await db.update(facebookMessagesTable)
        .set({ error: rules.length === 0 ? "No active rules for this page" : "No rule matched this message" })
        .where(eq(facebookMessagesTable.id, messageDbId));
      return;
    }

    let replyText = "";
    let replyType = "template";
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
       null reaction = abusive/profane → don't put a heart on insults. */
    if (aiReaction) {
      try {
        await fbPost(`/me/messages`, fbPage.pageAccessToken, {
          recipient: { id: msgRow.senderId },
          sender_action: "react",
          payload: { message_id: msgRow.messageId, reaction: aiReaction },
        });
      } catch { /* ignore — reactions are optional, don't block the text reply */ }
    }

    /* Send reply via Facebook Graph API. Messenger Send API rejects `reply_to`
       inside `message` for Page→user replies, so we just send the text. The
       reaction we placed above visually links it to the customer's message. */
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

async function runFacebookCheck(): Promise<void> {
  try {
    const pages = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.isActive, true));
    if (!pages.length) return;

    logger.info({ pages: pages.length }, "[FB Scheduler] Checking messages for all pages");

    for (const page of pages) {
      try {
        const convRes = await fbGet(
          `/me/conversations?platform=messenger&fields=messages{message,from,created_time,id}&limit=10`,
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
