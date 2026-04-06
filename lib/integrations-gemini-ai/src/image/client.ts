import { GoogleGenAI, Modality } from "@google/genai";

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

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
