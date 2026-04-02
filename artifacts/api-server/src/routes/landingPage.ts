import { Router, Request, Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

const SYSTEM_PROMPT = `You are an expert web developer specializing in beautiful, modern landing pages. 
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const userContent = currentHtml
    ? `Here is the current landing page HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nUser request: ${prompt}`
    : prompt;

  const conversationMessages: { role: "user" | "assistant"; content: string }[] = [];

  if (history && Array.isArray(history) && history.length > 0) {
    conversationMessages.push(...history.slice(-6));
  }

  conversationMessages.push({ role: "user", content: userContent });

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: conversationMessages,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        const text = chunk.delta.text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message || "Generation failed" })}\n\n`);
    res.end();
  }
});

export default router;
