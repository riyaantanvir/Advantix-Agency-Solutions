/**
 * Personal GPT — admin-only personal assistant.
 *
 * Three jobs:
 *   1. Run a chat turn (web or Telegram) using OpenRouter (GLM) with a system
 *      prompt + an auto-curated personality profile + the last few turns.
 *   2. Run a lightweight extractor over each user message to update the
 *      personality profile (facts, habits, likes, dislikes, style).
 *   3. Drive an optional dedicated Telegram bot (separate token from the main
 *      Advantix Assistant bot) that mirrors the same chat behaviour.
 *
 * Privacy: we never archive the full transcript. Only a tiny rolling window
 * (last 12 rows = 6 user + 6 assistant turns) is kept in `personal_gpt_recent`
 * for short-term coherence; older rows are pruned on every insert.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import TelegramBot from "node-telegram-bot-api";
import { logger } from "./logger.js";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Personality = {
  facts: string[];
  habits: string[];
  likes: string[];
  dislikes: string[];
  style: string;
};

export type PersonalGptSettings = {
  systemPrompt: string;
  personality: Personality;
  hasTelegramToken: boolean;
  telegramChatId: string | null;
  enabled: boolean;
};

type RecentTurn = { role: "user" | "assistant"; content: string };

/* ── Constants ──────────────────────────────────────────────────────────── */

/* 6 turns each side. The user explicitly asked: "normally 5–6 previous text
   responses" — we keep the cap right there. */
const MAX_TURNS_EACH = 6;
const RECENT_ROWS_KEEP = MAX_TURNS_EACH * 2;

/* Soft caps so a runaway personality doesn't blow up the system prompt. */
const MAX_LIST_ITEMS = 30;
const MAX_ITEM_LENGTH = 160;
const MAX_STYLE_LENGTH = 400;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/* GLM 4.6 via OpenRouter — same family the user already uses elsewhere. */
const CHAT_MODEL = "z-ai/glm-4.6";
/* Cheaper/faster model just for personality extraction. */
const EXTRACT_MODEL = "z-ai/glm-4.6";

const EMPTY_PERSONALITY: Personality = {
  facts: [], habits: [], likes: [], dislikes: [], style: "",
};

/* ── DB helpers ─────────────────────────────────────────────────────────── */

async function getOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const r = await db.execute(sql`SELECT value FROM integrations WHERE name = 'OPENROUTER_API_KEY' LIMIT 1`);
    const v = (r.rows[0] as { value?: string } | undefined)?.value;
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

function normalizePersonality(input: unknown): Personality {
  const p = (input ?? {}) as Partial<Personality>;
  const arr = (v: unknown): string[] => Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
       .map(x => x.trim().slice(0, MAX_ITEM_LENGTH))
       .slice(0, MAX_LIST_ITEMS)
    : [];
  return {
    facts:    arr(p.facts),
    habits:   arr(p.habits),
    likes:    arr(p.likes),
    dislikes: arr(p.dislikes),
    style:    typeof p.style === "string" ? p.style.trim().slice(0, MAX_STYLE_LENGTH) : "",
  };
}

export async function loadSettings(): Promise<PersonalGptSettings & { telegramBotToken: string | null }> {
  const r = await db.execute(sql`
    SELECT system_prompt, personality, telegram_bot_token, telegram_chat_id, enabled
    FROM personal_gpt_settings WHERE id = 1
  `);
  const row = r.rows[0] as {
    system_prompt: string;
    personality: unknown;
    telegram_bot_token: string | null;
    telegram_chat_id: string | null;
    enabled: boolean;
  } | undefined;
  if (!row) {
    return {
      systemPrompt: "",
      personality: { ...EMPTY_PERSONALITY },
      telegramBotToken: null,
      hasTelegramToken: false,
      telegramChatId: null,
      enabled: true,
    };
  }
  return {
    systemPrompt: row.system_prompt ?? "",
    personality: normalizePersonality(row.personality),
    telegramBotToken: row.telegram_bot_token,
    hasTelegramToken: Boolean(row.telegram_bot_token),
    telegramChatId: row.telegram_chat_id,
    enabled: Boolean(row.enabled),
  };
}

export async function updateSettings(patch: {
  systemPrompt?: string;
  personality?: Personality;
  telegramBotToken?: string | null;  // null = clear, undefined = leave as is
  telegramChatId?: string | null;
  enabled?: boolean;
}): Promise<void> {
  /* We build a partial UPDATE so unspecified fields stay untouched. */
  const sets: ReturnType<typeof sql>[] = [];
  if (patch.systemPrompt !== undefined) {
    sets.push(sql`system_prompt = ${patch.systemPrompt}`);
  }
  if (patch.personality !== undefined) {
    const normalized = normalizePersonality(patch.personality);
    sets.push(sql`personality = ${JSON.stringify(normalized)}::jsonb`);
  }
  if (patch.telegramBotToken !== undefined) {
    sets.push(sql`telegram_bot_token = ${patch.telegramBotToken}`);
  }
  if (patch.telegramChatId !== undefined) {
    sets.push(sql`telegram_chat_id = ${patch.telegramChatId}`);
  }
  if (patch.enabled !== undefined) {
    sets.push(sql`enabled = ${patch.enabled}`);
  }
  if (!sets.length) return;
  sets.push(sql`updated_at = now()`);

  /* Drizzle has no first-class "join sql fragments" helper for UPDATE SET, so
     we splice with raw commas. The fragments above are all parameterised. */
  const setClause = sql.join(sets, sql`, `);
  await db.execute(sql`UPDATE personal_gpt_settings SET ${setClause} WHERE id = 1`);
}

async function loadRecentTurns(): Promise<RecentTurn[]> {
  const r = await db.execute(sql`
    SELECT role, content FROM personal_gpt_recent
    ORDER BY id DESC LIMIT ${RECENT_ROWS_KEEP}
  `);
  const rows = (r.rows as { role: string; content: string }[]).reverse();
  return rows
    .filter(r => r.role === "user" || r.role === "assistant")
    .map(r => ({ role: r.role as "user" | "assistant", content: r.content }));
}

async function appendTurn(role: "user" | "assistant", content: string, source: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO personal_gpt_recent (role, content, source) VALUES (${role}, ${content}, ${source})
  `);
  /* Prune anything beyond the rolling window. The id-desc OFFSET trick keeps
     the most recent N rows; everything older is deleted in one statement. */
  await db.execute(sql`
    DELETE FROM personal_gpt_recent
    WHERE id NOT IN (
      SELECT id FROM personal_gpt_recent ORDER BY id DESC LIMIT ${RECENT_ROWS_KEEP}
    )
  `);
}

export async function clearRecentTurns(): Promise<void> {
  await db.execute(sql`DELETE FROM personal_gpt_recent`);
}

/* ── Personality merge ──────────────────────────────────────────────────── */

/* Case-insensitive "is essentially the same item already present" check so we
   don't append "loves coffee" five times in slightly different casing. */
function mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(x => x.toLowerCase()));
  const out = [...existing];
  for (const item of incoming) {
    const trimmed = item.trim().slice(0, MAX_ITEM_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function mergePersonality(current: Personality, delta: Partial<Personality>): Personality {
  return {
    facts:    mergeUnique(current.facts,    delta.facts    ?? []),
    habits:   mergeUnique(current.habits,   delta.habits   ?? []),
    likes:    mergeUnique(current.likes,    delta.likes    ?? []),
    dislikes: mergeUnique(current.dislikes, delta.dislikes ?? []),
    /* Style is a single sentence — replace if the extractor produced a new
       non-empty one, otherwise keep what we have. */
    style:    (delta.style && delta.style.trim().length > 0
              ? delta.style.trim().slice(0, MAX_STYLE_LENGTH)
              : current.style),
  };
}

/* ── Personality extraction ────────────────────────────────────────────── */

const EXTRACT_SYSTEM = `You are a personality-profiler.
Read the user's latest message (which may be in English, Bangla, or Banglish)
and extract ONLY new long-term-useful facts about them — habits, preferences,
likes, dislikes, communication style.

Rules:
- Output strict JSON, no prose, no markdown fences.
- If nothing new is worth remembering, return all empty.
- Each list item is a short third-person clause ("prefers concise replies").
- "style" is one sentence describing their tone (or empty string).
- Never include transient/contextual info (today's task, a question they asked).
- Never include sensitive info (passwords, secrets, financial account numbers).

Schema:
{"facts":string[], "habits":string[], "likes":string[], "dislikes":string[], "style":string}`;

async function extractPersonalityDelta(userText: string, apiKey: string): Promise<Partial<Personality>> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://advantix.digital",
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: userText.slice(0, 4000) },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn(`Personal GPT extractor: HTTP ${res.status}`);
      return {};
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return normalizePersonality(parsed);
  } catch (err) {
    /* Extraction is best-effort — never block the actual chat reply. */
    logger.warn({ err }, "Personal GPT extractor failed");
    return {};
  }
}

/* ── Chat ───────────────────────────────────────────────────────────────── */

function renderPersonality(p: Personality): string {
  const sections: string[] = [];
  if (p.style) sections.push(`Communication style: ${p.style}`);
  if (p.facts.length)    sections.push(`Facts:\n- ${p.facts.join("\n- ")}`);
  if (p.habits.length)   sections.push(`Habits:\n- ${p.habits.join("\n- ")}`);
  if (p.likes.length)    sections.push(`Likes:\n- ${p.likes.join("\n- ")}`);
  if (p.dislikes.length) sections.push(`Dislikes:\n- ${p.dislikes.join("\n- ")}`);
  if (!sections.length) return "(No personality profile yet — learn from each turn.)";
  return sections.join("\n\n");
}

async function callChat(systemPrompt: string, history: RecentTurn[], apiKey: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Empty reply from chat model");
  return reply;
}

export type RunResult = { reply: string; personalityUpdated: boolean };

/**
 * Run one Personal GPT turn end-to-end. Caller passes the user text and where
 * it came from ("web" or "telegram"); we handle extraction → personality merge
 * → chat → rolling-window persistence. The full transcript is never archived.
 */
export async function runPersonalGptTurn(userText: string, source: "web" | "telegram"): Promise<RunResult> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const settings = await loadSettings();
  if (!settings.enabled) throw new Error("Personal GPT is disabled in settings");

  /* Kick off extraction in parallel with chat — we don't want to slow the
     reply waiting for personality analysis. */
  const extractPromise = extractPersonalityDelta(userText, apiKey);

  /* Build the system prompt: user-provided base + auto-curated personality. */
  const fullSystemPrompt = [
    settings.systemPrompt.trim() || "You are Personal GPT, a highly intelligent personal assistant.",
    "",
    "## What you know about the user (long-term memory)",
    renderPersonality(settings.personality),
    "",
    `## Style rules`,
    `- Reply naturally in the same language the user wrote (English, Bangla, or Banglish).`,
    `- Use the personality profile above to tailor tone, vocabulary, and depth.`,
    `- Be concise unless the user asks for detail.`,
  ].join("\n");

  const history = await loadRecentTurns();
  const turnHistory: RecentTurn[] = [...history, { role: "user", content: userText }];

  const reply = await callChat(fullSystemPrompt, turnHistory, apiKey);

  /* Persist rolling window (best-effort — failures don't break the reply). */
  await appendTurn("user", userText, source).catch(err =>
    logger.warn({ err }, "Personal GPT: failed to append user turn"));
  await appendTurn("assistant", reply, source).catch(err =>
    logger.warn({ err }, "Personal GPT: failed to append assistant turn"));

  /* Apply the extracted personality delta if any. */
  let personalityUpdated = false;
  try {
    const delta = await extractPromise;
    const hasDelta = (delta.facts?.length ?? 0) + (delta.habits?.length ?? 0)
                   + (delta.likes?.length ?? 0) + (delta.dislikes?.length ?? 0)
                   + (delta.style && delta.style.trim() ? 1 : 0) > 0;
    if (hasDelta) {
      const merged = mergePersonality(settings.personality, delta);
      await updateSettings({ personality: merged });
      personalityUpdated = true;
    }
  } catch (err) {
    logger.warn({ err }, "Personal GPT: personality merge failed");
  }

  return { reply, personalityUpdated };
}

/* ── Telegram bot ───────────────────────────────────────────────────────── */

let pgBotInstance: TelegramBot | null = null;

/**
 * Start (or restart) the dedicated Personal GPT Telegram bot. Reads the bot
 * token + owner chat ID from `personal_gpt_settings`. If either is missing,
 * any running bot is stopped and we exit silently. Idempotent.
 */
export async function startPersonalGptBot(): Promise<void> {
  const settings = await loadSettings();

  /* Tear down any existing instance — covers token rotation as well. */
  if (pgBotInstance) {
    try { await pgBotInstance.stopPolling({ cancel: true }); } catch { /* ignore */ }
    pgBotInstance = null;
  }

  if (!settings.enabled) {
    logger.info("Personal GPT bot not started: feature is disabled.");
    return;
  }
  if (!settings.telegramBotToken || !settings.telegramChatId) {
    logger.info("Personal GPT bot not started: token or chat ID missing.");
    return;
  }
  const ownerChatId = parseInt(settings.telegramChatId, 10);
  if (!Number.isFinite(ownerChatId)) {
    logger.warn("Personal GPT bot not started: chat ID is not a number.");
    return;
  }

  const bot = new TelegramBot(settings.telegramBotToken, { polling: true });
  pgBotInstance = bot;
  logger.info(`Personal GPT Telegram bot started. Owner chat ID: ${ownerChatId}`);

  bot.on("polling_error", (err) => {
    logger.warn({ err: String(err) }, "Personal GPT bot polling error");
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    /* Hard isolation — only the configured owner can use this bot. */
    if (chatId !== ownerChatId) {
      await bot.sendMessage(chatId, "⛔ Unauthorized.").catch(() => {});
      return;
    }
    if (!text) return;

    if (text === "/start") {
      await bot.sendMessage(chatId, "👋 Personal GPT is ready. Just message me.");
      return;
    }
    if (text === "/clear") {
      await clearRecentTurns().catch(() => {});
      await bot.sendMessage(chatId, "✅ Short-term memory cleared.");
      return;
    }

    await bot.sendChatAction(chatId, "typing").catch(() => {});

    try {
      const { reply } = await runPersonalGptTurn(text, "telegram");
      /* Telegram has a 4096-char hard limit per message; chunk if needed. */
      for (let i = 0; i < reply.length; i += 4000) {
        await bot.sendMessage(chatId, reply.slice(i, i + 4000)).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, "Personal GPT Telegram turn failed");
      await bot.sendMessage(chatId, `⚠️ ${String(err instanceof Error ? err.message : err).slice(0, 300)}`).catch(() => {});
    }
  });
}

export function isPersonalGptBotRunning(): boolean {
  return pgBotInstance !== null;
}
