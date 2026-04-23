/**
 * Audio transcription using Gemini Flash multimodal.
 * Accepts a Buffer of audio data + MIME type, returns the transcript string.
 * Used by both the Telegram Personal GPT bot and the Facebook webhook handler.
 */

import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function getGeminiKey(): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, "GEMINI_API_KEY"));
    const v = row?.value?.trim();
    if (v) return v;
  } catch { /* fall through */ }
  return process.env.GEMINI_API_KEY?.trim() ?? null;
}

const TRANSCRIBE_MODEL = "gemini-2.0-flash";

/**
 * Transcribe audio using Gemini Flash.
 * @param audioBuffer  Raw audio bytes
 * @param mimeType     e.g. "audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm"
 * @returns Transcript string, or empty string on failure
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured. Set it in Admin → Integrations.");
  }

  const base64Audio = audioBuffer.toString("base64");

  const payload = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
        {
          text: "Please transcribe this voice message exactly as spoken. " +
                "The speaker may use Bangla, Banglish (Bangla written in English letters), or English — " +
                "transcribe in the exact language and script used. " +
                "Return ONLY the transcript with no extra commentary, labels, or formatting.",
        },
      ],
    }],
    generationConfig: { maxOutputTokens: 1024 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (data.error) throw new Error(`Gemini transcription error: ${data.error.message}`);

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}
