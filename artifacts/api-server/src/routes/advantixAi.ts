import { Router, Request, Response } from "express";
import { eq, desc, sum, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiSessionsTable,
  aiMessagesTable,
  aiUsageLogsTable,
  aiUserLimitsTable,
  toolUsersTable,
} from "@workspace/db/schema";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ai as geminiAi } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

type IntentType = "image" | "code" | "reasoning" | "general";

interface ProviderInfo {
  provider: string;
  model: string;
  label: string;
}

function classifyIntent(message: string): IntentType {
  const lower = message.toLowerCase().trim();

  // Image intent — detect visual/drawing requests
  if (
    // Message starts with a drawing verb → always image
    /^(draw|paint|sketch|illustrate|render|depict|visualize|generate an? (image|picture|photo|illustration)|create an? (image|picture|photo|illustration)|make an? (image|picture|photo|illustration)|show me an? (image|picture|photo|illustration))\b/i.test(lower) ||
    // Drawing verb anywhere followed by a visual subject or image-type word
    /\b(draw|paint|sketch|illustrate|render)\b.*(city|person|animal|character|scene|landscape|nature|building|car|face|portrait|background|wallpaper|logo|icon|banner|image|picture|photo|poster|art|figure|dragon|robot|futuristic|abstract|realistic)/i.test(lower) ||
    // Explicit generation + image-type words
    /(generate|create|make|design|produce|give me).*(image|picture|photo|illustration|artwork|logo|banner|icon|scene|landscape|portrait|wallpaper|poster|painting|sketch|visual|render)/i.test(lower) ||
    // Noun form: "image/picture/photo of ..."
    /(image|picture|photo|illustration|artwork|painting|sketch|portrait|landscape|render) of\b/i.test(lower)
  ) {
    return "image";
  }

  if (/(write|fix|debug|explain|refactor|implement|code|function|class|component|api|sql|regex|algorithm|script|program|html|css|javascript|typescript|python|java|c\+\+|rust|golang)/i.test(lower)) {
    return "code";
  }
  if (/(analyze|compare|reason|why|how does|explain in depth|evaluate|critique|pros and cons|trade-off|architecture|strategy)/i.test(lower)) {
    return "reasoning";
  }
  return "general";
}

function getProvider(intent: IntentType): ProviderInfo {
  switch (intent) {
    case "image":
      return { provider: "gemini", model: "gemini-2.5-flash-image", label: "Gemini Imagen" };
    case "code":
      return { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet" };
    case "reasoning":
      return { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet" };
    case "general":
    default:
      return { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" };
  }
}

function estimateCostUsd(provider: string, model: string, promptTokens: number, completionTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.0000025, output: 0.00001 },
    "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
    "claude-sonnet-4-6": { input: 0.000003, output: 0.000015 },
    "claude-opus-4-6": { input: 0.000015, output: 0.000075 },
    "claude-haiku-4-5": { input: 0.00000025, output: 0.00000125 },
    "gemini-2.5-flash": { input: 0.0000003, output: 0.0000025 },
    "gemini-2.5-flash-image": { input: 0.0000003, output: 0.0000025 },
  };
  const rate = rates[model] || { input: 0.000001, output: 0.000002 };
  return promptTokens * rate.input + completionTokens * rate.output;
}

function requireToolUser(req: Request, res: Response, next: Function) {
  if (!req.session?.toolUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

router.get("/sessions", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const sessions = await db
    .select()
    .from(aiSessionsTable)
    .where(eq(aiSessionsTable.userId, userId))
    .orderBy(desc(aiSessionsTable.updatedAt))
    .limit(50);
  res.json(sessions);
});

router.post("/sessions", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const [session] = await db
    .insert(aiSessionsTable)
    .values({ userId, title: "New Chat" })
    .returning();
  res.json(session);
});

router.get("/sessions/:id/messages", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const sessionId = parseInt(req.params.id);
  const [session] = await db
    .select()
    .from(aiSessionsTable)
    .where(and(eq(aiSessionsTable.id, sessionId), eq(aiSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  const messages = await db
    .select()
    .from(aiMessagesTable)
    .where(eq(aiMessagesTable.sessionId, sessionId))
    .orderBy(aiMessagesTable.createdAt);
  res.json(messages);
});

router.delete("/sessions/:id", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const sessionId = parseInt(req.params.id);
  await db.delete(aiSessionsTable).where(and(eq(aiSessionsTable.id, sessionId), eq(aiSessionsTable.userId, userId)));
  res.json({ success: true });
});

router.post("/chat/:sessionId", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const sessionId = parseInt(req.params.sessionId);
  const { message } = req.body as { message: string };

  if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  // Verify session ownership
  const [session] = await db.select().from(aiSessionsTable)
    .where(and(eq(aiSessionsTable.id, sessionId), eq(aiSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Check monthly token limit
  const [limit] = await db.select().from(aiUserLimitsTable).where(eq(aiUserLimitsTable.userId, userId));
  if (limit?.monthlyTokenLimit) {
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const [usage] = await db.select({ total: sum(aiUsageLogsTable.totalTokens) })
      .from(aiUsageLogsTable)
      .where(and(eq(aiUsageLogsTable.userId, userId), gte(aiUsageLogsTable.createdAt, startOfMonth)));
    const usedTokens = Number(usage?.total ?? 0);
    if (usedTokens >= limit.monthlyTokenLimit) {
      res.status(429).json({ error: "Monthly token limit reached. Contact admin to increase your limit." });
      return;
    }
  }

  // Load history
  const history = await db.select().from(aiMessagesTable)
    .where(eq(aiMessagesTable.sessionId, sessionId))
    .orderBy(aiMessagesTable.createdAt);

  // Save user message
  await db.insert(aiMessagesTable).values({ sessionId, role: "user", content: message });

  const intent = classifyIntent(message);
  const { provider, model, label } = getProvider(intent);

  // Update session title if first message
  if (history.length === 0) {
    const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
    await db.update(aiSessionsTable).set({ title, updatedAt: new Date() }).where(eq(aiSessionsTable.id, sessionId));
  } else {
    await db.update(aiSessionsTable).set({ updatedAt: new Date() }).where(eq(aiSessionsTable.id, sessionId));
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send routing info
  res.write(`data: ${JSON.stringify({ routing: { provider, model, label, intent } })}\n\n`);

  let fullResponse = "";
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    if (intent === "image") {
      const { b64_json, mimeType } = await generateImage(message);
      fullResponse = `[IMAGE:${mimeType}:${b64_json}]`;
      promptTokens = Math.ceil(message.length / 4);
      completionTokens = 500;
      res.write(`data: ${JSON.stringify({ image: { b64_json, mimeType } })}\n\n`);
    } else if (provider === "anthropic") {
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const stream = anthropic.messages.stream({
        model,
        max_tokens: 8192,
        system: "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks.",
        messages: chatMessages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
        }
        if (event.type === "message_delta" && "usage" in event) {
          completionTokens = (event as any).usage?.output_tokens ?? 0;
        }
        if (event.type === "message_start" && "message" in event) {
          promptTokens = (event as any).message?.usage?.input_tokens ?? 0;
        }
      }
    } else if (provider === "gemini") {
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role === "assistant" ? "model" as const : "user" as const, parts: [{ text: m.content }] }));
      chatMessages.push({ role: "user", parts: [{ text: message }] });

      const stream = await geminiAi.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: chatMessages,
        config: { maxOutputTokens: 8192, systemInstruction: "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks." },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
      promptTokens = Math.ceil(message.length / 4);
      completionTokens = Math.ceil(fullResponse.length / 4);
    } else {
      // OpenAI
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const stream = await openai.chat.completions.create({
        model,
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: "system", content: "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks." },
          ...chatMessages,
        ],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }
    }

    // Save assistant message
    await db.insert(aiMessagesTable).values({
      sessionId,
      role: "assistant",
      content: fullResponse,
      provider,
      model,
      intentType: intent,
      promptTokens,
      completionTokens,
    });

    // Log usage
    const totalTokens = promptTokens + completionTokens;
    const estimatedCostUsd = estimateCostUsd(provider, model, promptTokens, completionTokens).toFixed(6);
    await db.insert(aiUsageLogsTable).values({
      userId,
      provider,
      model,
      intentType: intent,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
    });

    res.write(`data: ${JSON.stringify({ done: true, tokens: totalTokens })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message ?? "Unknown error" })}\n\n`);
  }

  res.end();
});

router.post("/feedback", requireToolUser, async (req: Request, res: Response) => {
  const { messageId, feedback } = req.body as { messageId: number; feedback: "up" | "down" };
  await db.update(aiMessagesTable).set({ feedback }).where(eq(aiMessagesTable.id, messageId));
  res.json({ success: true });
});

router.get("/usage/me", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const [usage] = await db.select({
    totalTokens: sum(aiUsageLogsTable.totalTokens),
    totalCost: sum(aiUsageLogsTable.estimatedCostUsd),
  }).from(aiUsageLogsTable)
    .where(and(eq(aiUsageLogsTable.userId, userId), gte(aiUsageLogsTable.createdAt, startOfMonth)));

  const [limitRow] = await db.select().from(aiUserLimitsTable).where(eq(aiUserLimitsTable.userId, userId));
  res.json({
    tokensUsed: Number(usage?.totalTokens ?? 0),
    costUsd: Number(usage?.totalCost ?? 0),
    monthlyLimit: limitRow?.monthlyTokenLimit ?? null,
  });
});

// --- ADMIN ROUTES ---
function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session?.adminId) { res.status(401).json({ error: "Admin required" }); return; }
  next();
}

router.get("/admin/stats", requireAdmin, async (req: Request, res: Response) => {
  const { period = "month" } = req.query as { period?: string };
  let since = new Date(0);
  if (period === "week") { since = new Date(); since.setDate(since.getDate() - 7); }
  else if (period === "month") { since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0); }

  const [overall] = await db.select({
    totalTokens: sum(aiUsageLogsTable.totalTokens),
    totalCost: sum(aiUsageLogsTable.estimatedCostUsd),
  }).from(aiUsageLogsTable).where(gte(aiUsageLogsTable.createdAt, since));

  const byProvider = await db.select({
    provider: aiUsageLogsTable.provider,
    totalTokens: sum(aiUsageLogsTable.totalTokens),
    totalCost: sum(aiUsageLogsTable.estimatedCostUsd),
  }).from(aiUsageLogsTable)
    .where(gte(aiUsageLogsTable.createdAt, since))
    .groupBy(aiUsageLogsTable.provider);

  const activeUsers = await db.select({ count: sql<number>`count(distinct ${aiUsageLogsTable.userId})` })
    .from(aiUsageLogsTable).where(gte(aiUsageLogsTable.createdAt, since));

  res.json({
    totalTokens: Number(overall?.totalTokens ?? 0),
    totalCostUsd: Number(overall?.totalCost ?? 0),
    activeUsers: Number(activeUsers[0]?.count ?? 0),
    byProvider,
  });
});

router.get("/admin/users", requireAdmin, async (req: Request, res: Response) => {
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const users = await db.select({
    id: toolUsersTable.id,
    name: toolUsersTable.name,
    email: toolUsersTable.email,
    tokensUsed: sum(aiUsageLogsTable.totalTokens),
    costUsd: sum(aiUsageLogsTable.estimatedCostUsd),
  }).from(toolUsersTable)
    .leftJoin(
      aiUsageLogsTable,
      and(eq(aiUsageLogsTable.userId, toolUsersTable.id), gte(aiUsageLogsTable.createdAt, startOfMonth))
    )
    .groupBy(toolUsersTable.id, toolUsersTable.name, toolUsersTable.email)
    .orderBy(desc(sum(aiUsageLogsTable.totalTokens)));

  const limits = await db.select().from(aiUserLimitsTable);
  const limitMap = new Map(limits.map(l => [l.userId, l.monthlyTokenLimit]));

  res.json(users.map(u => ({
    ...u,
    tokensUsed: Number(u.tokensUsed ?? 0),
    costUsd: Number(u.costUsd ?? 0),
    monthlyLimit: limitMap.get(u.id) ?? null,
  })));
});

router.put("/admin/users/:id/limit", requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const { monthlyTokenLimit } = req.body as { monthlyTokenLimit: number | null };
  await db.insert(aiUserLimitsTable)
    .values({ userId, monthlyTokenLimit })
    .onConflictDoUpdate({ target: aiUserLimitsTable.userId, set: { monthlyTokenLimit, updatedAt: new Date() } });
  res.json({ success: true });
});

export default router;
