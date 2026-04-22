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

/** Result of an AI reply attempt. `text` is non-empty on success; otherwise
 *  `error` carries a human-readable reason that should be persisted on the
 *  message so the user can see *why* nothing was sent. */
export interface AiReplyResult {
  text: string;
  error?: string;
  provider: AiProvider;
  model: string;
}

/** Generate a reply using the configured provider. Always resolves — never
 *  throws. On failure, returns `{ text: "", error: "..." }`. */
export async function generateFbAutoReplyDetailed(instructions: string, userMessage: string): Promise<AiReplyResult> {
  const cfg = await getFbAutoReplyConfig();
  const meta = { provider: cfg.provider, model: cfg.model };
  if (!cfg.apiKey) {
    return { text: "", error: `No API key for provider "${cfg.provider}". Add ${PROVIDER_KEY_NAMES[cfg.provider]} in admin → Integrations.`, ...meta };
  }

  const messages = [
    { role: "system", content: instructions },
    { role: "user", content: userMessage },
  ];

  try {
    if (cfg.provider === "openrouter") {
      /* GLM/DeepSeek/o-series and other reasoning models burn most of the token
         budget on hidden chain-of-thought, leaving `content` empty. We disable
         reasoning output and raise the cap so customer-facing replies always
         have room. `reasoning.exclude` is a no-op on non-reasoning models. */
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.apiKey}`,
          "HTTP-Referer": "https://advantix.digital",
          "X-Title": "Advantix FB Auto-Reply",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 2000,
          messages,
          reasoning: { exclude: true, effort: "low" },
        }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) return { text: "", error: `OpenRouter: ${d.error.message ?? "unknown error"}`, ...meta };
      const text = d.choices?.[0]?.message?.content?.trim() ?? "";
      return text ? { text, ...meta } : { text: "", error: `OpenRouter returned no content for model "${cfg.model}". Check model name.`, ...meta };
    }

    if (cfg.provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) return { text: "", error: `OpenAI: ${d.error.message ?? "unknown error"}`, ...meta };
      const text = d.choices?.[0]?.message?.content?.trim() ?? "";
      return text ? { text, ...meta } : { text: "", error: `OpenAI returned no content for model "${cfg.model}".`, ...meta };
    }

    if (cfg.provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, system: instructions, messages: [{ role: "user", content: userMessage }] }),
      });
      const d = await r.json() as { content?: Array<{ text?: string }>; error?: { message?: string } };
      if (d.error) return { text: "", error: `Anthropic: ${d.error.message ?? "unknown error"}`, ...meta };
      const text = d.content?.[0]?.text?.trim() ?? "";
      return text ? { text, ...meta } : { text: "", error: `Anthropic returned no content for model "${cfg.model}".`, ...meta };
    }

    if (cfg.provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      });
      const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
      if (d.error) return { text: "", error: `Gemini: ${d.error.message ?? "unknown error"}`, ...meta };
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      return text ? { text, ...meta } : { text: "", error: `Gemini returned no content for model "${cfg.model}".`, ...meta };
    }

    if (cfg.provider === "grok") {
      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, max_tokens: 500, messages }),
      });
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message?: string } };
      if (d.error) return { text: "", error: `Grok: ${d.error.message ?? "unknown error"}`, ...meta };
      const text = d.choices?.[0]?.message?.content?.trim() ?? "";
      return text ? { text, ...meta } : { text: "", error: `Grok returned no content for model "${cfg.model}".`, ...meta };
    }
  } catch (err) {
    return { text: "", error: `Network/runtime error: ${err instanceof Error ? err.message : String(err)}`, ...meta };
  }
  return { text: "", error: `Unknown provider "${cfg.provider}".`, ...meta };
}

/** Backwards-compatible string-returning wrapper. Prefer the Detailed version. */
export async function generateFbAutoReply(instructions: string, userMessage: string): Promise<string> {
  return (await generateFbAutoReplyDetailed(instructions, userMessage)).text;
}

export const FB_AUTOREPLY_DEFAULT_MODELS = DEFAULT_MODELS;
export const FB_AUTOREPLY_PROVIDER_KEY_NAMES = PROVIDER_KEY_NAMES;
