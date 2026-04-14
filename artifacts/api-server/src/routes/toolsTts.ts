import { Router } from "express";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

// ── Bengali TTS — Google Translate TTS ─────────────────────────────────────────
// Handles up to 500 chars. Bengali text only.
router.get("/tools/tts", requireToolUser, async (req, res) => {
  try {
    const text = (req.query.text as string | undefined)?.trim();
    const lang = (req.query.lang as string | undefined) ?? "bn";

    if (!text) { res.status(400).json({ error: "text is required" }); return; }
    if (text.length > 500) { res.status(400).json({ error: "text too long (max 500 chars)" }); return; }

    // ── Google Translate TTS ─────────────────────────────────────────────────
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
