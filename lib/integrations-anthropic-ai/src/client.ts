import Anthropic from "@anthropic-ai/sdk";

const apiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  "sk-ant-placeholder-key";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? undefined;

// Wrap in try/catch so a bad key format never crashes the server at startup.
let _anthropic: Anthropic;
try {
  _anthropic = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
} catch {
  _anthropic = new Anthropic({ apiKey: "sk-ant-placeholder-key" });
}
export const anthropic = _anthropic;

export function createAnthropic(key: string): Anthropic {
  return new Anthropic({ apiKey: key });
}
