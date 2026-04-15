import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { createAnthropic } from "@workspace/integrations-anthropic-ai";
import { createOpenAI } from "@workspace/integrations-openai-ai-server";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

async function getDbKey(name: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, name));
    return row?.value || null;
  } catch { return null; }
}

async function getAnthropic() {
  const key = await getDbKey("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY ?? process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key not configured.");
  return createAnthropic(key);
}

async function getOpenAI() {
  const key = await getDbKey("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured.");
  return createOpenAI(key);
}

async function getGeminiKey(): Promise<string | null> {
  return await getDbKey("GOOGLE_AI_API_KEY") ?? process.env.GOOGLE_AI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? null;
}

/* ═══════════════════════════════════════════════════
   PLATFORM PROFILES
═══════════════════════════════════════════════════ */
const PLATFORM_PROFILES: Record<string, {
  name: string; charLimit: number; hashtagLimit: number;
  systemInstructions: string; outputFormat: string;
}> = {
  instagram: {
    name: "Instagram",
    charLimit: 2200,
    hashtagLimit: 30,
    systemInstructions: `You are an elite Instagram content strategist. Instagram's algorithm rewards content that gets saves and shares over likes. Create content that STOPS the scroll.

INSTAGRAM VIRAL RULES:
- First 1-2 lines are the HOOK — must create curiosity or emotion before "more" is clicked
- Use line breaks every 1-2 lines for breathing room (white space increases readability by 40%)
- Storytelling arc: Hook → Context → Value → CTA
- End with a question or strong CTA to boost comments
- Hashtags: 5-10 niche hashtags, not just popular ones. Place as a block at the very end
- Emojis: Use sparingly but strategically — 1 per key point max
- Tone: Aspirational, value-driven, behind-the-scenes feel converts best
- AVOID: Starting with "We", generic phrases, hashtag stuffing`,
    outputFormat: `Return a JSON object with:
{
  "post": "the full caption with line breaks using \\n",
  "hashtags": ["array", "of", "hashtags", "without", "#"],
  "hook": "the opening hook line extracted",
  "cta": "the call to action",
  "charCount": number,
  "viralTip": "one specific tip why this will perform well on Instagram"
}`,
  },
  facebook: {
    name: "Facebook",
    charLimit: 63206,
    hashtagLimit: 3,
    systemInstructions: `You are an elite Facebook content strategist. Facebook rewards content that sparks meaningful conversations and gets shares.

FACEBOOK VIRAL RULES:
- Open with a bold statement or relatable question — Facebook shows first 3 lines before "See More"
- Longer form performs well — 100-250 words sweet spot for engagement
- Always end with a direct question to drive comments (Facebook's algorithm loves comments)
- 1-3 hashtags max — Facebook's hashtag game is different from Instagram
- Tag relevant pages or locations when applicable
- Personal/emotional stories outperform brand announcements
- Native content (text-only or native video) beats link posts
- CTA should be specific: "Comment YES if..." or "Share this with someone who..."
- Conversational tone — like talking to a friend, not a corporation`,
    outputFormat: `Return a JSON object with:
{
  "post": "the full post text with \\n for line breaks",
  "hashtags": ["1 to 3", "hashtags"],
  "openingHook": "the opening 2-3 lines",
  "engagementQuestion": "the closing question",
  "charCount": number,
  "viralTip": "one specific tip why this will perform well on Facebook"
}`,
  },
  twitter: {
    name: "X (Twitter)",
    charLimit: 280,
    hashtagLimit: 2,
    systemInstructions: `You are an elite X (Twitter) content strategist. X rewards bold, opinionated, timely content. Every word counts.

X VIRAL RULES:
- Under 280 characters — tight, punchy, no filler words
- Power words that trigger emotion: surprising, counterintuitive, controversial (but not offensive)
- Structure: Statement → Evidence OR Hook → Payoff
- Numbers and specifics outperform vague claims ("3x revenue" beats "grew a lot")
- 1-2 hashtags maximum — inline not at the end
- Threads: If the idea needs more space, suggest a thread structure
- Hot takes, contrarian views, and real-time relevance get retweeted
- Avoid: Corporate speak, excessive punctuation, starting with "So..."
- Quote tweets and replies to trending topics extend reach
- End with a question if engagement is the goal`,
    outputFormat: `Return a JSON object with:
{
  "post": "the tweet text (MUST be under 280 characters)",
  "charCount": number,
  "hashtags": ["max 2"],
  "threadSuggestion": "optional: a short outline if this needs a thread",
  "alternativeVersions": ["2 alternative tweet versions"],
  "viralTip": "one specific tip why this will perform well on X"
}`,
  },
  pinterest: {
    name: "Pinterest",
    charLimit: 500,
    hashtagLimit: 20,
    systemInstructions: `You are an elite Pinterest content strategist. Pinterest is a search engine first, social platform second. SEO and visual discovery are everything.

PINTEREST VIRAL RULES:
- Title: 40-60 characters, keyword-rich, benefit-forward ("How to..." or "X Ways to...")
- Description: 150-300 characters, naturally embed 3-5 keywords users search for
- Long-form pins (infographic style 2:3 or 1:2.1 ratio) get 2x more saves
- Seasonal content wins — Pinterest users plan 2-3 months ahead
- "How to", "Ideas", "Inspiration", "DIY", "Tips" are power words
- Include a clear CTA like "Click to learn more" or "Save for later"
- Keywords: Think about what your ideal client would type in search
- Hashtags are less important here — focus on keywords in description
- Niche-specific boards outperform broad ones`,
    outputFormat: `Return a JSON object with:
{
  "title": "pin title (40-60 chars, keyword-rich)",
  "description": "full pin description (150-300 chars)",
  "keywords": ["5-8", "search", "keywords"],
  "hashtags": ["5-10", "hashtags"],
  "boardSuggestion": "suggested Pinterest board name",
  "charCount": number,
  "viralTip": "one specific tip why this will perform well on Pinterest"
}`,
  },
};

/* ═══════════════════════════════════════════════════
   POST: Generate social media post
═══════════════════════════════════════════════════ */
router.post("/api/admin/content/generate-post", requireSuperAdmin, async (req: Request, res: Response) => {
  const { platform, topic, tone, context, brand } = req.body as {
    platform: string; topic: string; tone: string; context?: string; brand?: string;
  };

  if (!platform || !topic) {
    res.status(400).json({ error: "platform and topic are required" });
    return;
  }

  const profile = PLATFORM_PROFILES[platform];
  if (!profile) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }

  const brandContext = brand || "Advantix Digital — a premium digital agency from Dhaka, Bangladesh specializing in web design, development, and digital marketing.";
  const toneGuide: Record<string, string> = {
    professional: "Authoritative, polished, industry-expert voice. Confident but not arrogant.",
    casual: "Friendly, approachable, relatable. Like a smart friend giving advice.",
    hype: "Energetic, bold, exclamation-worthy. Creates FOMO and excitement.",
    minimal: "Quiet confidence. Short sentences. White space. Let the idea breathe.",
    storytelling: "Narrative-driven. Past → Present → Future or Problem → Journey → Resolution.",
  };

  const systemPrompt = `${profile.systemInstructions}

BRAND CONTEXT: ${brandContext}
${context ? `ADDITIONAL CONTEXT: ${context}` : ""}

TONE: ${toneGuide[tone] || toneGuide.professional}

CHARACTER LIMIT: ${profile.charLimit} characters
HASHTAG LIMIT: ${profile.hashtagLimit}

${profile.outputFormat}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanation.`;

  try {
    const anthropic = await getAnthropic();
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [
        { role: "user", content: `Create a ${profile.name} post about: ${topic}` }
      ],
      system: systemPrompt,
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { post: raw };
    }

    res.json({ success: true, platform, profile: profile.name, data: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    res.status(500).json({ error: msg });
  }
});

/* ═══════════════════════════════════════════════════
   POST: Generate image (text → image)
═══════════════════════════════════════════════════ */
router.post("/api/admin/content/generate-image", requireSuperAdmin, async (req: Request, res: Response) => {
  const { prompt, style, platform } = req.body as {
    prompt: string; style?: string; platform?: string;
  };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const styleGuides: Record<string, string> = {
    photography: "Ultra-realistic professional photography, sharp details, cinematic lighting",
    illustration: "Clean digital illustration, flat design aesthetic, modern vector art style",
    minimal: "Minimalist design, clean white space, simple geometric shapes, Scandinavian design aesthetic",
    cinematic: "Cinematic film quality, dramatic lighting, moody atmosphere, wide-angle lens",
    gradient: "Bold gradient background, vibrant colors, modern digital art, abstract fluid shapes",
    brand: "Professional brand photography, clean background, premium product feel",
  };

  const styleGuide = styleGuides[style || "photography"] || styleGuides.photography;

  const enhancedPrompt = `${styleGuide}. ${prompt}. Social media optimized, high quality, visually striking, ${platform ? `optimized for ${platform}` : "versatile aspect ratio"}.`;

  try {
    // Try Gemini image generation first
    const geminiKey = await getGeminiKey();
    if (geminiKey) {
      try {
        const { b64_json, mimeType } = await generateImage(enhancedPrompt, geminiKey);
        res.json({ success: true, b64_json, mimeType: mimeType || "image/png", source: "gemini" });
        return;
      } catch {
        // fall through to OpenAI
      }
    }

    // Fallback to OpenAI DALL-E
    const openai = await getOpenAI();
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt.slice(0, 3900),
      n: 1,
      size: "1024x1024",
      quality: "hd",
      response_format: "b64_json",
    });

    const b64 = response.data[0]?.b64_json;
    if (!b64) throw new Error("No image generated");

    res.json({ success: true, b64_json: b64, mimeType: "image/png", source: "dall-e-3" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: msg });
  }
});

/* ═══════════════════════════════════════════════════
   POST: Analyze image and generate content ideas
═══════════════════════════════════════════════════ */
router.post("/api/admin/content/analyze-image", requireSuperAdmin, async (req: Request, res: Response) => {
  const { imageBase64, mimeType, platform, tone } = req.body as {
    imageBase64: string; mimeType: string; platform?: string; tone?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const targetPlatform = platform || "all platforms";
  const systemPrompt = `You are an elite social media content strategist with a superpower: you can look at any image and instantly generate viral content ideas optimized for ${targetPlatform}.

Analyze the image and produce:
1. What the image shows (brief description)
2. 3 viral caption ideas for ${targetPlatform} — each with a different emotional angle (curiosity, aspiration, relatability)
3. 10 hashtag suggestions relevant to the image content
4. Best content hook (the opening line that will stop the scroll)
5. Recommended post style: storytelling / educational / promotional / behind-the-scenes

Return ONLY this JSON:
{
  "imageDescription": "what you see in the image",
  "captions": [
    { "angle": "curiosity", "caption": "...", "hook": "..." },
    { "angle": "aspiration", "caption": "...", "hook": "..." },
    { "angle": "relatability", "caption": "...", "hook": "..." }
  ],
  "hashtags": ["10 relevant hashtags without #"],
  "bestHook": "single best opening line",
  "recommendedStyle": "storytelling | educational | promotional | behind-the-scenes",
  "platformTip": "specific tip for ${targetPlatform}"
}`;

  try {
    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            {
              type: "text",
              text: `Analyze this image and generate social media content for ${targetPlatform}. Tone: ${tone || "professional"}.`,
            },
          ],
        },
      ],
      system: systemPrompt,
    } as Parameters<typeof openai.chat.completions.create>[0]);

    const raw = response.choices[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { captions: [], hashtags: [], imageDescription: raw };
    }

    res.json({ success: true, data: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
