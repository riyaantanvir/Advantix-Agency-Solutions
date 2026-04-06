import Anthropic from "@anthropic-ai/sdk";

const apiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  "no-key-configured";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? undefined;

export const anthropic = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });

export function createAnthropic(key: string): Anthropic {
  return new Anthropic({ apiKey: key });
}
