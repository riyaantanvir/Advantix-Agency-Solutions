import OpenAI from "openai";

// Falls back through: Replit integration → env var → placeholder
// Actual API calls will fail gracefully if no real key is configured.
const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
  process.env.OPENAI_API_KEY ??
  "no-key-configured";

const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";

export const openai = new OpenAI({ apiKey, baseURL });

// Factory: create a fresh client with a specific key (used by routes reading from DB)
export function createOpenAI(key: string, url?: string): OpenAI {
  return new OpenAI({ apiKey: key, baseURL: url ?? "https://api.openai.com/v1" });
}
