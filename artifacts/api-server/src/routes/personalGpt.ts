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
  loadRecentTurns,
  loadArchive,
  loadArchiveStats,
  runPersonalGptTurn,
  runPersonalGptTurnStream,
  startPersonalGptBot,
  isPersonalGptBotRunning,
  sendPersonalGptTestMessage,
  listNotes,
  addNote,
  updateNote,
  deleteNote,
  NOTE_CATEGORIES,
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

/* ── GET recent conversation history (for restoring chat UI on reload) ─── */
router.get("/admin/personal-gpt/history", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const turns = await loadRecentTurns();
    res.json({ turns });
  } catch (err) {
    logger.error({ err }, "personal-gpt: load history failed");
    res.status(500).json({ error: "Failed to load history" });
  }
});

/* ── GET full conversation archive (paginated, never pruned) ───────────── */
router.get("/admin/personal-gpt/archive", requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await loadArchive({ limit, offset, search });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "personal-gpt: load archive failed");
    res.status(500).json({ error: "Failed to load archive" });
  }
});

/* ── GET archive stats (total turns, by source, first/last seen) ────────── */
router.get("/admin/personal-gpt/archive/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await loadArchiveStats();
    res.json(stats);
  } catch (err) {
    logger.error({ err }, "personal-gpt: archive stats failed");
    res.status(500).json({ error: "Failed to load stats" });
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

/* ── CRM / knowledge notes (long-term memory the bot uses in prompts) ───── */
router.get("/admin/personal-gpt/notes", requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json({ notes: await listNotes() });
  } catch (err) {
    logger.error({ err }, "personal-gpt: list notes failed");
    res.status(500).json({ error: "Failed to list notes" });
  }
});

router.post("/admin/personal-gpt/notes", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { category?: string; title?: string; body?: string; pinned?: boolean };
    if (typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "title is required" }); return;
    }
    if (body.category !== undefined && !(NOTE_CATEGORIES as readonly string[]).includes(String(body.category))) {
      res.status(400).json({ error: `category must be one of: ${NOTE_CATEGORIES.join(", ")}` }); return;
    }
    const note = await addNote({
      category: body.category, title: body.title, body: body.body, pinned: body.pinned,
    });
    res.json({ note });
  } catch (err) {
    logger.error({ err }, "personal-gpt: add note failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add note" });
  }
});

router.put("/admin/personal-gpt/notes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
    const body = req.body as { category?: string; title?: string; body?: string; pinned?: boolean };
    if (body.category !== undefined && !(NOTE_CATEGORIES as readonly string[]).includes(String(body.category))) {
      res.status(400).json({ error: `category must be one of: ${NOTE_CATEGORIES.join(", ")}` }); return;
    }
    await updateNote(id, body);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "personal-gpt: update note failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update note" });
  }
});

router.delete("/admin/personal-gpt/notes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
    await deleteNote(id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "personal-gpt: delete note failed");
    res.status(500).json({ error: "Failed to delete note" });
  }
});

/* ── POST send a test message to the configured Telegram chat IDs ──────── */
router.post("/admin/personal-gpt/telegram/test", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await sendPersonalGptTestMessage();
    if (result.delivered === 0) {
      const detail = result.failed.map(f => `${f.chatId}: ${f.error}`).join("; ");
      logger.warn({ failed: result.failed }, "personal-gpt: telegram test delivered to 0 chats");
      res.status(502).json({
        error: detail ? `Telegram rejected delivery — ${detail}` : "Failed to deliver to any chat",
        failed: result.failed,
      });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "personal-gpt: telegram test failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Test failed" });
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
