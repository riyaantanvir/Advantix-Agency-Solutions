import { Router, type IRouter } from "express";
import { db, conversations, messages, leadsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendTelegramMessage, buildAssistantRequestMessage } from "../services/telegram.js";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are a helpful assistant for Advantix Digital (advantix.digital).

Advantix Digital is a full-service digital agency based in Bangladesh that provides:
- Custom CRM Development, Website Design & Development, Sales Page Design
- E-commerce Solutions, Python Bots & Automation, Custom Python Programs
- Team Management Solutions, Virtual Assistant Services
- Graphics Design, Facebook & Social Media Marketing
- Social Media Management, Data Entry Services

When answering questions:
- Be friendly, professional, and helpful
- Address the visitor by their first name occasionally to make it personal
- If asked about pricing, say to contact us for a custom quote
- Always encourage visitors to reach out via the contact form or email
- Keep responses concise (2-4 sentences max)

If you don't know something specific about Advantix, be honest but still helpful.`;

/* POST /api/chat/session — create a new session */
router.post("/chat/session", async (req, res) => {
  const { name, email, token } = req.body as { name?: string; email?: string; token?: string };

  if (!name || !email) {
    res.status(400).json({ error: "Name and email required" });
    return;
  }

  // Check if token already exists (returning visitor)
  if (token) {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionToken, token))
      .limit(1);

    if (existing) {
      res.json({ sessionId: existing.id, token: existing.sessionToken, status: existing.status });
      return;
    }
  }

  const sessionToken = randomUUID();
  const [conv] = await db
    .insert(conversations)
    .values({
      title: `Chat with ${name}`,
      visitorName: name,
      visitorEmail: email,
      status: "ai",
      sessionToken,
      hasUnreadAdmin: false,
      hasUnreadVisitor: false,
    })
    .returning();

  // Auto-create a lead from this chat session
  await db.insert(leadsTable).values({
    name,
    email,
    service: "AI Chat",
    sourcePage: "Chat Widget",
  }).onConflictDoNothing();

  // Welcome message from AI
  await db.insert(messages).values({
    conversationId: conv.id,
    role: "assistant",
    content: `Hi ${name}! 👋 I'm the Advantix AI assistant. How can I help you today?`,
  });

  res.json({ sessionId: conv.id, token: sessionToken, status: "ai" });
});

/* GET /api/chat/session/:token — get session info */
router.get("/chat/session/:token", async (req, res) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionToken, String(req.params.token)))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Session not found" }); return; }

  // Clear unread admin flag when visitor reads
  if (conv.hasUnreadAdmin) {
    await db.update(conversations).set({ hasUnreadAdmin: false }).where(eq(conversations.id, conv.id));
  }

  res.json({ sessionId: conv.id, token: conv.sessionToken, status: conv.status, visitorName: conv.visitorName });
});

/* GET /api/chat/session/:token/messages — get all messages */
router.get("/chat/session/:token/messages", async (req, res) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionToken, String(req.params.token)))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Session not found" }); return; }

  const since = req.query.since ? parseInt(String(req.query.since)) : 0;

  let msgs;
  if (since > 0) {
    msgs = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), gt(messages.id, since)))
      .orderBy(messages.createdAt);
  } else {
    msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);
  }

  // Clear unread admin flag
  if (conv.hasUnreadAdmin) {
    await db.update(conversations).set({ hasUnreadAdmin: false }).where(eq(conversations.id, conv.id));
  }

  res.json({ messages: msgs, status: conv.status });
});

/* POST /api/chat/session/:token/message — visitor sends message */
router.post("/chat/session/:token/message", async (req, res) => {
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionToken, String(req.params.token)))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Session not found" }); return; }

  // Save visitor message
  const [userMsg] = await db
    .insert(messages)
    .values({ conversationId: conv.id, role: "user", content: content.trim() })
    .returning();

  await db.update(conversations)
    .set({ hasUnreadVisitor: true, updatedAt: new Date() })
    .where(eq(conversations.id, conv.id));

  // If human mode, just acknowledge
  if (conv.status === "human" || conv.status === "pending_human") {
    res.json({ message: userMsg, aiReply: null });
    return;
  }

  // AI mode — generate reply
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map(m => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    })),
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 400,
      messages: chatMessages,
    });

    const replyContent = completion.choices[0]?.message?.content ?? "I'm sorry, I couldn't process your request right now.";
    const [aiMsg] = await db
      .insert(messages)
      .values({ conversationId: conv.id, role: "assistant", content: replyContent })
      .returning();

    await db.update(conversations)
      .set({ hasUnreadAdmin: false, updatedAt: new Date() })
      .where(eq(conversations.id, conv.id));

    res.json({ message: userMsg, aiReply: aiMsg });
  } catch {
    const errorMsg = "I'm having trouble connecting right now. Please try again or ask to speak with a human.";
    const [errMsg] = await db
      .insert(messages)
      .values({ conversationId: conv.id, role: "assistant", content: errorMsg })
      .returning();
    res.json({ message: userMsg, aiReply: errMsg });
  }
});

/* POST /api/chat/session/:token/request-human — visitor requests human */
router.post("/chat/session/:token/request-human", async (req, res) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionToken, String(req.params.token)))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Session not found" }); return; }

  await db.update(conversations)
    .set({ status: "pending_human", hasUnreadVisitor: true, updatedAt: new Date() })
    .where(eq(conversations.id, conv.id));

  await db.insert(messages).values({
    conversationId: conv.id,
    role: "assistant",
    content: "You've requested to speak with a human agent. We'll connect you shortly! In the meantime, feel free to leave your message here.",
  });

  // Fire Telegram alert (fire-and-forget — don't block the response)
  sendTelegramMessage(
    buildAssistantRequestMessage({
      visitorName: conv.visitorName,
      visitorEmail: conv.visitorEmail,
      id: conv.id,
    }),
    "TELEGRAM_NOTIFY_ASSISTANT_REQUEST"
  ).catch(() => { /* silent — don't break chat if Telegram fails */ });

  res.json({ ok: true });
});

export default router;
