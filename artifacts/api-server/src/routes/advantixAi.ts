import { Router, Request, Response } from "express";
import { eq, desc, sum, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiProjectsTable,
  aiSessionsTable,
  aiMessagesTable,
  aiUsageLogsTable,
  aiUserLimitsTable,
  aiMemoriesTable,
  toolUsersTable,
  integrationsTable,
} from "@workspace/db/schema";
import { createAnthropic } from "@workspace/integrations-anthropic-ai";
import { createGemini } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { createOpenAI } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ── DB key helpers ─────────────────────────────────────────────────────────────
async function getDbKey(name: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, name));
    return row?.value || null;
  } catch {
    return null;
  }
}

async function getGrokKey(): Promise<string | null> {
  return getDbKey("GROK_API_KEY");
}

async function getOpenRouterKey(): Promise<string | null> {
  return getDbKey("OPENROUTER_API_KEY") ?? process.env.OPENROUTER_API_KEY ?? null;
}

async function getOpenRouter() {
  const key = await getOpenRouterKey();
  if (!key) throw new Error("OpenRouter API key not configured. Add OPENROUTER_API_KEY in Admin → Integrations.");
  return createOpenAI(key, "https://openrouter.ai/api/v1");
}

async function getOpenAI() {
  const key = await getDbKey("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured. Add OPENAI_API_KEY in Admin → Integrations.");
  return createOpenAI(key);
}

async function getAnthropic() {
  const key = await getDbKey("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY ?? process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key not configured. Add ANTHROPIC_API_KEY in Admin → Integrations.");
  return createAnthropic(key);
}

async function getGemini() {
  const key = await getDbKey("GOOGLE_AI_API_KEY") ?? process.env.GOOGLE_AI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!key) throw new Error("Google AI API key not configured. Add GOOGLE_AI_API_KEY in Admin → Integrations.");
  return createGemini(key);
}

async function getGeminiKey(): Promise<string | null> {
  return await getDbKey("GOOGLE_AI_API_KEY") ?? process.env.GOOGLE_AI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? null;
}

type IntentType = "image" | "code" | "reasoning" | "realtime" | "general";

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

  // Realtime/search intent — news, current events, live data
  if (
    /(latest|recent|current|today'?s?|right now|live|breaking|news|what'?s happening|what is happening|trending|update|updates|stock price|weather|sports score|election|who won|who is winning|in \d{4}|this (week|month|year))/i.test(lower) ||
    /^(what('?s| is) (the )?(latest|current|today|happening|news|price|weather|score|result|status|situation))/i.test(lower) ||
    /(search (the web|online|internet)|find (the latest|recent|current)|look up|real.?time|real time)/i.test(lower)
  ) {
    return "realtime";
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
    case "realtime":
      return { provider: "openai-search", model: "gpt-4o-search-preview", label: "GPT-4o Search" };
    case "general":
    default:
      return { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" };
  }
}

function buildSystemPrompt(projectInstructions: string, base: string, memoriesContext = ""): string {
  let prompt = base;
  if (memoriesContext) prompt += memoriesContext;
  if (projectInstructions) prompt = `${projectInstructions}\n\n---\n\n${prompt}`;
  return prompt;
}

function estimateCostUsd(provider: string, model: string, promptTokens: number, completionTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.0000025, output: 0.00001 },
    "gpt-4o-search-preview": { input: 0.0000025, output: 0.00001 },
    "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
    "claude-sonnet-4-6": { input: 0.000003, output: 0.000015 },
    "claude-opus-4-6": { input: 0.000015, output: 0.000075 },
    "claude-haiku-4-5": { input: 0.00000025, output: 0.00000125 },
    "gemini-2.5-flash": { input: 0.0000003, output: 0.0000025 },
    "gemini-2.5-flash-image": { input: 0.0000003, output: 0.0000025 },
    "grok-3": { input: 0.000003, output: 0.000015 },
    "grok-3-mini": { input: 0.0000003, output: 0.0000005 },
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

// ─── Projects CRUD ───────────────────────────────────────────────────────────

router.get("/projects", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const projects = await db
    .select()
    .from(aiProjectsTable)
    .where(eq(aiProjectsTable.userId, userId))
    .orderBy(desc(aiProjectsTable.updatedAt));
  res.json(projects);
});

router.post("/projects", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const { name, instructions, emoji } = req.body as { name: string; instructions?: string; emoji?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Project name required" }); return; }
  const [project] = await db
    .insert(aiProjectsTable)
    .values({ userId, name: name.trim(), instructions: instructions?.trim() ?? "", emoji: emoji ?? "📁" })
    .returning();
  res.json(project);
});

router.put("/projects/:id", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const id = parseInt(req.params.id);
  const { name, instructions, emoji } = req.body as { name?: string; instructions?: string; emoji?: string };
  const [existing] = await db.select().from(aiProjectsTable).where(and(eq(aiProjectsTable.id, id), eq(aiProjectsTable.userId, userId)));
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const [updated] = await db
    .update(aiProjectsTable)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(instructions !== undefined && { instructions: instructions.trim() }),
      ...(emoji !== undefined && { emoji }),
      updatedAt: new Date(),
    })
    .where(eq(aiProjectsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/projects/:id", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const id = parseInt(req.params.id);
  await db.delete(aiProjectsTable).where(and(eq(aiProjectsTable.id, id), eq(aiProjectsTable.userId, userId)));
  res.json({ success: true });
});

// ─── Memories CRUD ───────────────────────────────────────────────────────────

router.get("/memories", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const memories = await db
    .select()
    .from(aiMemoriesTable)
    .where(eq(aiMemoriesTable.userId, userId))
    .orderBy(desc(aiMemoriesTable.createdAt));
  res.json(memories);
});

router.post("/memories", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }
  const [memory] = await db
    .insert(aiMemoriesTable)
    .values({ userId, content: content.trim(), source: "manual" })
    .returning();
  res.json(memory);
});

router.put("/memories/:id", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const id = parseInt(req.params.id);
  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }
  const [updated] = await db
    .update(aiMemoriesTable)
    .set({ content: content.trim(), updatedAt: new Date() })
    .where(and(eq(aiMemoriesTable.id, id), eq(aiMemoriesTable.userId, userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json(updated);
});

router.delete("/memories/:id", requireToolUser, async (req: Request, res: Response) => {
  const userId = req.session!.toolUserId as number;
  const id = parseInt(req.params.id);
  await db.delete(aiMemoriesTable).where(and(eq(aiMemoriesTable.id, id), eq(aiMemoriesTable.userId, userId)));
  res.json({ success: true });
});

// ─── Sessions ────────────────────────────────────────────────────────────────

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
  const { projectId } = req.body as { projectId?: number };
  const [session] = await db
    .insert(aiSessionsTable)
    .values({ userId, title: "New Chat", projectId: projectId ?? null })
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
  const { message, imageData } = req.body as {
    message: string;
    imageData?: { base64: string; mimeType: string };
  };

  if (!message?.trim() && !imageData) { res.status(400).json({ error: "Message required" }); return; }

  const messageText = message?.trim() || "What's in this image?";

  // Verify session ownership
  const [session] = await db.select().from(aiSessionsTable)
    .where(and(eq(aiSessionsTable.id, sessionId), eq(aiSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Load project instructions (if session belongs to a project)
  let projectInstructions = "";
  if (session.projectId) {
    const [project] = await db.select().from(aiProjectsTable).where(eq(aiProjectsTable.id, session.projectId));
    if (project?.instructions?.trim()) {
      projectInstructions = project.instructions.trim();
    }
  }

  // Load user memories
  const userMemories = await db
    .select()
    .from(aiMemoriesTable)
    .where(eq(aiMemoriesTable.userId, userId))
    .orderBy(desc(aiMemoriesTable.createdAt))
    .limit(30);
  const memoriesContext = userMemories.length > 0
    ? `\n\nAbout this user (remembered from past conversations):\n${userMemories.map(m => `- ${m.content}`).join("\n")}`
    : "";

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

  // Load history — limit to last 10 messages to control token cost
  const history = (await db.select().from(aiMessagesTable)
    .where(eq(aiMessagesTable.sessionId, sessionId))
    .orderBy(aiMessagesTable.createdAt)).slice(-10);

  // Save user message (store image inline for history reference)
  const savedUserContent = imageData
    ? `[IMAGE:${imageData.mimeType}:${imageData.base64}]\n${messageText}`
    : messageText;
  await db.insert(aiMessagesTable).values({ sessionId, role: "user", content: savedUserContent });

  // If image is attached, route to GPT-4o vision regardless of intent
  const intent = imageData ? "general" : classifyIntent(messageText);

  /* Prefer OpenRouter for text generation when its key is configured */
  const openRouterKey = await getOpenRouterKey();
  const useOpenRouter = !!openRouterKey && !imageData && intent !== "image" && intent !== "realtime";

  const { provider, model, label } = imageData
    ? { provider: "openai-vision", model: "gpt-4o", label: "GPT-4o Vision" }
    : useOpenRouter
      ? { provider: "openrouter", model: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet (OpenRouter)" }
      : getProvider(intent);

  // Update session title if first message
  if (history.length === 0) {
    const title = messageText.slice(0, 60) + (messageText.length > 60 ? "..." : "");
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
    if (imageData) {
      // GPT-4o Vision — multimodal image + text input
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const visionContent: any[] = [
        { type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.base64}` } },
        { type: "text", text: messageText },
      ];
      chatMessages.push({ role: "user", content: visionContent as any });

      const stream = await (await getOpenAI()).chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(projectInstructions, "You are Advantix AI, a highly capable visual assistant. Analyze images carefully and provide detailed, accurate descriptions and answers. Be concise and helpful.", memoriesContext) },
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
      if (!promptTokens) { promptTokens = Math.ceil(messageText.length / 4) + 800; completionTokens = Math.ceil(fullResponse.length / 4); }
    } else if (intent === "image") {
      const geminiKey = await getGeminiKey();
      if (!geminiKey) throw new Error("Google AI API key not configured. Add GOOGLE_AI_API_KEY in Admin → Integrations.");
      const { b64_json, mimeType } = await generateImage(message, geminiKey);
      fullResponse = `[IMAGE:${mimeType}:${b64_json}]`;
      promptTokens = Math.ceil(message.length / 4);
      completionTokens = 500;
      res.write(`data: ${JSON.stringify({ image: { b64_json, mimeType } })}\n\n`);
    } else if (provider === "openrouter") {
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const stream = await (await getOpenRouter()).chat.completions.create({
        model,
        max_tokens: 2048,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(projectInstructions, "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks.", memoriesContext) },
          ...chatMessages,
        ],
      } as any);

      for await (const chunk of (stream as any)) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
      }
      if (!promptTokens) { promptTokens = Math.ceil(message.length / 4); completionTokens = Math.ceil(fullResponse.length / 4); }
    } else if (provider === "anthropic") {
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const stream = (await getAnthropic()).messages.stream({
        model,
        max_tokens: 8192,
        system: buildSystemPrompt(projectInstructions, "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks.", memoriesContext),
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

      const stream = await (await getGemini()).models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: chatMessages,
        config: { maxOutputTokens: 8192, systemInstruction: buildSystemPrompt(projectInstructions, "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks.", memoriesContext) },
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
    } else if (provider === "grok") {
      const grokKey = await getGrokKey();
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      if (!grokKey) {
        // Grok key not configured — fall back to GPT-4o-mini with a note
        res.write(`data: ${JSON.stringify({ routing: { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini (Grok not configured)", intent } })}\n\n`);
        const fallbackStream = await (await getOpenAI()).chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 8192,
          stream: true,
          messages: [
            { role: "system", content: buildSystemPrompt(projectInstructions, "You are Advantix AI. Note: Real-time search via Grok is not configured — add a GROK_API_KEY in Admin > Integrations to enable live search. Answer based on your training data and clearly state your knowledge cutoff.", memoriesContext) },
            ...chatMessages,
          ],
        });
        for await (const chunk of fallbackStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) { fullResponse += delta; res.write(`data: ${JSON.stringify({ content: delta })}\n\n`); }
          if (chunk.usage) { promptTokens = chunk.usage.prompt_tokens; completionTokens = chunk.usage.completion_tokens; }
        }
      } else {
        // Stream from xAI Grok using fetch (OpenAI-compatible SSE)
        const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${grokKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            stream: true,
            search_enabled: true,
            messages: [
              { role: "system", content: buildSystemPrompt(projectInstructions, "You are Advantix AI powered by Grok with live internet access. Use real-time search to find the latest news, current events, and live data. Always include today's date context. Cite sources when possible. Be concise and accurate.", memoriesContext) },
              ...chatMessages,
            ],
          }),
        });

        if (!grokRes.ok) {
          const errText = await grokRes.text();
          throw new Error(`Grok API error ${grokRes.status}: ${errText}`);
        }

        // Read SSE stream from Grok
        const reader = grokRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) { fullResponse += delta; res.write(`data: ${JSON.stringify({ content: delta })}\n\n`); }
              if (parsed.usage) { promptTokens = parsed.usage.prompt_tokens ?? 0; completionTokens = parsed.usage.completion_tokens ?? 0; }
            } catch { /* skip malformed chunks */ }
          }
        }
        if (!promptTokens) { promptTokens = Math.ceil(message.length / 4); completionTokens = Math.ceil(fullResponse.length / 4); }
      }
    } else if (provider === "openai-search") {
      // Real-time search: fetch live news via Google News RSS, inject as context, then stream via GPT-4o
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

      // Fetch live news headlines from Google News RSS (no API key required)
      let newsContext = "";
      try {
        const encodedQuery = encodeURIComponent(message.slice(0, 100));
        const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`;
        const rssRes = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (rssRes.ok) {
          const xml = await rssRes.text();
          const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
          const parsed = items.slice(0, 8).map(item => {
            const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? "";
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
            const source = (item.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/) ?? item.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim() ?? "";
            return title ? `• ${title}${source ? ` — ${source}` : ""}${pubDate ? ` (${pubDate})` : ""}` : null;
          }).filter(Boolean);
          if (parsed.length > 0) {
            newsContext = `\n\n[Live web search results as of ${today}]:\n${parsed.join("\n")}\n\nUse the above real-time information to answer the user's question accurately. Always mention the sources and dates.`;
          }
        }
      } catch { /* ignore fetch errors, proceed without news context */ }

      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const systemContent = buildSystemPrompt(
        projectInstructions,
        `You are Advantix AI, a highly capable assistant. Today's date is ${today}. You have access to real-time news data. Always provide accurate, up-to-date information with source citations. Be concise and helpful.${newsContext}`,
        memoriesContext
      );

      const stream = await (await getOpenAI()).chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        stream: true,
        messages: [
          { role: "system", content: systemContent },
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
      if (!promptTokens) { promptTokens = Math.ceil(message.length / 4); completionTokens = Math.ceil(fullResponse.length / 4); }
    } else {
      // OpenAI (streaming)
      const chatMessages = history
        .filter(m => m.role === "user" || m.role === "assistant")
        .filter(m => !m.content.startsWith("[IMAGE:"))
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      chatMessages.push({ role: "user", content: message });

      const stream = await (await getOpenAI()).chat.completions.create({
        model,
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(projectInstructions, "You are Advantix AI, a highly capable assistant. Be concise, precise, and helpful. For code, always use proper formatting with code blocks.", memoriesContext) },
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

  // Auto-extract memories from user message (non-blocking, runs after response)
  extractAndSaveMemories(userId, message).catch(() => {});
});

async function extractAndSaveMemories(userId: number, userMessage: string): Promise<void> {
  if (userMessage.length < 10) return;

  const extractionPrompt = `Analyze this user message and extract any personal facts worth remembering for future conversations (e.g. their name, profession, location, preferences, hobbies, goals, family info, languages spoken, skills, or any other personal details they mention).

Return ONLY a valid JSON array of short strings (max 120 chars each). Each string is a concise memory fact starting with "User". Return an empty array [] if there's nothing personal worth remembering. Do not include generic statements.

Examples of good memories:
- "User's name is Tanvir"
- "User prefers React with TypeScript"
- "User is from Bangladesh"
- "User works as a software engineer"

User message: "${userMessage.replace(/"/g, "'")}"`

  try {
    const openaiClient = await getOpenAI().catch(() => null);
    if (!openaiClient) return;
    const res = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0,
      messages: [{ role: "user", content: extractionPrompt }],
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const facts: string[] = JSON.parse(match[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    // Load existing memories to avoid duplicates
    const existing = await db.select({ content: aiMemoriesTable.content }).from(aiMemoriesTable).where(eq(aiMemoriesTable.userId, userId));
    const existingSet = new Set(existing.map(m => m.content.toLowerCase()));

    for (const fact of facts) {
      const trimmed = fact.trim();
      if (!trimmed || trimmed.length > 200) continue;
      if (existingSet.has(trimmed.toLowerCase())) continue;
      await db.insert(aiMemoriesTable).values({ userId, content: trimmed, source: "auto" });
    }
  } catch {
    // Silently ignore extraction failures
  }
}

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
    monthlyTokenLimit: limitRow?.monthlyTokenLimit ?? null,
    monthlyUsdLimit: limitRow?.monthlyUsdLimit != null ? Number(limitRow.monthlyUsdLimit) : null,
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
  const limitMap = new Map(limits.map(l => [l.userId, l]));

  res.json(users.map(u => {
    const lim = limitMap.get(u.id);
    return {
      ...u,
      tokensUsed: Number(u.tokensUsed ?? 0),
      costUsd: Number(u.costUsd ?? 0),
      monthlyTokenLimit: lim?.monthlyTokenLimit ?? null,
      monthlyUsdLimit: lim?.monthlyUsdLimit != null ? Number(lim.monthlyUsdLimit) : null,
    };
  }));
});

router.put("/admin/users/:id/limit", requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const { monthlyTokenLimit, monthlyUsdLimit } = req.body as {
    monthlyTokenLimit?: number | null;
    monthlyUsdLimit?: number | null;
  };
  await db.insert(aiUserLimitsTable)
    .values({ userId, monthlyTokenLimit: monthlyTokenLimit ?? null, monthlyUsdLimit: monthlyUsdLimit?.toString() ?? null })
    .onConflictDoUpdate({
      target: aiUserLimitsTable.userId,
      set: {
        monthlyTokenLimit: monthlyTokenLimit ?? null,
        monthlyUsdLimit: monthlyUsdLimit?.toString() ?? null,
        updatedAt: new Date(),
      },
    });
  res.json({ success: true });
});

export default router;
