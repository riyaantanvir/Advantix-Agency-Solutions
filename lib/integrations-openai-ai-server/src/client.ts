import OpenAI from "openai";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
  process.env.OPENAI_API_KEY ??
  "sk-placeholder-key";

const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";

let _openai: OpenAI;
try {
  _openai = new OpenAI({ apiKey, baseURL });
} catch {
  _openai = new OpenAI({ apiKey: "sk-placeholder-key", baseURL: "https://api.openai.com/v1" });
}
export const openai = _openai;

export function createOpenAI(key: string, url?: string): OpenAI {
  return new OpenAI({ apiKey: key, baseURL: url ?? "https://api.openai.com/v1" });
}
