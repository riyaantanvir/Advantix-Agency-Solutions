/**
 * Audio transcription using OpenRouter → google/gemini-2.0-flash (multimodal).
 * Reuses the existing OPENROUTER_API_KEY — no separate Gemini key needed.
 */

import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function getOpenRouterKey(): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.name, "OPENROUTER_API_KEY"));
    const v = row?.value?.trim();
    if (v) return v;
  } catch { /* fall through */ }
  return process.env.OPENROUTER_API_KEY?.trim() ?? null;
}

/**
 * Transcribe audio using OpenRouter → Gemini 2.0 Flash (multimodal).
 * @param audioBuffer  Raw audio bytes
 * @param mimeType     e.g. "audio/ogg", "audio/mpeg", "audio/mp4"
 * @returns Transcript string, or throws on failure
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured.");
  }

  const base64Audio = audioBuffer.toString("base64");

  const payload = {
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Audio}`,
            },
          },
          {
            type: "text",
            text:
              "Please transcribe this voice message exactly as spoken. " +
              "The speaker may use Bangla, Banglish (Bangla in English letters), or English — " +
              "transcribe in the exact language and script used. " +
              "Return ONLY the transcript, no extra commentary or labels.",
          },
        ],
      },
    ],
    max_tokens: 1024,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
      "X-Title": "Advantix Voice Transcription",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message: { content: string } }>;
    error?: { message?: string };
  };

  if (data.error) throw new Error(`OpenRouter transcription error: ${data.error.message}`);

  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
