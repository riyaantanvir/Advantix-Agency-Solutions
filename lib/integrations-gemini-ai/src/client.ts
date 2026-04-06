import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ??
  process.env.GOOGLE_AI_API_KEY ??
  "no-key-configured";

const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? undefined;

export const ai = new GoogleGenAI({
  apiKey,
  ...(baseURL ? { httpOptions: { apiVersion: "", baseUrl: baseURL } } : {}),
});

export function createGemini(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key });
}
