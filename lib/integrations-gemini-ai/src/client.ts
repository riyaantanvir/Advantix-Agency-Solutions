import { GoogleGenAI } from "@google/genai";

const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? undefined;
const apiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY  ?? process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  throw new Error(
    "No Gemini API key found. Set GOOGLE_AI_API_KEY (standard) or AI_INTEGRATIONS_GEMINI_API_KEY (Replit integration).",
  );
}

export const ai = new GoogleGenAI({
  apiKey,
  ...(baseURL ? { httpOptions: { apiVersion: "", baseUrl: baseURL } } : {}),
});
