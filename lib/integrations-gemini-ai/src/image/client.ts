import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ??
  process.env.GOOGLE_AI_API_KEY ??
  "AIzaSy-placeholder-key";

let _ai: GoogleGenAI;
try {
  _ai = new GoogleGenAI({ apiKey });
} catch {
  _ai = new GoogleGenAI({ apiKey: "AIzaSy-placeholder-key" });
}
export const ai = _ai;

export function createGeminiImageClient(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key });
}

export async function generateImage(
  prompt: string,
  key?: string
): Promise<{ b64_json: string; mimeType: string }> {
  const client = key ? createGeminiImageClient(key) : _ai;
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
