import Anthropic from "@anthropic-ai/sdk";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? undefined;
const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY  ?? process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    "No Anthropic API key found. Set ANTHROPIC_API_KEY (standard) or AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit integration).",
  );
}

export const anthropic = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
