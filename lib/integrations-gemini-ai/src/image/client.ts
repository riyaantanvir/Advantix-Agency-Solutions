import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ??
  process.env.GOOGLE_AI_API_KEY ??
  "no-key-configured";

const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? undefined;

export const ai = new GoogleGenAI({
  apiKey,
  ...(baseURL ? { httpOptions: { apiVersion: "", baseUrl: baseURL } } : {}),
});

export function createGeminiImageClient(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key });
}

export async function generateImage(
  prompt: string,
  key?: string
): Promise<{ b64_json: string; mimeType: string }> {
  const client = key ? createGeminiImageClient(key) : ai;
  const response = await client.models.generateContent({
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
