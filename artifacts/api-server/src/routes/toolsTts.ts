import { Router } from "express";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

// ── Bengali TTS — HuggingFace MMS-TTS (primary) → Google Translate (fallback) ──
// Handles up to 500 chars. Bengali text only.
router.get("/tools/tts", requireToolUser, async (req, res) => {
  try {
    const text = (req.query.text as string | undefined)?.trim();
    const lang = (req.query.lang as string | undefined) ?? "bn";

    if (!text) { res.status(400).json({ error: "text is required" }); return; }
    if (text.length > 500) { res.status(400).json({ error: "text too long (max 500 chars)" }); return; }

    // ── 1. Try HuggingFace MMS-TTS ──────────────────────────────────────────
    if (lang === "bn") {
      try {
        const hfToken = process.env.HUGGINGFACE_TOKEN;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`;

        const hfRes = await fetch(
          "https://api-inference.huggingface.co/models/facebook/mms-tts-ben",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ inputs: text }),
            signal: AbortSignal.timeout(12000),
          }
        );

        if (hfRes.ok) {
          const contentType = hfRes.headers.get("content-type") ?? "audio/flac";
          const audio = await hfRes.arrayBuffer();
          res.set({ "Content-Type": contentType, "Cache-Control": "public, max-age=3600", "X-Tts-Engine": "mms" });
          res.send(Buffer.from(audio));
          return;
        }
        // 503 = model loading (cold start) — fall through to Google TTS
        console.log(`[tts] HF returned ${hfRes.status}, falling back to Google TTS`);
      } catch (hfErr: any) {
        console.log("[tts] HF failed:", hfErr.message, "— falling back to Google TTS");
      }
    }

    // ── 2. Fallback: Google Translate TTS ───────────────────────────────────
    const { getAudioUrl } = await import("google-tts-api");
    const url = getAudioUrl(text.slice(0, 200), {
      lang,
      slow: false,
      host: "https://translate.google.com",
      timeout: 10000,
    });

    const audioRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AdvantixTTS/1.0)",
        "Referer": "https://translate.google.com/",
      },
    });

    if (!audioRes.ok) {
      res.status(502).json({ error: "TTS service unavailable" });
      return;
    }

    const audioBuffer = await audioRes.arrayBuffer();
    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=3600",
      "X-Tts-Engine": "google",
    });
    res.send(Buffer.from(audioBuffer));
  } catch (err: any) {
    console.error("[tts]", err.message);
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
