/**
 * Personal GPT — admin-only HTTP routes.
 *
 * Mirrors the contract used by `pages/PersonalGPT.tsx` in the admin app.
 * Settings GET never returns the raw Telegram token — only a `hasTelegramToken`
 * flag — so the secret cannot leak via XSS or browser dev-tools.
 */

import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../middleware/auth.js";
import {
  loadSettings,
  updateSettings,
  clearRecentTurns,
  runPersonalGptTurn,
  runPersonalGptTurnStream,
  startPersonalGptBot,
  isPersonalGptBotRunning,
  type Personality,
} from "../lib/personalGpt.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── GET settings (token masked) ────────────────────────────────────────── */
router.get("/admin/personal-gpt/settings", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const s = await loadSettings();
    res.json({
      systemPrompt:      s.systemPrompt,
      personality:       s.personality,
      hasTelegramToken:  s.hasTelegramToken,
      telegramChatId:    s.telegramChatId,
      enabled:           s.enabled,
      botRunning:        isPersonalGptBotRunning(),
    });
  } catch (err) {
    logger.error({ err }, "personal-gpt: load settings failed");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

/* ── PUT settings ───────────────────────────────────────────────────────── */
router.put("/admin/personal-gpt/settings", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      systemPrompt?: string;
      personality?: Personality;
      telegramBotToken?: string | null;
      telegramChatId?: string | null;
      enabled?: boolean;
    };

    const patch: Parameters<typeof updateSettings>[0] = {};

    if (typeof body.systemPrompt === "string") patch.systemPrompt = body.systemPrompt.slice(0, 8000);
    if (body.personality && typeof body.personality === "object") patch.personality = body.personality;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    /* Token: empty string or explicit null both clear the token. Anything
       else must look like a Telegram bot token (digits:alnum-) — basic guard
       against obviously bad input being saved. */
    if (body.telegramBotToken !== undefined) {
      if (body.telegramBotToken === null || body.telegramBotToken === "") {
        patch.telegramBotToken = null;
      } else if (typeof body.telegramBotToken === "string" && /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(body.telegramBotToken.trim())) {
        patch.telegramBotToken = body.telegramBotToken.trim();
      } else {
        res.status(400).json({ error: "Invalid Telegram bot token format" });
        return;
      }
    }
    if (body.telegramChatId !== undefined) {
      if (body.telegramChatId === null || body.telegramChatId === "") {
        patch.telegramChatId = null;
      } else if (typeof body.telegramChatId === "string"
                 && /^\s*-?\d{3,20}(\s*,\s*-?\d{3,20})*\s*$/.test(body.telegramChatId)) {
        /* Accepts a single ID or a comma-separated list. Negative IDs are
           groups/supergroups (e.g. -1001234567890), positives are DMs. */
        patch.telegramChatId = body.telegramChatId.split(",").map(s => s.trim()).join(",");
      } else {
        res.status(400).json({ error: "Invalid Telegram chat ID (numeric, comma-separated for multiple)" });
        return;
      }
    }

    await updateSettings(patch);

    /* Hot-restart the bot whenever Telegram credentials OR the enabled flag change.
       Disabling must actually stop polling, not just refuse web turns. */
    if (body.telegramBotToken !== undefined || body.telegramChatId !== undefined || body.enabled !== undefined) {
      startPersonalGptBot().catch(err => logger.warn({ err }, "Personal GPT bot restart failed"));
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "personal-gpt: save settings failed");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

/* ── POST chat (non-streaming) ──────────────────────────────────────────── */
router.post("/admin/personal-gpt/chat", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const message = String((req.body as { message?: unknown })?.message ?? "").trim();
    if (!message) { res.status(400).json({ error: "message is required" }); return; }
    if (message.length > 8000) { res.status(400).json({ error: "message too long" }); return; }

    const result = await runPersonalGptTurn(message, { source: "web", persist: true });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "personal-gpt: chat failed");
    const msg = err instanceof Error ? err.message : "Chat failed";
    res.status(500).json({ error: msg });
  }
});

/* ── POST chat with SSE streaming (faster perceived latency) ────────────── */
router.post("/admin/personal-gpt/chat/stream", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const message = String((req.body as { message?: unknown })?.message ?? "").trim();
  if (!message) { res.status(400).json({ error: "message is required" }); return; }
  if (message.length > 8000) { res.status(400).json({ error: "message too long" }); return; }

  /* Standard SSE setup: text/event-stream + flush headers + disable nginx
     proxy buffering so chunks reach the browser immediately. */
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  /* Heartbeat to keep proxies from timing out long-running streams. */
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  /* Propagate client disconnects to the upstream OpenRouter fetch via
     AbortController — otherwise we'd keep generating tokens (and getting
     billed) after the user closed the tab. */
  const ac = new AbortController();
  let aborted = false;
  req.on("close", () => { aborted = true; ac.abort(); });

  try {
    await runPersonalGptTurnStream(message, "web", (event) => {
      if (aborted) return;
      send(event);
    }, ac.signal);
  } catch (err) {
    if (!aborted) send({ type: "error", error: err instanceof Error ? err.message : "Chat failed" });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

/* ── POST clear short-term window ───────────────────────────────────────── */
router.post("/admin/personal-gpt/clear-recent", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await clearRecentTurns();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "personal-gpt: clear recent failed");
    res.status(500).json({ error: "Failed to clear" });
  }
});

/* ── POST restart Telegram bot (e.g. after manual settings change) ──────── */
router.post("/admin/personal-gpt/telegram/restart", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await startPersonalGptBot();
    res.json({ ok: true, running: isPersonalGptBotRunning() });
  } catch (err) {
    logger.error({ err }, "personal-gpt: telegram restart failed");
    res.status(500).json({ error: "Failed to restart bot" });
  }
});

export default router;
