/**
 * Shared AI reply helper for Facebook auto-reply.
 *
 * Reads the active provider + model from the `integrations` table (settings
 * `FB_AUTOREPLY_PROVIDER`, `FB_AUTOREPLY_MODEL`), and the API key for that
 * provider from the same table (with `process.env.<NAME>` as fallback so
 * existing deployments that set keys via env still work).
 *
 * Default: OpenRouter + `z-ai/glm-4.6`.
 */
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type AiProvider = "openrouter" | "openai" | "anthropic" | "gemini" | "grok";

const PROVIDER_KEY_NAMES: Record<AiProvider, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai:     "OPENAI_API_KEY",
  anthropic:  "ANTHROPIC_API_KEY",
  gemini:     "GEMINI_API_KEY",
  grok:       "GROK_API_KEY",
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: "z-ai/glm-4.6",
  openai:     "gpt-4o-mini",
  anthropic:  "claude-3-5-haiku-latest",
  gemini:     "gemini-2.0-flash",
  grok:       "grok-2-latest",
};

export interface FbAutoReplyConfig {
  provider: AiProvider;
  model: string;
  apiKey: string | null;
  apiKeyConfigured: boolean;
}

/** Read a setting value: prefer the integrations table (admin-managed source
 *  of truth), fall back to process.env so old deployments still work. */
async function readSetting(name: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, name));
    const v = row?.value?.trim();
    if (v) return v;
  } catch { /* fall through to env */ }
  const env = process.env[name]?.trim();
  return env || null;
}

/** Resolve which provider + model + key to use for FB auto-reply right now. */
export async function getFbAutoReplyConfig(): Promise<FbAutoReplyConfig> {
  const providerRaw = (await readSetting("FB_AUTOREPLY_PROVIDER")) ?? "openrouter";
  const provider = (Object.keys(PROVIDER_KEY_NAMES) as AiProvider[])
    .includes(providerRaw as AiProvider) ? providerRaw as AiProvider : "openrouter";
  const model = (await readSetting("FB_AUTOREPLY_MODEL")) ?? DEFAULT_MODELS[provider];
  const apiKey = await readSetting(PROVIDER_KEY_NAMES[provider]);
  return { provider, model, apiKey, apiKeyConfigured: !!apiKey };
}

/** Generate a reply using the configured provider. Returns "" on any failure
 *  (caller treats empty as "no reply" and surfaces it in diagnostics). */
export async function generateFbAutoReply(instructions: string, userMessage: string): Promise<string> {
  const cfg = await getFbAutoReplyConfig();
  if (!cfg.apiKey) return "";

  const messages = [
    { role: "system", content: instructions },
    { role: "user", content: userMessage },
  ];

  try {
    if (cfg.provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.apiKey}`,
          "HTTP-Referer": "https://advantix.digital",
          "X-Title": "Advantix FB Auto-Reply",
        },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) { console.warn("[FB AI] OpenRouter error:", d.error.message); return ""; }
      return d.choices?.[0]?.message?.content?.trim() ?? "";
    }

    if (cfg.provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) { console.warn("[FB AI] OpenAI error:", d.error.message); return ""; }
      return d.choices?.[0]?.message?.content?.trim() ?? "";
    }

    if (cfg.provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model, max_tokens: 500, system: instructions,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      const d = await r.json() as { content?: Array<{ text?: string }>; error?: { message?: string } };
      if (d.error) { console.warn("[FB AI] Anthropic error:", d.error.message); return ""; }
      return d.content?.[0]?.text?.trim() ?? "";
    }

    if (cfg.provider === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: { maxOutputTokens: 500 },
          }),
        }
      );
      const d = await r.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };
      if (d.error) { console.warn("[FB AI] Gemini error:", d.error.message); return ""; }
      return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }

    if (cfg.provider === "grok") {
      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) { console.warn("[FB AI] Grok error:", d.error.message); return ""; }
      return d.choices?.[0]?.message?.content?.trim() ?? "";
    }
  } catch (err) {
    console.error("[FB AI] generateFbAutoReply threw:", err);
  }
  return "";
}

export const FB_AUTOREPLY_DEFAULT_MODELS = DEFAULT_MODELS;
export const FB_AUTOREPLY_PROVIDER_KEY_NAMES = PROVIDER_KEY_NAMES;
