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

/* ── Model router ─────────────────────────────────────────────────────────
   ONE OpenRouter API key, but the right model is auto-picked per input type:
     • text  → GLM (default — chosen for cost+quality on Bangla/English)
     • voice → Gemini 2.5 Flash (best multimodal for direct audio understanding)
     • image generation → "Nano Banana" = Gemini 2.5 Flash Image Preview
     • personality extraction (background) → cheap GLM 4.5 Air
*/
const CHAT_MODEL    = "z-ai/glm-4.6";                          // primary text model (low cost)
const VOICE_MODEL   = "google/gemini-2.5-flash";               // accepts inline audio (best quality)
const IMAGE_MODEL   = "google/gemini-2.5-flash-image";         // Nano Banana
const EXTRACT_MODEL = "z-ai/glm-4.5-air";                      // ~3x cheaper extractor

/* How many CRM/knowledge notes to surface to the model per prompt. We sort by
   pinned-first then most-recently-updated and cap to keep the prompt short. */
const MAX_NOTES_IN_PROMPT = 40;

/* Categories the user can file a note under. Free-form `note` is the default. */
export const NOTE_CATEGORIES = ["contact", "deal", "project", "task", "date", "note"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export type Note = {
  id: number;
  category: NoteCategory;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

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

/* ── CRM / knowledge notes ──────────────────────────────────────────────── */

function normalizeCategory(c: unknown): NoteCategory {
  return typeof c === "string" && (NOTE_CATEGORIES as readonly string[]).includes(c)
    ? (c as NoteCategory)
    : "note";
}

function rowToNote(r: {
  id: number; category: string; title: string; body: string;
  pinned: boolean; created_at: Date | string; updated_at: Date | string;
}): Note {
  return {
    id: r.id,
    category: normalizeCategory(r.category),
    title: r.title,
    body: r.body,
    pinned: Boolean(r.pinned),
    createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : r.updated_at.toISOString(),
  };
}

export async function listNotes(): Promise<Note[]> {
  const r = await db.execute(sql`
    SELECT id, category, title, body, pinned, created_at, updated_at
    FROM personal_gpt_notes
    ORDER BY pinned DESC, updated_at DESC
  `);
  return (r.rows as Parameters<typeof rowToNote>[0][]).map(rowToNote);
}

export async function addNote(input: { category?: string; title: string; body?: string; pinned?: boolean }): Promise<Note> {
  const category = normalizeCategory(input.category);
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("Note title is required");
  const body = (input.body ?? "").trim().slice(0, 4000);
  const pinned = Boolean(input.pinned);
  const r = await db.execute(sql`
    INSERT INTO personal_gpt_notes (category, title, body, pinned)
    VALUES (${category}, ${title}, ${body}, ${pinned})
    RETURNING id, category, title, body, pinned, created_at, updated_at
  `);
  return rowToNote((r.rows[0] as Parameters<typeof rowToNote>[0]));
}

export async function updateNote(id: number, patch: { category?: string; title?: string; body?: string; pinned?: boolean }): Promise<void> {
  const sets: ReturnType<typeof sql>[] = [];
  if (patch.category !== undefined) sets.push(sql`category = ${normalizeCategory(patch.category)}`);
  if (patch.title !== undefined) {
    const t = patch.title.trim().slice(0, 200);
    if (!t) throw new Error("Note title cannot be empty");
    sets.push(sql`title = ${t}`);
  }
  if (patch.body !== undefined) sets.push(sql`body = ${patch.body.trim().slice(0, 4000)}`);
  if (patch.pinned !== undefined) sets.push(sql`pinned = ${Boolean(patch.pinned)}`);
  if (!sets.length) return;
  sets.push(sql`updated_at = now()`);
  await db.execute(sql`UPDATE personal_gpt_notes SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
}

export async function deleteNote(id: number): Promise<void> {
  await db.execute(sql`DELETE FROM personal_gpt_notes WHERE id = ${id}`);
}

/* Render a compact, model-readable view of the user's notes. We cap to
   MAX_NOTES_IN_PROMPT items to keep the prompt small. */
function renderNotes(notes: Note[]): string {
  if (!notes.length) return "(No notes yet — the user hasn't saved any business context.)";
  const slice = notes.slice(0, MAX_NOTES_IN_PROMPT);
  const byCat = new Map<NoteCategory, Note[]>();
  for (const n of slice) {
    const arr = byCat.get(n.category) ?? [];
    arr.push(n);
    byCat.set(n.category, arr);
  }
  const order: NoteCategory[] = ["contact", "deal", "project", "task", "date", "note"];
  const blocks: string[] = [];
  for (const cat of order) {
    const items = byCat.get(cat);
    if (!items?.length) continue;
    const label = cat.charAt(0).toUpperCase() + cat.slice(1) + "s";
    const lines = items.map(n => {
      const pin = n.pinned ? "📌 " : "";
      const body = n.body ? ` — ${n.body.replace(/\s+/g, " ").slice(0, 200)}` : "";
      return `- ${pin}[#${n.id}] ${n.title}${body}`;
    });
    blocks.push(`### ${label}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
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

/* Skip the personality extractor on trivial messages — short greetings, simple
   acknowledgments, emoji-only messages, slash commands. These never contain
   useful long-term info and would otherwise burn an LLM call per message. */
const TRIVIAL_PATTERNS = [
  /^[\s\p{Emoji}\p{P}]*$/u,                    // emoji / punctuation only
  /^\/\w+/,                                     // slash command
  /^(ok+|okay|k|kk|yes|no|nope|sure|thanks?|thx|ty|cool|nice|lol|lmao|hmm+|hi+|hello|hey|yo|bye|good|great|awesome|haha+|right|fine|got it|thank you)[!.\s]*$/i,
  /^(achcha|accha|hmm|hae|jee|han|na|thik|thanks|dhonnobad|valo|bhalo)[!.\s]*$/i, // banglish
];
function isTrivialMessage(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length < 4) return true;
  return TRIVIAL_PATTERNS.some(re => re.test(t));
}

async function extractPersonalityDelta(userText: string, apiKey: string): Promise<Partial<Personality>> {
  /* Token-saving short-circuit. */
  if (isTrivialMessage(userText)) return {};
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

/* ── Multi-modal: image generation + voice understanding ────────────────── */

/* Detect "generate an image" intent in plain text. Triggers the image model
   instead of the text model. Supports English + Bangla + Banglish keywords.
   Explicit `/image …` always wins over heuristics. */
const IMAGE_INTENT_RE = new RegExp(
  [
    "^/(image|img|draw|picture|chobi)\\b",
    "\\b(generate|create|make|draw|design|render)\\s+(?:\\w+\\s+){0,5}?(image|picture|photo|illustration|drawing|art|logo|poster|mockup)",
    "\\b(image|picture|photo|chobi)\\s+(banao|banaye?\\s*do|generate|create|make|draw)",
    "\\b(banao|banaye?\\s*do|create|generate|draw|design)\\s+(?:\\w+\\s+){0,5}?(image|picture|photo|chobi|illustration|logo|poster|design)",
  ].join("|"),
  "i",
);
function isImageRequest(text: string): boolean {
  return IMAGE_INTENT_RE.test(text.trim());
}
/* Strip the `/image` (or aliases) prefix when present so the model sees a
   clean prompt. */
function extractImagePrompt(text: string): string {
  return text.trim().replace(/^\/(image|img|draw|picture|chobi)\s+/i, "").trim();
}

/**
 * Generate an image via OpenRouter using the Nano Banana model. The
 * chat-completions endpoint with `modalities: ["image","text"]` returns
 * the image inline in the assistant message. Returns the raw bytes plus
 * any caption text the model produced.
 */
export async function generateImage(prompt: string): Promise<{ bytes: Buffer; mimeType: string; caption: string }> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  if (!prompt.trim()) throw new Error("Image prompt is empty.");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
      "X-Title": "Advantix Personal GPT",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt.slice(0, 4000) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Image generation failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    choices?: { message?: { content?: string; images?: { image_url?: { url?: string } }[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  const imgUrl = msg?.images?.[0]?.image_url?.url;
  if (!imgUrl) throw new Error("Model did not return an image.");

  /* The image arrives as a `data:image/<type>;base64,<payload>` URL. */
  const m = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Unexpected image URL format from model.");
  return {
    bytes: Buffer.from(m[2], "base64"),
    mimeType: m[1],
    caption: (msg?.content ?? "").trim(),
  };
}

/**
 * Send an audio clip + optional text to the multimodal voice model and get a
 * text reply. Used when the user sends a Telegram voice/audio note. Audio is
 * inlined as base64 — fine for typical voice-note sizes (under a few MB).
 */
export async function answerFromVoice(input: {
  audioBase64: string;
  audioFormat: "ogg" | "mp3" | "wav" | "m4a" | "webm";
  systemPrompt: string;
  history: RecentTurn[];
  promptHint?: string;
}): Promise<string> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  /* OpenAI-compatible multimodal content blocks. The hint nudges the model
     to actually answer the spoken question rather than just transcribe it. */
  const userContent = [
    { type: "text", text: input.promptHint ?? "Listen to this voice message and reply naturally, in the same language the user spoke." },
    { type: "input_audio", input_audio: { data: input.audioBase64, format: input.audioFormat } },
  ];

  const messages = [
    { role: "system", content: [{ type: "text", text: input.systemPrompt, cache_control: { type: "ephemeral" } }] },
    ...input.history.map(t => ({ role: t.role, content: t.content })),
    { role: "user", content: userContent },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
      "X-Title": "Advantix Personal GPT",
    },
    body: JSON.stringify({
      model: VOICE_MODEL,
      temperature: 0.8,
      max_tokens: 1500,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voice reply failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Voice model returned an empty reply.");
  return reply;
}

/**
 * Convenience: run a full voice turn the same way runPersonalGptTurn does for
 * text — load settings, build system prompt with notes/personality, call the
 * multimodal model, then persist & extract personality from a transcript hint
 * if provided. Returns the reply.
 */
export async function runPersonalGptVoiceTurn(args: {
  audioBase64: string;
  audioFormat: "ogg" | "mp3" | "wav" | "m4a" | "webm";
  source: "telegram" | "web";
  persist: boolean;
}): Promise<{ reply: string }> {
  const settings = await loadSettings();
  if (!settings.enabled) throw new Error("Personal GPT is disabled in settings");

  const notes = args.persist ? await listNotes().catch(() => [] as Note[]) : [];
  const fullSystemPrompt = buildSystemPrompt(settings, args.persist, notes);
  const history = args.persist ? await loadRecentTurns() : [];

  const reply = await answerFromVoice({
    audioBase64: args.audioBase64,
    audioFormat: args.audioFormat,
    systemPrompt: fullSystemPrompt,
    history,
  });

  if (args.persist) {
    /* We don't have the transcript ourselves (model handled it internally),
       so we record a placeholder for short-term context. The bot's reply is
       still useful in history; the audio itself isn't replayable from text. */
    await appendTurn("user", "🎤 (voice message)", args.source);
    await appendTurn("assistant", reply, args.source);
  }
  return { reply };
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
  notes: Note[] = [],
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
    "",
    "## Knowledge base / CRM (saved by the user — quote IDs like #12 if you reference one)",
    renderNotes(notes),
    "",
    "## How to use the knowledge base",
    "- Treat saved contacts, deals, projects, tasks and dates as authoritative facts.",
    "- When the user asks something like \"who is X?\" or \"what's the status of Y?\", check the knowledge base first.",
    "- If the user clearly tells you something worth remembering long-term (a person, a project, a deadline), suggest they save it with /remember in Telegram or via the Memory tab.",
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
     personality profile + notes so group conversations can't pull in or leak
     private context. DM/web turns get the full memory. */
  const notes = opts.persist ? await listNotes().catch(() => [] as Note[]) : [];
  const fullSystemPrompt = buildSystemPrompt(settings, opts.persist, notes);
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
    const notes = await listNotes().catch(() => [] as Note[]);
    const fullSystemPrompt = buildSystemPrompt(settings, true, notes);
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
 * Send a test message to all configured chat IDs to verify the Telegram
 * connection works end-to-end (token valid + chat IDs reachable).
 * Returns the number of chats successfully delivered to plus any errors.
 */
export async function sendPersonalGptTestMessage(): Promise<{
  delivered: number;
  failed: { chatId: number; error: string }[];
}> {
  const settings = await loadSettings();
  if (!settings.telegramBotToken) throw new Error("Bot token is not configured.");
  const chatIds = parseAllowedChatIds(settings.telegramChatId);
  if (chatIds.length === 0) throw new Error("No allowed chat IDs configured.");

  /* Use the running instance if available, otherwise create a one-shot client
     (no polling) so we don't fight the long-poller for updates. */
  const bot = pgBotInstance ?? new TelegramBot(settings.telegramBotToken, { polling: false });

  const failed: { chatId: number; error: string }[] = [];
  let delivered = 0;
  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(
        chatId,
        "✅ <b>Personal GPT — Test Message</b>\n\nYour Telegram connection is working. Send any message to chat with the bot.",
        { parse_mode: "HTML" }
      );
      delivered += 1;
    } catch (err) {
      failed.push({ chatId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { delivered, failed };
}

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
      await bot.sendMessage(chatId,
        "👋 Personal GPT is ready. Just message me.\n\n" +
        "Commands (DM only):\n" +
        "• /remember <category> <title> | <body>  — save to your knowledge base\n" +
        "    categories: contact, deal, project, task, date, note (default: note)\n" +
        "    examples:\n" +
        "      /remember contact Sajjad | CTO at Foo Ltd, +880…\n" +
        "      /remember task Send invoice to ACME by Friday\n" +
        "• /notes [category]  — list saved notes\n" +
        "• /forget <id>  — delete a note by its ID (e.g. /forget 12)\n" +
        "• /clear  — wipe short-term chat memory\n",
      );
      return;
    }
    /* /clear, /remember, /notes, /forget only make sense in DM. */
    if (!isGroup) {
      if (text === "/clear") {
        await clearRecentTurns().catch(() => {});
        await bot.sendMessage(chatId, "✅ Short-term memory cleared.");
        return;
      }
      if (text.startsWith("/remember")) {
        const rest = text.slice("/remember".length).trim();
        if (!rest) {
          await bot.sendMessage(chatId,
            "Usage: /remember <category> <title> | <body>\n" +
            "Example: /remember contact Sajjad | CTO at Foo Ltd, +880…",
          );
          return;
        }
        /* Optional first word = category if it matches. Body is anything after "|". */
        const firstSpace = rest.indexOf(" ");
        const maybeCat = firstSpace === -1 ? rest : rest.slice(0, firstSpace).toLowerCase();
        const hasCat = (NOTE_CATEGORIES as readonly string[]).includes(maybeCat);
        const afterCat = hasCat ? rest.slice(firstSpace + 1).trim() : rest;
        const pipeIdx = afterCat.indexOf("|");
        const title = (pipeIdx === -1 ? afterCat : afterCat.slice(0, pipeIdx)).trim();
        const body = pipeIdx === -1 ? "" : afterCat.slice(pipeIdx + 1).trim();
        if (!title) {
          await bot.sendMessage(chatId, "⚠️ Note title is required.");
          return;
        }
        try {
          const note = await addNote({ category: hasCat ? maybeCat : "note", title, body });
          await bot.sendMessage(chatId, `✅ Saved as ${note.category} #${note.id}: ${note.title}`);
        } catch (err) {
          await bot.sendMessage(chatId, `⚠️ ${String(err instanceof Error ? err.message : err)}`);
        }
        return;
      }
      if (text === "/notes" || text.startsWith("/notes ")) {
        const filter = text.slice("/notes".length).trim().toLowerCase();
        const all = await listNotes().catch(() => [] as Note[]);
        const items = filter
          ? all.filter(n => n.category === filter)
          : all;
        if (!items.length) {
          await bot.sendMessage(chatId, filter ? `No notes in "${filter}".` : "No notes yet. Use /remember to add one.");
          return;
        }
        const lines = items.slice(0, 50).map(n =>
          `${n.pinned ? "📌 " : ""}#${n.id} [${n.category}] ${n.title}${n.body ? " — " + n.body.slice(0, 120) : ""}`,
        );
        const more = items.length > 50 ? `\n…and ${items.length - 50} more.` : "";
        await bot.sendMessage(chatId, lines.join("\n") + more);
        return;
      }
      const forgetMatch = text.match(/^\/forget\s+(\d+)\s*$/);
      if (forgetMatch) {
        const id = Number(forgetMatch[1]);
        await deleteNote(id).catch(() => {});
        await bot.sendMessage(chatId, `🗑️ Deleted note #${id}.`);
        return;
      }
    }

    /* Image generation intent — auto-routes to the Nano Banana model.
       Works in DM and groups (when mentioned). Image gen never touches
       personal memory either way. */
    if (isImageRequest(text)) {
      const prompt = extractImagePrompt(text);
      if (!prompt) {
        await bot.sendMessage(chatId, "Tell me what to draw, e.g. `/image a cyberpunk city at dusk`.", {
          parse_mode: "Markdown",
        }).catch(() => {});
        return;
      }
      await bot.sendChatAction(chatId, "upload_photo").catch(() => {});
      try {
        const { bytes, caption } = await generateImage(prompt);
        const sendOpts = {
          caption: (caption || prompt).slice(0, 1000),
          ...(isGroup ? { reply_to_message_id: msg.message_id } : {}),
        };
        await bot.sendPhoto(chatId, bytes, sendOpts);
      } catch (err) {
        logger.error({ err }, "Personal GPT image generation failed");
        await bot.sendMessage(chatId, `⚠️ Image generation failed: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`).catch(() => {});
      }
      return;
    }

    await bot.sendChatAction(chatId, "typing").catch(() => {});

    try {
      /* Group turns are EPHEMERAL — they don't read or write personal history,
         and they don't feed the personality extractor. This keeps other group
         members from polluting the owner's private memory. DMs persist. */
      const { reply } = await runPersonalGptTurn(text, { source: "telegram", persist: !isGroup });
      const sendOpts = { reply_to_message_id: msg.message_id };
      for (let i = 0; i < reply.length; i += 4000) {
        await bot.sendMessage(chatId, reply.slice(i, i + 4000), sendOpts).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, "Personal GPT Telegram turn failed");
      await bot.sendMessage(chatId, `⚠️ ${String(err instanceof Error ? err.message : err).slice(0, 300)}`).catch(() => {});
    }
  });

  /* ── Voice / audio handler ─────────────────────────────────────────────
     Downloads the audio, base64-encodes it, and routes to the multimodal
     voice model. Same allowed-chat / group-ephemeral rules as text. */
  const handleVoiceLike = async (msg: TelegramBot.Message, fileId: string, format: "ogg" | "mp3" | "wav" | "m4a" | "webm") => {
    const chatId = msg.chat.id;
    if (!allowedChatIds.includes(chatId)) return;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    /* In groups, only react if user replied to one of our messages — voice
       notes don't carry @mentions, so reply-to is the only safe trigger. */
    if (isGroup && msg.reply_to_message?.from?.username !== pgBotUsername) return;

    await bot.sendChatAction(chatId, "typing").catch(() => {});
    try {
      const url = await bot.getFileLink(fileId);
      const fileRes = await fetch(url);
      if (!fileRes.ok) throw new Error(`Couldn't download voice (HTTP ${fileRes.status})`);
      const buf = Buffer.from(await fileRes.arrayBuffer());
      /* Telegram caps voice notes at 1 minute / a few MB; this is comfortably
         under what the model accepts inline. */
      if (buf.byteLength > 20 * 1024 * 1024) throw new Error("Voice clip too large.");
      const audioBase64 = buf.toString("base64");

      const { reply } = await runPersonalGptVoiceTurn({
        audioBase64,
        audioFormat: format,
        source: "telegram",
        persist: !isGroup,
      });
      const sendOpts = isGroup ? { reply_to_message_id: msg.message_id } : undefined;
      for (let i = 0; i < reply.length; i += 4000) {
        await bot.sendMessage(chatId, reply.slice(i, i + 4000), sendOpts).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, "Personal GPT voice turn failed");
      await bot.sendMessage(chatId, `⚠️ ${String(err instanceof Error ? err.message : err).slice(0, 300)}`).catch(() => {});
    }
  };

  bot.on("voice", (msg) => {
    if (msg.voice?.file_id) void handleVoiceLike(msg, msg.voice.file_id, "ogg");
  });
  bot.on("audio", (msg) => {
    if (!msg.audio?.file_id) return;
    /* Best-effort format pick from MIME type. Most uploads are mp3 or m4a. */
    const mime = msg.audio.mime_type ?? "";
    const fmt: "mp3" | "m4a" | "wav" | "ogg" =
      /mp3|mpeg/i.test(mime) ? "mp3" :
      /m4a|mp4|aac/i.test(mime) ? "m4a" :
      /wav/i.test(mime) ? "wav" :
      "ogg";
    void handleVoiceLike(msg, msg.audio.file_id, fmt);
  });
}

export function isPersonalGptBotRunning(): boolean {
  return pgBotInstance !== null;
}
