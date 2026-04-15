import { Router, type IRouter } from "express";
import { createOpenAI } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { aiLimiter } from "../lib/rateLimiter.js";

const router: IRouter = Router();

async function getOpenAI() {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, "OPENAI_API_KEY"));
    const key = row?.value || process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!key) return null;
    return createOpenAI(key);
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a helpful assistant for Advantix Digital (advantix.digital). 

Advantix Digital is a full-service digital agency based in Bangladesh that provides:
- Custom CRM Development
- Website Design & Development
- Sales Page Design
- E-commerce Solutions
- Python Bots & Automation
- Custom Python Programs
- Team Management Solutions
- Virtual Assistant Services
- Graphics Design
- Facebook & Social Media Marketing
- Social Media Management
- Data Entry Services

Our agency helps businesses grow through digital solutions. We specialize in:
- Building custom software tailored to client needs
- Creating marketing strategies that convert
- Managing social media presence
- Automating business processes

When answering questions:
- Be friendly, professional, and helpful
- If asked about pricing, say to contact us for a custom quote via the contact form
- If asked about turnaround time, say it depends on project scope and to contact us for details
- Always encourage visitors to reach out via the contact form or email
- Keep responses concise and relevant

If you don't know something specific about Advantix, be honest but still be helpful.`;

function buildMessages(
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (conversationHistory && Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  messages.push({ role: "user", content: message });
  return messages;
}

router.post("/chat", aiLimiter, async (req, res) => {
  const { message, conversationHistory } = req.body as {
    message?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const openai = await getOpenAI();
  if (!openai) {
    res.status(503).json({ error: "AI service not configured. Please contact the administrator." });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: buildMessages(message, conversationHistory),
    });

    const reply = completion.choices[0]?.message?.content ?? "I'm sorry, I couldn't process your request.";
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "AI service error" });
  }
});

router.post("/chat/stream", aiLimiter, async (req, res) => {
  const { message, conversationHistory } = req.body as {
    message?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const openai = await getOpenAI();
  if (!openai) {
    res.write(`data: ${JSON.stringify({ error: "AI service not configured. Add OPENAI_API_KEY in Admin → Integrations." })}\n\n`);
    res.end();
    return;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: buildMessages(message, conversationHistory),
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
