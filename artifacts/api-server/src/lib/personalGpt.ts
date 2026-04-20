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

/* Default system prompt — friendly, casual, multilingual.
   Kept in one place so cached prompt prefix stays stable across turns. */
const DEFAULT_SYSTEM_PROMPT = `You are Personal GPT — a warm, friendly personal assistant who chats like a close friend.

Tone:
- Casual, encouraging, with light humor when it fits.
- Keep things human: short sentences, natural pauses, the occasional emoji when it adds warmth (but don't overdo it).
- Be empathetic. If the user sounds stressed, acknowledge it before solving.

Language:
- Reply in the same language the user used — English, Bangla (Bengali script), or Banglish (Bengali in Roman letters).
- Match their register: if they're casual, you're casual.

Behaviour:
- Be concise by default. Expand only when the user asks or the topic genuinely needs it.
- When you don't know something, say so cheerfully and offer to figure it out together.`;

/**
 * Build the full system prompt. When `includePersonality` is false the
 * long-term personality profile is OMITTED entirely — used for group chats so
 * other group members can't probe the bot for the owner's private facts. We
 * also append an explicit privacy instruction in that mode.
 */
function buildSystemPrompt(
  settings: { systemPrompt: string; personality: Personality },
  includePersonality: boolean,
): string {
  const base = settings.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
  if (!includePersonality) {
    return [
      base,
      "",
      "## Group chat mode",
      "You are talking in a group chat. You have NO memory of past conversations and NO knowledge about any specific user. If asked about your owner, the operator, or any private details, politely say you don't share that information.",
    ].join("\n");
  }
  return [
    base,
    "",
    "## What you know about the user (long-term memory)",
    renderPersonality(settings.personality),
  ].join("\n");
}

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

/* Build the OpenRouter messages array. The system message uses the
   Anthropic-style content-block form with `cache_control: ephemeral` so that
   providers which support prompt caching (Claude, Gemini, DeepSeek, and a
   growing set on OpenRouter) only bill the system prompt + personality on the
   first hit and serve subsequent turns from cache — exactly the user's request:
   "old memories cached, new msg only burns tokens". For models that don't
   support caching, OpenRouter just ignores the marker. */
function buildMessages(systemPrompt: string, history: RecentTurn[]) {
  return [
    {
      role: "system" as const,
      content: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    },
    ...history.map(h => ({ role: h.role, content: h.content })),
  ];
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
      temperature: 0.8,
      messages: buildMessages(systemPrompt, history),
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

/**
 * Streaming variant. Calls OpenRouter with `stream: true` and yields content
 * chunks as they arrive. Returns the full assembled reply so the caller can
 * persist it to the rolling window. Significantly improves perceived latency
 * for the web UI — first token usually arrives in well under a second.
 */
async function callChatStream(
  systemPrompt: string,
  history: RecentTurn[],
  apiKey: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
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
      temperature: 0.8,
      stream: true,
      messages: buildMessages(systemPrompt, history),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new Error("Aborted");
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    /* OpenRouter streams SSE: each event is `data: {...}\n\n` and ends with
       `data: [DONE]`. We parse line-by-line and tolerate partial frames. */
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        /* tolerate keepalives / partial frames */
      }
    }
  }

  if (!full.trim()) throw new Error("Empty reply from chat model");
  return full;
}

export type RunResult = { reply: string; personalityUpdated: boolean };

export type TurnOptions = {
  /** Source label for logs/audit. */
  source: "web" | "telegram";
  /**
   * Whether this turn should write to the rolling window AND feed the
   * personality extractor. Group chats run with `persist=false` so other
   * group members can't leak their messages into the owner's personal memory
   * or contaminate the personality profile (privacy boundary).
   */
  persist: boolean;
};

/**
 * Run one Personal GPT turn end-to-end. The full transcript is never archived;
 * only the rolling window is kept (and only when `persist` is true).
 */
export async function runPersonalGptTurn(userText: string, opts: TurnOptions): Promise<RunResult> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const settings = await loadSettings();
  if (!settings.enabled) throw new Error("Personal GPT is disabled in settings");

  /* Personality extraction only runs for trusted/persistable turns. */
  const extractPromise = opts.persist
    ? extractPersonalityDelta(userText, apiKey)
    : Promise.resolve<Partial<Personality>>({});

  /* For ephemeral (group) turns we deliberately use no history AND omit the
     personality profile so the group conversation can't pull in or leak
     private DM context. DM/web turns get the full memory. */
  const fullSystemPrompt = buildSystemPrompt(settings, opts.persist);
  const history = opts.persist ? await loadRecentTurns() : [];
  const turnHistory: RecentTurn[] = [...history, { role: "user", content: userText }];

  const reply = await callChat(fullSystemPrompt, turnHistory, apiKey);

  if (opts.persist) {
    await appendTurn("user", userText, opts.source).catch(err =>
      logger.warn({ err }, "Personal GPT: failed to append user turn"));
    await appendTurn("assistant", reply, opts.source).catch(err =>
      logger.warn({ err }, "Personal GPT: failed to append assistant turn"));
  }

  let personalityUpdated = false;
  try {
    const delta = await extractPromise;
    const hasDelta = (delta.facts?.length ?? 0) + (delta.habits?.length ?? 0)
                   + (delta.likes?.length ?? 0) + (delta.dislikes?.length ?? 0)
                   + (delta.style && delta.style.trim() ? 1 : 0) > 0;
    if (hasDelta && opts.persist) {
      const merged = mergePersonality(settings.personality, delta);
      await updateSettings({ personality: merged });
      personalityUpdated = true;
    }
  } catch (err) {
    logger.warn({ err }, "Personal GPT: personality merge failed");
  }

  return { reply, personalityUpdated };
}

/* ── Streaming chat (web) ───────────────────────────────────────────────── */

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; reply: string; personalityUpdated: boolean }
  | { type: "error"; error: string };

/**
 * Run one Personal GPT turn with token-by-token streaming. The caller receives
 * incremental chunks via `onEvent` so the UI can render text as it arrives.
 * Persistence + personality merge happen at the end exactly like the
 * non-streaming path.
 */
export async function runPersonalGptTurnStream(
  userText: string,
  source: "web" | "telegram",
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const apiKey = await getOpenRouterKey();
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const settings = await loadSettings();
    if (!settings.enabled) throw new Error("Personal GPT is disabled in settings");

    /* Streaming endpoint is web-only and always persists. */
    const extractPromise = extractPersonalityDelta(userText, apiKey);
    const fullSystemPrompt = buildSystemPrompt(settings, true);
    const history = await loadRecentTurns();
    const turnHistory: RecentTurn[] = [...history, { role: "user", content: userText }];

    const reply = await callChatStream(fullSystemPrompt, turnHistory, apiKey, (chunk) => {
      onEvent({ type: "chunk", text: chunk });
    }, signal);

    /* If the client cancelled mid-stream, skip persistence and personality
       merge — those side effects shouldn't fire on aborted requests. */
    if (signal?.aborted) return;

    /* Persistence — best-effort. */
    await appendTurn("user", userText, source).catch(err =>
      logger.warn({ err }, "Personal GPT: failed to append user turn"));
    await appendTurn("assistant", reply, source).catch(err =>
      logger.warn({ err }, "Personal GPT: failed to append assistant turn"));

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

    onEvent({ type: "done", reply, personalityUpdated });
  } catch (err) {
    /* Don't emit an error event for client-initiated cancellations. */
    if (signal?.aborted) return;
    onEvent({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
}

/* ── Telegram bot ───────────────────────────────────────────────────────── */

let pgBotInstance: TelegramBot | null = null;
let pgBotUsername: string | null = null;

/**
 * Parse the configured chat-ID setting. Accepts a single ID or a
 * comma-separated list; positive IDs are personal DMs, negative IDs are
 * groups/supergroups. Anything malformed is silently dropped.
 */
function parseAllowedChatIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n));
}

/**
 * Start (or restart) the dedicated Personal GPT Telegram bot. Supports:
 *   - Personal DM (positive chat ID): always responds.
 *   - Groups/supergroups (negative chat ID): only responds when the bot is
 *     mentioned (@botusername) or the user replies to a bot message — keeps it
 *     non-spammy in shared chats.
 * Token + chat ID(s) come from `personal_gpt_settings`. Idempotent.
 */
export async function startPersonalGptBot(): Promise<void> {
  const settings = await loadSettings();

  /* Tear down any existing instance — covers token rotation as well. */
  if (pgBotInstance) {
    try { await pgBotInstance.stopPolling({ cancel: true }); } catch { /* ignore */ }
    pgBotInstance = null;
    pgBotUsername = null;
  }

  if (!settings.enabled) {
    logger.info("Personal GPT bot not started: feature is disabled.");
    return;
  }
  if (!settings.telegramBotToken || !settings.telegramChatId) {
    logger.info("Personal GPT bot not started: token or chat ID(s) missing.");
    return;
  }
  const allowedChatIds = parseAllowedChatIds(settings.telegramChatId);
  if (!allowedChatIds.length) {
    logger.warn("Personal GPT bot not started: no valid chat IDs.");
    return;
  }

  const bot = new TelegramBot(settings.telegramBotToken, { polling: true });
  pgBotInstance = bot;

  /* Cache the bot's own username so we can detect mentions in groups. */
  try {
    const me = await bot.getMe();
    pgBotUsername = me.username ?? null;
  } catch (err) {
    logger.warn({ err }, "Personal GPT: getMe() failed");
  }
  logger.info(`Personal GPT bot started as @${pgBotUsername ?? "?"} for chats: ${allowedChatIds.join(", ")}`);

  bot.on("polling_error", (err) => {
    logger.warn({ err: String(err) }, "Personal GPT bot polling error");
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    let text = msg.text?.trim();
    if (!text) return;

    /* Allowed chats only — silently drop everything else (no "Unauthorized"
       reply spam in random groups the bot may be added to). */
    if (!allowedChatIds.includes(chatId)) return;

    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

    /* In groups, only react to a direct entity-based mention of our bot or a
       reply to one of our messages. Substring matching is unsafe — `@botname2`
       or `@botnameLong` would false-trigger. We use Telegram message entities
       which give us exact ranges. */
    if (isGroup) {
      const lowerName = (pgBotUsername ?? "").toLowerCase();
      let mentionRange: { offset: number; length: number } | null = null;

      if (lowerName && msg.entities) {
        for (const ent of msg.entities) {
          if (ent.type === "mention") {
            const slice = text.slice(ent.offset, ent.offset + ent.length); // includes leading "@"
            if (slice.toLowerCase() === `@${lowerName}`) {
              mentionRange = { offset: ent.offset, length: ent.length };
              break;
            }
          } else if (ent.type === "text_mention" && ent.user?.username?.toLowerCase() === lowerName) {
            mentionRange = { offset: ent.offset, length: ent.length };
            break;
          }
        }
      }

      const isReplyToBot = msg.reply_to_message?.from?.username === pgBotUsername;
      if (!mentionRange && !isReplyToBot) return;

      /* Strip the mention from the text so the model doesn't see it. */
      if (mentionRange) {
        text = (text.slice(0, mentionRange.offset) + text.slice(mentionRange.offset + mentionRange.length)).trim();
      }
      if (!text) {
        await bot.sendMessage(chatId, "Hey! 👋 What can I help with?", {
          reply_to_message_id: msg.message_id,
        }).catch(() => {});
        return;
      }
    }

    if (text === "/start") {
      await bot.sendMessage(chatId, "👋 Personal GPT is ready. Just message me.");
      return;
    }
    /* /clear only makes sense in DM (it nukes the personal rolling window). */
    if (text === "/clear" && !isGroup) {
      await clearRecentTurns().catch(() => {});
      await bot.sendMessage(chatId, "✅ Short-term memory cleared.");
      return;
    }

    await bot.sendChatAction(chatId, "typing").catch(() => {});

    try {
      /* Group turns are EPHEMERAL — they don't read or write personal history,
         and they don't feed the personality extractor. This keeps other group
         members from polluting the owner's private memory. DMs persist. */
      const { reply } = await runPersonalGptTurn(text, { source: "telegram", persist: !isGroup });
      const sendOpts = isGroup ? { reply_to_message_id: msg.message_id } : undefined;
      for (let i = 0; i < reply.length; i += 4000) {
        await bot.sendMessage(chatId, reply.slice(i, i + 4000), sendOpts).catch(() => {});
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
