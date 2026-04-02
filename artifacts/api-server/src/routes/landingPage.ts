import { Router, Request, Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

const BUILD_SYSTEM_PROMPT = `You are an expert web developer specializing in beautiful, modern landing pages. 
When the user describes a landing page, generate a COMPLETE, self-contained HTML file with embedded CSS and minimal vanilla JavaScript.

Rules:
- Output ONLY raw HTML — no explanation, no markdown, no code fences, just the HTML document
- Start with <!DOCTYPE html> and end with </html>
- Use modern, clean design with a professional color scheme
- Use CSS variables for theming — dark text on light background by default
- Include smooth scrolling, hover effects, and subtle animations
- Make it mobile-responsive using CSS flexbox/grid
- Use Google Fonts (via @import in CSS) for typography
- Include all sections the user requests (hero, features, pricing, contact, etc.)
- Use placeholder images from https://picsum.photos when images are needed
- If the user says "update" or "change" or "add", incorporate their feedback into the existing HTML
- The HTML must be complete and render properly standalone in an iframe

Sections you can include: Hero, About, Features/Services, Portfolio/Gallery, Testimonials, Pricing, FAQ, Team, Contact Form, Footer.`;

const CHAT_SYSTEM_PROMPT = `You are Advantix AI, a friendly expert assistant specializing in landing pages, web design, and digital marketing. 
You help users plan, design, and build landing pages using the Landing Page Builder.

You can:
- Answer questions about landing page best practices, design, copywriting, and conversion optimization
- Give advice on color schemes, layouts, typography, and user experience
- Help users plan what sections to include in their page
- Discuss web development concepts
- Have natural conversations about their project goals

When users are ready to build their page, remind them to describe what they want and you'll generate it instantly.
Keep responses concise, helpful, and friendly. Use markdown for formatting when helpful.`;

async function streamSSE(
  res: Response,
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  maxTokens = 4096
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message || "Something went wrong" })}\n\n`);
    res.end();
  }
}

router.post("/landing-page/chat", async (req: Request, res: Response) => {
  const { prompt, messages: history } = req.body as {
    prompt: string;
    messages?: { role: "user" | "assistant"; content: string }[];
  };

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const conversationMessages: { role: "user" | "assistant"; content: string }[] = [];

  if (history && Array.isArray(history)) {
    for (const m of history.slice(-8)) {
      conversationMessages.push({
        role: m.role,
        content: m.role === "assistant" && m.content.length > 500
          ? "[Previously generated landing page HTML]"
          : m.content,
      });
    }
  }

  conversationMessages.push({ role: "user", content: prompt });

  await streamSSE(res, conversationMessages, CHAT_SYSTEM_PROMPT, 1024);
});

router.post("/landing-page/generate", async (req: Request, res: Response) => {
  const { prompt, currentHtml, messages: history } = req.body as {
    prompt: string;
    currentHtml?: string;
    messages?: { role: "user" | "assistant"; content: string }[];
  };

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const userContent = currentHtml
    ? `Here is the current landing page HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nUser request: ${prompt}`
    : prompt;

  const conversationMessages: { role: "user" | "assistant"; content: string }[] = [];

  if (history && Array.isArray(history)) {
    for (const m of history.slice(-4)) {
      conversationMessages.push({
        role: m.role,
        content: m.role === "assistant" && m.content.startsWith("<!DOCTYPE")
          ? `[Previous HTML generation - ${m.content.length} chars]`
          : m.content,
      });
    }
  }

  conversationMessages.push({ role: "user", content: userContent });

  await streamSSE(res, conversationMessages, BUILD_SYSTEM_PROMPT, 8192);
});

export default router;
