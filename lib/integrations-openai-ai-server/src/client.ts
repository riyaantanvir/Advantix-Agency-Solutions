import OpenAI from "openai";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY  ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "No OpenAI API key found. Set OPENAI_API_KEY (standard) or AI_INTEGRATIONS_OPENAI_API_KEY (Replit integration).",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
