import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ??
  process.env.GOOGLE_AI_API_KEY ??
  "AIzaSy-placeholder-key";

const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? undefined;

let _ai: GoogleGenAI;
try {
  _ai = new GoogleGenAI({
    apiKey,
    ...(baseURL ? { httpOptions: { apiVersion: "", baseUrl: baseURL } } : {}),
  });
} catch {
  _ai = new GoogleGenAI({ apiKey: "AIzaSy-placeholder-key" });
}
export const ai = _ai;

export function createGemini(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key });
}
