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
const MAX_LIST_ITEMS = 200;
const MAX_ITEM_LENGTH = 280;
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
/* Reminder time parsing needs accurate Bengali numeral + relative-time
   resolution; GLM-air struggles with "পাঁচটা পনেরো" → 5:15. Gemini Flash
   is multilingual and fast — small premium worth it for correctness. */
const REMINDER_EXTRACT_MODEL = "google/gemini-2.5-flash";

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

export async function loadRecentTurns(): Promise<RecentTurn[]> {
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
  /* Dual-write: rolling window (recent) for cheap context lookups + permanent
     archive (never pruned) so the user can view their entire history later. */
  await db.execute(sql`
    INSERT INTO personal_gpt_recent (role, content, source) VALUES (${role}, ${content}, ${source})
  `);
  await db.execute(sql`
    INSERT INTO personal_gpt_archive (role, content, source) VALUES (${role}, ${content}, ${source})
  `).catch(err => logger.warn({ err }, "Personal GPT: failed to append archive turn"));
  /* Prune anything beyond the rolling window. The id-desc OFFSET trick keeps
     the most recent N rows; everything older is deleted in one statement. */
  await db.execute(sql`
    DELETE FROM personal_gpt_recent
    WHERE id NOT IN (
      SELECT id FROM personal_gpt_recent ORDER BY id DESC LIMIT ${RECENT_ROWS_KEEP}
    )
  `);
}

export type ArchiveTurn = {
  id: number;
  role: "user" | "assistant";
  content: string;
  source: string;
  createdAt: string;
};

export type ArchiveStats = {
  total: number;
  userTurns: number;
  assistantTurns: number;
  bySource: Record<string, number>;
  firstAt: string | null;
  lastAt: string | null;
};

/**
 * Paginated browse of the permanent archive. Newest first. Optional `search`
 * does a case-insensitive substring match against `content`.
 */
export async function loadArchive(opts: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<{ items: ArchiveTurn[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const search = opts.search?.trim() ?? "";

  const where = search
    ? sql`WHERE content ILIKE ${"%" + search + "%"}`
    : sql``;

  const rowsRes = await db.execute(sql`
    SELECT id, role, content, source, created_at
    FROM personal_gpt_archive
    ${where}
    ORDER BY id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM personal_gpt_archive ${where}
  `);

  const items = (rowsRes.rows as { id: number; role: string; content: string; source: string; created_at: Date | string }[])
    .filter(r => r.role === "user" || r.role === "assistant")
    .map(r => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      source: r.source,
      createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
    }));
  const total = (countRes.rows[0] as { n?: number } | undefined)?.n ?? 0;
  return { items, total };
}

export async function loadArchiveStats(): Promise<ArchiveStats> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                    AS total,
      COUNT(*) FILTER (WHERE role = 'user')::int                       AS user_turns,
      COUNT(*) FILTER (WHERE role = 'assistant')::int                  AS assistant_turns,
      MIN(created_at)                                                  AS first_at,
      MAX(created_at)                                                  AS last_at
    FROM personal_gpt_archive
  `);
  const head = (r.rows[0] ?? {}) as {
    total?: number; user_turns?: number; assistant_turns?: number;
    first_at?: Date | string | null; last_at?: Date | string | null;
  };
  const sourceRes = await db.execute(sql`
    SELECT source, COUNT(*)::int AS n FROM personal_gpt_archive GROUP BY source
  `);
  const bySource: Record<string, number> = {};
  for (const row of sourceRes.rows as { source: string; n: number }[]) {
    bySource[row.source] = row.n;
  }
  const iso = (v: Date | string | null | undefined): string | null =>
    v == null ? null : (typeof v === "string" ? v : v.toISOString());
  return {
    total: head.total ?? 0,
    userTurns: head.user_turns ?? 0,
    assistantTurns: head.assistant_turns ?? 0,
    bySource,
    firstAt: iso(head.first_at),
    lastAt: iso(head.last_at),
  };
}

export async function clearRecentTurns(): Promise<void> {
  await db.execute(sql`DELETE FROM personal_gpt_recent`);
}

/* ── Backup / restore ──────────────────────────────────────────────────────
   The user wants a single JSON file that captures EVERYTHING the AI has
   learned: their personality profile, every CRM/knowledge note, and the
   permanent conversation archive. Exported as a versioned object so future
   schema changes can be migrated. Import runs in `replace` mode by default
   so a restore brings the AI back to exactly the state it was in. */

export type PersonalGptBackup = {
  /* Bumped to v2 when reminders were added. v1 backups are still accepted on
     import (the reminders block is just treated as empty). */
  version: 1 | 2;
  exportedAt: string;
  personality: Personality;
  notes: Array<Pick<Note, "category" | "title" | "body" | "pinned" | "createdAt" | "updatedAt">>;
  archive: ArchiveTurn[];
  /* Optional in v1 for back-compat. Always present in v2 exports. */
  reminders?: Array<Pick<Reminder, "message" | "remindAt" | "chatId" | "source" | "status" | "createdAt" | "firedAt">>;
};

export async function exportAll(): Promise<PersonalGptBackup> {
  const settings = await loadSettings();
  const notes = await listNotes();
  /* Pull the entire archive in one shot — no pagination. For very large
     archives this is fine because export is a manual user action, not a hot
     path. */
  const r = await db.execute(sql`
    SELECT id, role, content, source, created_at
    FROM personal_gpt_archive
    ORDER BY id ASC
  `);
  const archive: ArchiveTurn[] = (r.rows as { id: number; role: string; content: string; source: string; created_at: Date | string }[])
    .filter(row => row.role === "user" || row.role === "assistant")
    .map(row => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      source: row.source,
      createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
    }));

  /* Reminders — pull every row (pending + history) so a restore brings back
     scheduled pings AND the audit trail of past fires. The scheduler will
     pick up any restored "pending" rows on its next 30s poll. */
  const remRes = await db.execute(sql`
    SELECT id, message, remind_at, chat_id, source, status, created_at, fired_at
    FROM personal_gpt_reminders
    ORDER BY id ASC
  `);
  const reminders = (remRes.rows as Record<string, unknown>[])
    .map(rowToReminder)
    .map(r => ({
      message: r.message,
      remindAt: r.remindAt,
      chatId: r.chatId,
      source: r.source,
      status: r.status,
      createdAt: r.createdAt,
      firedAt: r.firedAt,
    }));

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    personality: settings.personality,
    notes: notes.map(n => ({
      category: n.category, title: n.title, body: n.body, pinned: n.pinned,
      createdAt: n.createdAt, updatedAt: n.updatedAt,
    })),
    archive,
    reminders,
  };
}

export type ImportMode = "replace" | "merge";
export type ImportResult = {
  mode: ImportMode;
  personalityRestored: boolean;
  notesImported: number;
  archiveImported: number;
  remindersImported: number;
};

/**
 * Restore from a backup blob. In `replace` mode (default) the AI is wiped
 * back to a clean slate first, so the result is *exactly* what was exported
 * — no leftover learned data. In `merge` mode personality lists are unioned,
 * notes are appended, and archive turns are appended.
 */
export async function importAll(backup: unknown, mode: ImportMode = "replace"): Promise<ImportResult> {
  if (!backup || typeof backup !== "object") throw new Error("Backup is empty or not an object");
  const b = backup as Partial<PersonalGptBackup>;
  /* Accept v1 (pre-reminders) and v2 (current) — anything else is unknown. */
  if (b.version !== 1 && b.version !== 2) throw new Error(`Unsupported backup version: ${String(b.version)}`);

  const personality = normalizePersonality(b.personality ?? EMPTY_PERSONALITY);
  const notes = Array.isArray(b.notes) ? b.notes : [];
  const archive = Array.isArray(b.archive) ? b.archive : [];
  const reminders = Array.isArray(b.reminders) ? b.reminders : [];

  const result: ImportResult = { mode, personalityRestored: false, notesImported: 0, archiveImported: 0, remindersImported: 0 };

  /* Wrap the whole restore in a transaction. If ANY step fails (bad row,
     connection drop, malformed JSON), we roll back so the user is never left
     with a half-wiped database. Especially critical for `replace` mode which
     starts with destructive DELETEs. */
  await db.transaction(async (tx) => {
    /* Compute the personality to write — `replace` uses the backup as-is,
       `merge` unions lists with whatever's already there. */
    let personalityToWrite: Personality = personality;
    if (mode === "merge") {
      const curRows = await tx.execute(sql`SELECT personality FROM personal_gpt_settings WHERE id = 1`);
      const curRaw = (curRows.rows[0] as { personality?: unknown } | undefined)?.personality;
      const cur = normalizePersonality(curRaw ?? EMPTY_PERSONALITY);
      const mergeLists = (incoming: string[], current: string[]) => {
        const seen = new Set(current.map(s => s.toLowerCase()));
        const out = [...current];
        for (const item of incoming) if (!seen.has(item.toLowerCase())) { out.push(item); seen.add(item.toLowerCase()); }
        return out;
      };
      personalityToWrite = normalizePersonality({
        style: personality.style || cur.style,
        facts: mergeLists(personality.facts, cur.facts),
        habits: mergeLists(personality.habits, cur.habits),
        likes: mergeLists(personality.likes, cur.likes),
        dislikes: mergeLists(personality.dislikes, cur.dislikes),
      });
    }

    if (mode === "replace") {
      /* Full wipe — bring the AI back to exactly the snapshot. */
      await tx.execute(sql`DELETE FROM personal_gpt_archive`);
      await tx.execute(sql`DELETE FROM personal_gpt_recent`);
      await tx.execute(sql`DELETE FROM personal_gpt_notes`);
      await tx.execute(sql`DELETE FROM personal_gpt_reminders`);
    }

    /* Update the personality JSONB on the singleton settings row. We do this
       inside the transaction (raw, so we don't depend on updateSettings which
       holds its own connection) to keep the restore truly atomic. */
    await tx.execute(sql`
      UPDATE personal_gpt_settings
      SET personality = ${JSON.stringify(personalityToWrite)}::jsonb
      WHERE id = 1
    `);
    result.personalityRestored = true;

    /* Re-insert notes. We don't try to preserve the old `id` (it's a serial),
       but we do preserve created_at / updated_at so timeline order survives. */
    for (const n of notes) {
      if (!n || typeof n !== "object") continue;
      const title = String((n as { title?: unknown }).title ?? "").trim().slice(0, 200);
      if (!title) continue;
      const category = normalizeCategory((n as { category?: unknown }).category);
      const body = String((n as { body?: unknown }).body ?? "").trim().slice(0, 4000);
      const pinned = Boolean((n as { pinned?: unknown }).pinned);
      const createdAt = parseTs((n as { createdAt?: unknown }).createdAt);
      const updatedAt = parseTs((n as { updatedAt?: unknown }).updatedAt);
      await tx.execute(sql`
        INSERT INTO personal_gpt_notes (category, title, body, pinned, created_at, updated_at)
        VALUES (${category}, ${title}, ${body}, ${pinned},
                COALESCE(${createdAt}, now()), COALESCE(${updatedAt}, now()))
      `);
      result.notesImported++;
    }

    /* Re-insert archive turns, preserving timestamps. We DON'T try to keep the
       original ids — serial doesn't allow that without messing with the
       sequence. The recent-turn rolling window will be naturally rebuilt as
       soon as the user sends new messages. */
    for (const t of archive) {
      if (!t || typeof t !== "object") continue;
      const role = (t as { role?: unknown }).role;
      if (role !== "user" && role !== "assistant") continue;
      const content = String((t as { content?: unknown }).content ?? "");
      if (!content) continue;
      const source = String((t as { source?: unknown }).source ?? "web").slice(0, 100);
      const createdAt = parseTs((t as { createdAt?: unknown }).createdAt);
      await tx.execute(sql`
        INSERT INTO personal_gpt_archive (role, content, source, created_at)
        VALUES (${role}, ${content}, ${source}, COALESCE(${createdAt}, now()))
      `);
      result.archiveImported++;
    }

    /* Re-insert reminders. Status is preserved — pending rows resume firing
       on the next scheduler poll, fired/cancelled rows keep their audit
       history. Skip rows that look obviously broken (no message or no time). */
    const validStatuses = new Set(["pending", "sent", "failed", "cancelled"]);
    for (const r of reminders) {
      if (!r || typeof r !== "object") continue;
      const message = String((r as { message?: unknown }).message ?? "").trim().slice(0, MAX_REMINDER_TEXT);
      if (!message) continue;
      const remindAt = parseTs((r as { remindAt?: unknown }).remindAt);
      if (!remindAt) continue;
      const rawChatId = (r as { chatId?: unknown }).chatId;
      const chatId = typeof rawChatId === "number" && Number.isFinite(rawChatId)
        ? rawChatId
        : (typeof rawChatId === "string" && /^-?\d+$/.test(rawChatId) ? Number(rawChatId) : null);
      const source = String((r as { source?: unknown }).source ?? "telegram").slice(0, 50);
      const rawStatus = String((r as { status?: unknown }).status ?? "pending");
      const status = validStatuses.has(rawStatus) ? rawStatus : "pending";
      const createdAt = parseTs((r as { createdAt?: unknown }).createdAt);
      const firedAt = parseTs((r as { firedAt?: unknown }).firedAt);
      await tx.execute(sql`
        INSERT INTO personal_gpt_reminders (message, remind_at, chat_id, source, status, created_at, fired_at)
        VALUES (${message}, ${remindAt}, ${chatId}, ${source}, ${status},
                COALESCE(${createdAt}, now()), ${firedAt})
      `);
      result.remindersImported++;
    }
  });

  return result;
}

/* Coerce a value into a Date for INSERT, or null if it isn't a valid timestamp. */
function parseTs(v: unknown): Date | null {
  if (typeof v !== "string" && !(v instanceof Date)) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

/* ── Reminders ────────────────────────────────────────────────────────────
   Time-based pings. The user says something like "amake 3:55 te meeting er
   kotha mone koray dio" and the cheap extractor model returns a structured
   {whenISO, message}. We persist the reminder; a background poller (started
   alongside the Telegram bot) fires due rows by sending a Telegram message.
   The user's local timezone is fixed to Asia/Dhaka (Bangladesh) — the user
   is single-tenant so a hardcoded TZ is the simplest correct choice. */

const REMINDER_TZ = "Asia/Dhaka";          // single-tenant — owner is in BD
const REMINDER_TZ_OFFSET = "+06:00";       // BD has no DST, so a constant offset is safe
const REMINDER_POLL_INTERVAL_MS = 30_000;  // 30s — accurate enough for human reminders
const MAX_REMINDER_TEXT = 500;

export type Reminder = {
  id: number;
  message: string;
  remindAt: string;       // ISO UTC
  chatId: number | null;
  source: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: string;
  firedAt: string | null;
};

function rowToReminder(r: Record<string, unknown>): Reminder {
  return {
    id: Number(r.id),
    message: String(r.message),
    remindAt: new Date(r.remind_at as string | Date).toISOString(),
    chatId: r.chat_id == null ? null : Number(r.chat_id),
    source: String(r.source ?? "telegram"),
    status: (r.status as Reminder["status"]) ?? "pending",
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    firedAt: r.fired_at ? new Date(r.fired_at as string | Date).toISOString() : null,
  };
}

export async function createReminder(input: {
  message: string;
  remindAt: Date | string;
  chatId?: number | null;
  source?: string;
}): Promise<Reminder> {
  const message = String(input.message ?? "").trim().slice(0, MAX_REMINDER_TEXT);
  if (!message) throw new Error("Reminder message is empty.");
  const when = new Date(input.remindAt);
  if (isNaN(when.getTime())) throw new Error("Reminder time is invalid.");
  const r = await db.execute(sql`
    INSERT INTO personal_gpt_reminders (message, remind_at, chat_id, source)
    VALUES (${message}, ${when}, ${input.chatId ?? null}, ${input.source ?? "telegram"})
    RETURNING *
  `);
  return rowToReminder(r.rows[0] as Record<string, unknown>);
}

export async function listPendingReminders(): Promise<Reminder[]> {
  const r = await db.execute(sql`
    SELECT * FROM personal_gpt_reminders
    WHERE status = 'pending'
    ORDER BY remind_at ASC
    LIMIT 200
  `);
  return r.rows.map(row => rowToReminder(row as Record<string, unknown>));
}

/* Admin view: pending reminders (all, future and overdue) plus recent
   fired/cancelled ones from the last 24 hours so the user can verify that
   chat-triggered reminders actually got created and fired. */
export async function listRemindersForAdmin(): Promise<Reminder[]> {
  const r = await db.execute(sql`
    SELECT * FROM personal_gpt_reminders
    WHERE status = 'pending'
       OR (status IN ('sent','cancelled','failed') AND COALESCE(fired_at, created_at) > NOW() - INTERVAL '24 hours')
    ORDER BY
      CASE status WHEN 'pending' THEN 0 ELSE 1 END,
      remind_at ASC
    LIMIT 200
  `);
  return r.rows.map(row => rowToReminder(row as Record<string, unknown>));
}

export async function cancelReminder(id: number): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE personal_gpt_reminders SET status = 'cancelled' WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `);
  return r.rows.length > 0;
}

/* Format a UTC ISO instant in the user's local TZ for display in the
   confirmation message ("4:00 PM today" etc). Keeps things human-friendly. */
function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      timeZone: REMINDER_TZ,
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

/* Use the cheap extractor model in JSON mode to detect reminder intent and
   resolve relative phrases ("tomorrow at 4", "in 30 min", "3:55 te"). The
   model is given the current local time + TZ so it can produce an absolute
   ISO timestamp. Returns null if the user is NOT asking for a reminder. */
/* Cheap regex pre-filter for "is this a reminder request?". Exported so the
   text/voice handlers can also use it to give the user a clearer message
   when extraction fails (vs. silently letting the chat model hallucinate
   "set kore dilam"). Covers English + Banglish + Bengali script. */
export function looksLikeReminderShape(text: string): boolean {
  return /\b(remind|reminder|alert|wake|notify|alarm)\b/i.test(text)
    || /\b(at|by|in|after|before|on)\s+\d/i.test(text)
    || /\b(tomorrow|tonight|today|tmrw|next)\b/i.test(text)
    || /mone\s*kor(ay)?\s*d(a|i)o/i.test(text)
    || /\bmone\s*koray\b/i.test(text)
    || /\bmne\s*koray\b/i.test(text)
    || /\bagamikal\b/i.test(text)
    || /\bajke\b/i.test(text)
    || /\bporshu\b/i.test(text)
    /* Catch casual time-only phrasings like "5 min pore", "10 minute por",
       "kal sokal 9 tay", "bikel 4 tay test" — common Banglish reminder
       shapes that didn't include the "remind"/"alert" keyword. */
    || /\b\d+\s*(min|minute|ghonta|hour|hr|sec|second|din|day)\s*(pore|por|later|after)\b/i.test(text)
    || /\b(kal|kaal|aj|aaj|aajke|ajke|ekhon|akhon|sokal|bikal|bikel|raat|rat|dupur|sondha|shondha)\b/i.test(text)
    || /\b\d{1,2}([:.]\d{2})?\s*(ta|tay|baje|baja|am|pm|a\.m|p\.m)\b/i.test(text)
    /* Bengali-script triggers — voice transcripts often come back in native
       script ("রিমাইন্ডার", "মনে করিয়ে", "একটু পরে", "আজকে"). */
    || /রিমাইন্ডার|মনে\s*করিয়ে|মনে\s*কর|আজকে|আগামীকাল|পরশু|একটু\s*পরে/.test(text)
    || /\b(am|pm|এএম|পিএম|এ\.এম|পি\.এম)\b/i.test(text);
}

/* Discriminated result so call sites can distinguish:
   - null              → not a reminder request, let normal chat handle it
   - { kind: "ok" }    → success, create the row
   - { kind: "unparseable" } → LLM thought it was a reminder but couldn't
                              lock a future time (past time, ambiguous, etc).
                              Call site should show a clarifying message
                              instead of letting the chat model hallucinate.
*/
export type ReminderIntentResult =
  | { kind: "ok"; remindAt: string; message: string }
  | { kind: "unparseable" };

export async function extractReminderIntent(userText: string, apiKey: string): Promise<ReminderIntentResult | null> {
  const text = userText.trim();
  if (!text) return null;

  if (!looksLikeReminderShape(text)) return null;

  const nowLocal = new Date().toLocaleString("en-US", {
    timeZone: REMINDER_TZ,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  const sysPrompt =
    `You are a reminder intent extractor. Decide if the user is asking to be reminded at a specific time. ` +
    `Current local time (${REMINDER_TZ}): ${nowLocal}. The user may write in English, Bengali (Bengali script), ` +
    `or Banglish (romanized Bangla). Bengali numerals (০১২৩৪৫৬৭৮৯) map to (0123456789). ` +
    `Bengali time words: "পাঁচটা" / "পাচটা" = 5 o'clock, "পনেরো" = 15, "পাঁচটা পনেরো" = 5:15, ` +
    `"সাড়ে পাঁচটা" = 5:30, "এএম" = AM, "পিএম" = PM, "সকাল" = morning, "বিকেল/বিকাল" = afternoon, ` +
    `"রাত" = night, "দুপুর" = noon, "আজকে/আজ" = today, "আগামীকাল/কাল" = tomorrow, "পরশু" = day after tomorrow, ` +
    `"মিনিট পরে" = "minutes later", "ঘন্টা পরে" = "hours later", "একটু পরে" = "a bit later" (~30 min). ` +
    `Resolve relative phrases. If a time is given without AM/PM (e.g. "3:55" or "পাঁচটা পনেরো"), pick ` +
    `whichever of AM/PM is in the FUTURE relative to now — prefer the same day, else next day. ` +
    `If the resolved time would be in the past (already happened today), use TOMORROW at that time. ` +
    `ALWAYS return isReminder:true if the user asks to set/create a reminder, even if time is fuzzy — ` +
    `make your best guess at a future time. Reply with STRICT JSON only, no markdown, no commentary:\n` +
    `  {"isReminder": true, "remindAt": "<ISO 8601 with +06:00 offset>", "message": "<short reminder text in user's language>"}\n` +
    `  or {"isReminder": false}\n` +
    `The "message" must be the THING to be reminded about (not the request itself). ` +
    `Examples (assume current time is 5:10 AM Asia/Dhaka):\n` +
    `  "remind me at 4pm tomorrow about the meeting" → {"isReminder":true,"remindAt":"<tomorrow>T16:00:00+06:00","message":"meeting"}\n` +
    `  "amake 3.55 te bookcafe meeting er kotha mone koray dio" → {"isReminder":true,"remindAt":"...T15:55:00+06:00","message":"Bookcafe meeting"}\n` +
    `  "পাঁচটা পনেরোতে একটা রিমাইন্ডার সেট করো test" → {"isReminder":true,"remindAt":"<today>T05:15:00+06:00","message":"test"}\n` +
    `  "৫:১৫ এ test reminder" → {"isReminder":true,"remindAt":"<today>T05:15:00+06:00","message":"test"}\n` +
    `  "5 minute pore namaz reminder" → {"isReminder":true,"remindAt":"<now+5min>","message":"namaz"}\n` +
    `  "what's the weather today" → {"isReminder":false}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
    },
    body: JSON.stringify({
      model: REMINDER_EXTRACT_MODEL,
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: text.slice(0, 1000) },
      ],
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Reminder extractor HTTP error");
    return null;
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    logger.warn({ text: text.slice(0, 200) }, "Reminder extractor: empty LLM response");
    /* Empty response after prefilter hit — treat as unparseable rather than
       silent fall-through, since the prefilter thought there was intent. */
    return { kind: "unparseable" };
  }
  logger.info({ raw: raw.slice(0, 400), text: text.slice(0, 200), nowLocal }, "Reminder extractor: raw LLM response");
  try {
    /* The model occasionally wraps JSON in ```json fences despite being asked
       not to. Strip a single leading/trailing fence pair before parsing. */
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { isReminder?: boolean; remindAt?: string; message?: string };
    /* Model explicitly said "not a reminder" — let normal chat handle it. */
    if (!parsed.isReminder) {
      logger.info({ text: text.slice(0, 120) }, "Reminder extractor: LLM said not a reminder");
      return null;
    }
    /* From here on, the model THINKS it's a reminder. If we can't lock a
       valid future time, return "unparseable" so the call site can show a
       clarifying message instead of pretending nothing happened. */
    if (!parsed.remindAt || !parsed.message) {
      logger.warn({ parsed, text: text.slice(0, 200) }, "Reminder extractor: missing remindAt or message");
      return { kind: "unparseable" };
    }
    const when = new Date(parsed.remindAt);
    if (isNaN(when.getTime())) {
      logger.warn({ remindAt: parsed.remindAt, raw: raw.slice(0, 200) }, "Reminder extractor: invalid date returned");
      return { kind: "unparseable" };
    }
    /* Reject reminders in the past (model occasionally hallucinates) — but
       allow a 60s grace window for "in 30 seconds" type requests. */
    if (when.getTime() < Date.now() - 60_000) {
      logger.warn({ remindAt: when.toISOString(), now: new Date().toISOString(), text: text.slice(0, 200) }, "Reminder extractor: rejected past time");
      return { kind: "unparseable" };
    }
    logger.info({ remindAt: when.toISOString(), message: parsed.message.slice(0, 80) }, "Reminder extractor: parsed intent");
    return { kind: "ok", remindAt: when.toISOString(), message: parsed.message.trim().slice(0, MAX_REMINDER_TEXT) };
  } catch (err) {
    logger.warn({ err, raw: raw.slice(0, 200) }, "Reminder extractor JSON parse failed");
    return null;
  }
}

/* Background scheduler — polls for due reminders every 30s and fires them
   via the Telegram bot. We pass in the bot instance + default chat ID so the
   scheduler doesn't need to re-instantiate either. Idempotent: only one
   poller per process. */
let reminderPollerHandle: NodeJS.Timeout | null = null;
export function startReminderScheduler(
  bot: TelegramBot,
  defaultChatId: number,
): void {
  if (reminderPollerHandle) return; // already running
  const tick = async () => {
    try {
      /* Atomically claim due rows by flipping their status to 'sent'
         (optimistic — we'll roll back to 'failed' if Telegram rejects). The
         RETURNING clause hands us the rows we just claimed so two pollers
         can't double-fire the same reminder. */
      const claimed = await db.execute(sql`
        UPDATE personal_gpt_reminders
        SET status = 'sent', fired_at = now()
        WHERE id IN (
          SELECT id FROM personal_gpt_reminders
          WHERE status = 'pending' AND remind_at <= now()
          ORDER BY remind_at ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);
      for (const row of claimed.rows) {
        const r = rowToReminder(row as Record<string, unknown>);
        const target = r.chatId ?? defaultChatId;
        const localTime = formatLocalTime(r.remindAt);
        try {
          await bot.sendMessage(target,
            `⏰ Reminder: ${r.message}\n\n_Set for ${localTime}_`,
            { parse_mode: "Markdown" });
        } catch (err) {
          logger.warn({ err, reminderId: r.id }, "Reminder send failed");
          await db.execute(sql`
            UPDATE personal_gpt_reminders
            SET status = 'failed', error = ${String(err instanceof Error ? err.message : err).slice(0, 500)}
            WHERE id = ${r.id}
          `).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn({ err }, "Reminder scheduler tick failed");
    }
  };
  reminderPollerHandle = setInterval(tick, REMINDER_POLL_INTERVAL_MS);
  /* Don't keep the event loop alive just for this poller. */
  reminderPollerHandle.unref?.();
  /* Run an immediate first tick so newly-due reminders don't wait 30s. */
  void tick();
  logger.info(`Personal GPT reminder scheduler started (poll every ${REMINDER_POLL_INTERVAL_MS / 1000}s, default chat ${defaultChatId})`);
}

/* ── Note-save intent ─────────────────────────────────────────────────────
   Natural-language note saving so the user never has to type the
   `/remember <category> <title> | <body>` ritual. Same pattern as
   reminders: cheap regex pre-filter → small LLM extractor returning
   strict JSON. Detects English + Banglish phrasings like:
     "save this as a note"
     "remember Sajjad is the CTO of Foo Ltd"
     "eta save kore rakho"
     "mone rakho — Rana er number 01711..."
     "note kore rakho: Tuesday meeting moved to 5pm"  */
/* Same discriminated-union pattern as ReminderIntentResult so the call site
   can tell apart "definitely not a note request" (let chat handle) from
   "looked like a note but the LLM didn't confirm" (also let chat handle —
   notes have no failure-fallback message, but keeping the shape consistent
   makes the two extractors interchangeable in future logic). */
export type NoteIntentResult = {
  category: NoteCategory;
  title: string;
  body: string;
};

export async function extractNoteIntent(userText: string, apiKey: string): Promise<NoteIntentResult | null> {
  const text = userText.trim();
  if (!text) return null;

  /* Cheap pre-filter to skip the LLM round-trip for normal chat. Stricter
     than the reminder prefilter — note keywords are less ambiguous, so we
     keep this list tight to minimize false positives. */
  const looksLikeNote = /\b(save|remember|note|jot|store|memori[sz]e|don'?t forget)\b/i.test(text)
    || /\bmone\s*rakh/i.test(text)            // "mone rakho"
    || /\bmne\s*rakh/i.test(text)
    || /\bnote\s*kor/i.test(text)             // "note kore rakho"
    || /\bsave\s*kor/i.test(text)             // "save kore rakho"
    || /\blikhe\s*rakh/i.test(text)           // "likhe rakho"
    || /\beta\s+(save|note|mone)/i.test(text);
  if (!looksLikeNote) return null;

  const sysPrompt =
    `You decide whether the user is asking to SAVE something to a long-term notes/CRM database. ` +
    `Distinguish "save this fact" (yes) from "set a reminder for later" (no — that's a separate system) ` +
    `and from regular questions/chat (no). The user may write in English, Bengali, or Banglish.\n` +
    `Pick the best CATEGORY from: contact, deal, project, task, date, note.\n` +
    `Reply with STRICT JSON only, no markdown:\n` +
    `  {"isNote": true, "category": "<one of the above>", "title": "<≤80 char headline>", "body": "<full details, may be empty>"}\n` +
    `  or {"isNote": false}\n` +
    `Examples:\n` +
    `  "save Sajjad as a contact, CTO at Foo Ltd, +8801711xxxxxxx" → {"isNote":true,"category":"contact","title":"Sajjad","body":"CTO at Foo Ltd, +8801711xxxxxxx"}\n` +
    `  "mone rakho Rana er number 01711xxxxxxx" → {"isNote":true,"category":"contact","title":"Rana","body":"01711xxxxxxx"}\n` +
    `  "note kore rakho: Bookcafe deal closes Friday" → {"isNote":true,"category":"deal","title":"Bookcafe deal closes Friday","body":""}\n` +
    `  "remind me at 4pm" → {"isNote":false}\n` +
    `  "what's the weather" → {"isNote":false}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
    },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: text.slice(0, 2000) },
      ],
    }),
  });
  if (!res.ok) { logger.warn({ status: res.status }, "Note extractor HTTP error"); return null; }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { isNote?: boolean; category?: string; title?: string; body?: string };
    if (!parsed.isNote || !parsed.title?.trim()) return null;
    return {
      category: normalizeCategory(parsed.category),
      title: parsed.title.trim().slice(0, 200),
      body: (parsed.body ?? "").trim().slice(0, 4000),
    };
  } catch (err) {
    logger.warn({ err, raw: raw.slice(0, 200) }, "Note extractor JSON parse failed");
    return null;
  }
}

/* Helper used by the bot handler to format an upcoming-reminders list. */
export function formatRemindersList(reminders: Reminder[]): string {
  if (!reminders.length) return "No upcoming reminders. Just say something like _'remind me at 4pm about the meeting'_ to set one.";
  return "📅 *Upcoming reminders:*\n" + reminders.slice(0, 20).map(r =>
    `• #${r.id} — ${r.message}\n   _${formatLocalTime(r.remindAt)}_`
  ).join("\n");
}

/* Unused TZ offset constant kept for potential future use (e.g. exposing
   the user's offset to the model alongside the local time string). */
void REMINDER_TZ_OFFSET;


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

const EXTRACT_SYSTEM = `You are a personality-profiler. Your job is to build a precise model of HOW the user communicates so an AI assistant can mirror them.

Read the user's latest message (English, Bangla, or Banglish — most likely Banglish from a Bangladeshi tech founder) and extract ONLY new long-term-useful signal.

What to capture:
- "facts": durable identity facts ("runs Advantix Digital", "based in Bagerhat").
- "habits": recurring behaviors ("works late nights", "uses voice messages often").
- "likes" / "dislikes": preferences worth remembering long-term.
- "style": ONE detailed sentence covering ALL of these dimensions when observable:
    1. Language mix — pure English / pure Bangla / Banglish (which dominant?).
    2. Formality — casual / blunt / formal / mixed.
    3. Sentence length — short bursts / long flowing / mixed.
    4. Emoji + punctuation — none / sparse / heavy / specific favorites (!! ?? 🔥).
    5. Energy — calm / excitable / sarcastic / venting / playful.
    6. Signature phrases or fillers ("bujhcho?", "ki bolo", "wtf", "bhai").
    7. Address style — how they address the bot ("you", "tumi", "tui", name).

Rules:
- Output strict JSON, no prose, no markdown fences.
- If nothing new is worth remembering, return all empty arrays and empty style string.
- Each list item is a short third-person clause ("prefers concise replies").
- The "style" sentence should be DESCRIPTIVE of the user, not prescriptive — e.g.
  "Writes in casual Banglish, short blunt bursts, frequent !! and emojis when frustrated, addresses the bot as 'tumi', uses fillers like 'bhai' and 'wtf'."
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
    choices?: { message?: { content?: string; refusal?: string; images?: { image_url?: { url?: string } }[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  const imgUrl = msg?.images?.[0]?.image_url?.url;
  if (!imgUrl) {
    /* Common case: the model refused to generate (real people, sensitive
       content, etc.) and instead returned a plain-text explanation. Surface
       it so the user understands WHY no image came back, instead of a
       generic "Model did not return an image." */
    const explanation = (msg?.refusal || msg?.content || "").trim();
    if (explanation) {
      const short = explanation.length > 400 ? explanation.slice(0, 400) + "…" : explanation;
      throw new Error(`Image model refused: ${short}`);
    }
    throw new Error("Model did not return an image (no content + no refusal text).");
  }

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
}): Promise<{ reply: string; transcript: string }> {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

  /* Ask the model for BOTH a verbatim transcript and a natural reply in JSON.
     The transcript lets us persist actual user words for short-term context
     and feed personality extraction; the reply is what we send back. */
  const hint = input.promptHint
    ?? `Listen to this voice message. Respond ONLY with a JSON object of the form
{"transcript": "<verbatim transcription of what the user said, in their original language>",
 "reply": "<your natural reply, in the same language the user spoke>"}
No prose, no markdown fences.`;

  const userContent = [
    { type: "text", text: hint },
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
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voice reply failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Voice model returned an empty reply.");

  /* Tolerate stray markdown fences just in case the model ignores the format. */
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let reply = "";
  let transcript = "";
  try {
    const parsed = JSON.parse(cleaned) as { transcript?: unknown; reply?: unknown };
    transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    reply      = typeof parsed.reply      === "string" ? parsed.reply.trim()      : "";
  } catch {
    /* Fallback: treat the whole content as the reply, no transcript available. */
    reply = cleaned;
  }
  if (!reply) reply = cleaned || "(no reply)";
  return { reply, transcript };
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
}): Promise<{ reply: string; transcript: string | null }> {
  const settings = await loadSettings();
  if (!settings.enabled) throw new Error("Personal GPT is disabled in settings");

  const notes = args.persist ? await listNotes().catch(() => [] as Note[]) : [];
  const fullSystemPrompt = buildSystemPrompt(settings, args.persist, notes);
  const history = args.persist ? await loadRecentTurns() : [];

  const { reply, transcript } = await answerFromVoice({
    audioBase64: args.audioBase64,
    audioFormat: args.audioFormat,
    systemPrompt: fullSystemPrompt,
    history,
  });

  /* Persist the actual transcript (when available) so future turns get real
     context AND the personality extractor has something to learn from. Falls
     back to the placeholder only when the model failed to return one. */
  if (args.persist) {
    const userTurnContent = transcript ? `🎤 ${transcript}` : "🎤 (voice message)";
    await appendTurn("user", userTurnContent, args.source);
    await appendTurn("assistant", reply, args.source);

    /* Fire-and-forget personality extraction on the transcript — same path
       text turns use, so voice messages now contribute to the auto-curated
       profile too. */
    if (transcript) {
      void (async () => {
        try {
          const apiKey = await getOpenRouterKey();
          if (!apiKey) return;
          const delta = await extractPersonalityDelta(transcript, apiKey);
          const hasDelta = (delta.facts?.length ?? 0) + (delta.habits?.length ?? 0)
                         + (delta.likes?.length ?? 0) + (delta.dislikes?.length ?? 0)
                         + (delta.style && delta.style.trim() ? 1 : 0) > 0;
          if (hasDelta) {
            const fresh = await loadSettings();
            const merged = mergePersonality(fresh.personality, delta);
            await updateSettings({ personality: merged });
          }
        } catch (err) {
          logger.warn({ err }, "Personal GPT voice: personality merge failed");
        }
      })();
    }
  }
  return { reply, transcript: transcript ?? null };
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
  /* Inject the real wall-clock time so the model never hallucinates "ekhon
     X baje". Single-tenant: owner is in Asia/Dhaka. Cheap (~40 chars) and
     adds no extra API call. Format chosen to be unambiguous in any language. */
  const nowDhaka = new Date().toLocaleString("en-US", {
    timeZone: REMINDER_TZ,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const timeLine = `## Current time\nIt is now ${nowDhaka} (Asia/Dhaka). Use this — never guess the time or date.`;
  if (!includePersonality) {
    return [
      base,
      "",
      timeLine,
      "",
      "## Group chat mode",
      "You are talking in a group chat. You have NO memory of past conversations and NO knowledge about any specific user. If asked about your owner, the operator, or any private details, politely say you don't share that information.",
    ].join("\n");
  }
  return [
    base,
    "",
    timeLine,
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
    "- If the user clearly tells you something worth remembering long-term (a person, a project, a deadline), just confirm naturally — e.g. 'Saved!' or 'Got it, I'll remember.' The system will auto-save it to the notes database; you do NOT need to ask the user to run /remember themselves.",
    "",
    "## Tone & voice — MIRROR the user",
    "You are not a generic assistant. You are an evolving copy of THIS user. Your reply must feel like it came from someone who has known them for years.",
    "- Match their language mix exactly. If they wrote Banglish, you reply in Banglish (not pure English, not pure Bangla). If they switched to English mid-sentence, you can too.",
    "- Match their sentence length and rhythm. Short blunt bursts → short blunt bursts. Long flowing thoughts → flowing reply.",
    "- Match their formality and energy. Casual/sarcastic/venting/excited — meet them where they are. Don't sound corporate or therapist-y.",
    "- Match their emoji and punctuation density. If they don't use emojis, you don't either. If they use !! and 🔥, so can you.",
    "- Reuse their signature phrases when natural ('bhai', 'bujhcho', 'wtf', etc.) — but don't force it.",
    "- Never lecture, never moralize, never apologize unless you actually broke something. Don't open with 'As an AI…' or 'I understand your frustration'.",
    "- If they vent or curse, acknowledge briefly and move to the fix. Don't soften their words back at them.",
    "- The 'Communication style' line above is your ground truth — re-read it before every reply.",
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

/* ── Web-search intent detector ──────────────────────────────────────────
   When the user asks for real-time / online info (English or Banglish), we
   flip on OpenRouter's `:online` suffix which transparently appends a web
   search to ANY model — so the same GLM 4.6 keeps the personality voice
   while gaining fresh facts. False-positives are cheap (~$0.004/request),
   false-negatives leave the user with stale info, so the trigger list
   leans intentionally generous.

   Heuristic only — the user can also force it ON/OFF with explicit
   `/search` and `/nosearch` prefixes, which we strip before the model
   sees the text. */
const WEB_SEARCH_TRIGGERS = [
  /\bsearch\b/i, /\bonline\b/i, /\bgoogle\b/i, /\binternet\b/i, /\bweb\b/i,
  /\bnews\b/i, /\blatest\b/i, /\brecent\b/i, /\bcurrent\b/i, /\btoday('s)?\b/i,
  /\bright now\b/i, /\breal[\s-]?time\b/i, /\blive (score|match|price|rate)\b/i,
  /\bweather\b/i, /\bforecast\b/i, /\bstock( price)?\b/i, /\bexchange rate\b/i,
  /\bwhat'?s happening\b/i, /\bwho won\b/i, /\bbreaking\b/i,
  /\bkhoj\b/i, /\bkhuje\b/i, /\bkhujte\b/i, /\bkhuje d(a|i)o\b/i,
  /\bkhabor\b/i, /\bkhobor\b/i, /\bajke(r)?\b/i, /\bekhonkar\b/i,
  /\babohaowa\b/i, /\bbristi\b/i, /\bdam koto\b/i, /\brate koto\b/i,
];
function wantsWebSearch(text: string): boolean {
  if (!text) return false;
  return WEB_SEARCH_TRIGGERS.some(rx => rx.test(text));
}

/* Strip `/search` / `/nosearch` (and Bengali equivalents) prefixes from the
   user's text and return both the cleaned text and an explicit override.
   Returns `null` for `force` if the user didn't override anything. */
function parseSearchOverride(text: string): { text: string; force: boolean | null } {
  const m = text.match(/^\s*\/(no)?search\b\s*/i);
  if (m) {
    return { text: text.slice(m[0].length), force: !m[1] };
  }
  return { text, force: null };
}

async function callChat(
  systemPrompt: string, history: RecentTurn[], apiKey: string, useWeb = false,
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
    },
    body: JSON.stringify({
      model: useWeb ? `${CHAT_MODEL}:online` : CHAT_MODEL,
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
  useWeb = false,
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://advantix.digital",
    },
    body: JSON.stringify({
      model: useWeb ? `${CHAT_MODEL}:online` : CHAT_MODEL,
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

  /* Detect (or honour an explicit override) whether this turn needs live web
     search. We strip the override prefix BEFORE persisting so the archive
     doesn't fill up with `/search` noise. */
  const { text: cleanedText, force } = parseSearchOverride(userText);
  const useWeb = force !== null ? force : wantsWebSearch(cleanedText);
  userText = cleanedText;

  /* Personality extraction only runs for trusted/persistable turns. */
  const extractPromise = opts.persist
    ? extractPersonalityDelta(userText, apiKey)
    : Promise.resolve<Partial<Personality>>({});

  /* For ephemeral (group) turns we deliberately use no history AND omit the
     personality profile + notes so group conversations can't pull in or leak
     private context. DM/web turns get the full memory. */
  const notes = opts.persist ? await listNotes().catch(() => [] as Note[]) : [];
  let fullSystemPrompt = buildSystemPrompt(settings, opts.persist, notes);
  if (useWeb) {
    fullSystemPrompt += "\n\n[Live web search is enabled for this turn. Use the fetched results to answer with up-to-date facts. Cite sources inline as [1], [2] when relevant.]";
  }
  const history = opts.persist ? await loadRecentTurns() : [];
  const turnHistory: RecentTurn[] = [...history, { role: "user", content: userText }];

  const reply = await callChat(fullSystemPrompt, turnHistory, apiKey, useWeb);

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

    /* Same web-search intent detection as the non-streaming path. */
    const { text: cleanedText, force } = parseSearchOverride(userText);
    const useWeb = force !== null ? force : wantsWebSearch(cleanedText);
    userText = cleanedText;

    /* Streaming endpoint is web-only and always persists. */
    const extractPromise = extractPersonalityDelta(userText, apiKey);
    const notes = await listNotes().catch(() => [] as Note[]);
    let fullSystemPrompt = buildSystemPrompt(settings, true, notes);
    if (useWeb) {
      fullSystemPrompt += "\n\n[Live web search is enabled for this turn. Use the fetched results to answer with up-to-date facts. Cite sources inline as [1], [2] when relevant.]";
    }
    const history = await loadRecentTurns();
    const turnHistory: RecentTurn[] = [...history, { role: "user", content: userText }];

    const reply = await callChatStream(fullSystemPrompt, turnHistory, apiKey, (chunk) => {
      onEvent({ type: "chunk", text: chunk });
    }, signal, useWeb);

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

/* ── Auto-react (mood-aware emoji reactions on Telegram) ──────────────────
   Telegram's Bot API allows reacting to a message with one of a fixed set of
   "free" emojis. We let the cheap text model pick ONE emoji that fits the
   mood/intent of the user's message — informed by what we already know about
   them (personality summary), so reactions get more "you" over time. The model
   may also reply with NONE when no reaction fits (e.g. a neutral question). */

const TELEGRAM_FREE_REACTIONS = [
  "👍", "👎", "❤", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱",
  "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊", "🤡",
  "🥱", "🥴", "😍", "🐳", "❤‍🔥", "🌚", "🌭", "💯", "🤣", "⚡",
  "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈",
  "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨",
  "🤝", "✍", "🤗", "🫡", "🎅", "🎄", "☃", "💅", "🤪", "🗿",
  "🆒", "💘", "🙉", "🦄", "😘", "💊", "🙊", "😎", "👾", "🤷‍♂",
  "🤷", "🤷‍♀", "😡",
];
const REACTION_SET = new Set(TELEGRAM_FREE_REACTIONS);

/**
 * Ask the cheap text model to pick ONE Telegram-allowed emoji that an
 * attentive personal assistant would react to this message with — given
 * what we already know about the user. Returns null if the model says NONE
 * or returns something unusable. Hard-capped to ~150ms-ish budget by the
 * tiny prompt and `max_tokens: 8`.
 */
async function pickReaction(text: string, settings: { personality: Personality }): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1500) return null;
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return null;

  const personalitySnippet = renderPersonality(settings.personality).slice(0, 600);

  const sys = [
    "You react to a user's chat message with ONE emoji, like an attentive personal assistant.",
    "Pick from EXACTLY this set (Telegram free reactions):",
    TELEGRAM_FREE_REACTIONS.join(" "),
    "",
    "Rules:",
    "- Output only the single emoji character. No words, no quotes, no punctuation.",
    "- If no reaction fits (neutral question, casual ack, command, code dump), output NONE.",
    "- Match the message MOOD first (joy=🎉/🥰, agreement=👍, fire/excitement=🔥, sad=😢, frustrated=😡/🤬, gratitude=🙏, funny=🤣, love=❤, mind-blown=🤯, salute=🫡, etc).",
    "- Use what you know about the user to make the reaction feel personal:",
    personalitySnippet || "(no profile yet)",
  ].join("\n");

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://advantix.digital",
        "X-Title": "Advantix Personal GPT (reaction)",
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 8,
        temperature: 0.4,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: trimmed.slice(0, 1500) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!raw || /^none$/i.test(raw)) return null;

    /* Take the first grapheme-ish chunk and check it against the allowlist.
       Fall back to scanning the response for any allowed emoji. */
    const direct = Array.from(raw)[0];
    if (direct && REACTION_SET.has(direct)) return direct;
    for (const e of TELEGRAM_FREE_REACTIONS) {
      if (raw.includes(e)) return e;
    }
    return null;
  } catch (err) {
    logger.warn({ err }, "Personal GPT: pickReaction failed");
    return null;
  }
}

/**
 * Set a single emoji reaction on a Telegram message. node-telegram-bot-api
 * doesn't expose this typed method on every version, so we hit the raw HTTP
 * endpoint. Failures are swallowed — a missing reaction must never break the
 * primary reply.
 */
async function setTelegramReaction(token: string, chatId: number, messageId: number, emoji: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: "emoji", emoji }],
        is_big: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.debug({ status: res.status, body: body.slice(0, 200) }, "Personal GPT: setMessageReaction non-OK");
    }
  } catch (err) {
    logger.debug({ err }, "Personal GPT: setMessageReaction threw");
  }
}

/**
 * Fire-and-forget: pick a mood-appropriate reaction for `text` and apply it
 * to `messageId` in `chatId`. Designed to be called WITHOUT await — the model
 * call + HTTP round-trip happens in the background while the main reply is
 * being generated.
 */
function fireAutoReaction(token: string, chatId: number, messageId: number, text: string, settings: { personality: Personality }): void {
  void (async () => {
    try {
      const emoji = await pickReaction(text, settings);
      if (!emoji) return;
      await setTelegramReaction(token, chatId, messageId, emoji);
    } catch (err) {
      logger.debug({ err }, "Personal GPT: fireAutoReaction failed");
    }
  })();
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

  /* Start the reminder scheduler. Default chat = first POSITIVE chat ID
     in the allowed list (DMs have positive IDs, groups negative). Reminders
     created from the web (no chatId) will fire to this DM by default — the
     user's phone, not a group, is the right destination for personal pings. */
  const defaultDmChat = allowedChatIds.find(id => id > 0) ?? allowedChatIds[0];
  startReminderScheduler(bot, defaultDmChat);

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

      /* /reminders — show what's scheduled. /unremind <id> — cancel one. */
      if (text === "/reminders") {
        const list = await listPendingReminders().catch(() => [] as Reminder[]);
        await bot.sendMessage(chatId, formatRemindersList(list), { parse_mode: "Markdown" }).catch(() => {});
        return;
      }
      const unremindMatch = text.match(/^\/unremind\s+(\d+)\s*$/);
      if (unremindMatch) {
        const id = Number(unremindMatch[1]);
        await cancelReminder(id).catch(() => {});
        await bot.sendMessage(chatId, `🗑️ Cancelled reminder #${id}.`);
        return;
      }
    }

    /* Reminder intent detection — runs BEFORE the normal chat path so a
       message like "amake 4tay meeting er kotha mone koray dio" is handled
       as a scheduling action, not a generic conversation turn. DM only —
       group reminders would ping the wrong person. */
    if (!isGroup) {
      try {
        const apiKeyForReminder = await getOpenRouterKey();
        if (apiKeyForReminder) {
          const intent = await extractReminderIntent(text, apiKeyForReminder);
          if (intent?.kind === "ok") {
            const r = await createReminder({
              message: intent.message,
              remindAt: intent.remindAt,
              chatId,
              source: "telegram",
            });
            await bot.sendMessage(chatId,
              `⏰ Got it. I'll remind you about *${r.message}* on _${formatLocalTime(r.remindAt)}_.\n\n_Cancel anytime with_ \`/unremind ${r.id}\``,
              { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
            ).catch(() => {});
            /* Persist the exchange to the archive so the conversation
               history reflects what happened. */
            await appendTurn("user", text, "telegram").catch(() => {});
            await appendTurn("assistant", `[Reminder set for ${formatLocalTime(r.remindAt)}: ${r.message}]`, "telegram").catch(() => {});
            return;
          }
          /* Only show the "couldn't parse" fallback if the LLM ALSO thought
             this was a reminder request — otherwise (e.g. weather questions
             that happened to contain "ajke") fall through to normal chat. */
          if (intent?.kind === "unparseable") {
            await bot.sendMessage(chatId,
              `⏰ Reminder ta set korte parlam na — time tah past e chole geche ba bujhte parinai.\n\n` +
              `_Try:_ \`5 minute pore\`, \`kal sokal 9 tay\`, \`bikel 4:30 e\`, or pick from admin panel.`,
              { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
            ).catch(() => {});
            await appendTurn("user", text, "telegram").catch(() => {});
            await appendTurn("assistant", `[Reminder NOT set — could not parse time]`, "telegram").catch(() => {});
            return;
          }
        }
      } catch (err) {
        logger.warn({ err }, "Reminder intent detection failed (falling back to normal chat)");
      }
    }

    /* Note-save intent — same idea as reminders. If the user is asking to
       save a person/deal/project/task/date/note to long-term memory, we
       auto-create the row and confirm. DM only — group note saves would
       leak business context to other group members. */
    if (!isGroup) {
      try {
        const apiKeyForNote = await getOpenRouterKey();
        if (apiKeyForNote) {
          const noteIntent = await extractNoteIntent(text, apiKeyForNote);
          if (noteIntent) {
            const note = await addNote({
              category: noteIntent.category,
              title: noteIntent.title,
              body: noteIntent.body,
            });
            const bodyLine = note.body ? `\n_${note.body.slice(0, 200)}${note.body.length > 200 ? "…" : ""}_` : "";
            await bot.sendMessage(chatId,
              `📝 Saved as *${note.category}* #${note.id}: *${note.title}*${bodyLine}\n\n_Open the Memory tab in admin to edit/pin/delete._`,
              { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
            ).catch(() => {});
            await appendTurn("user", text, "telegram").catch(() => {});
            await appendTurn("assistant", `[Note saved — ${note.category}: ${note.title}]`, "telegram").catch(() => {});
            return;
          }
        }
      } catch (err) {
        logger.warn({ err }, "Note intent detection failed (falling back to normal chat)");
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

    /* Auto-react in parallel with reply generation. Personality-aware so the
       reaction style evolves as the AI learns more about the user. Only in
       DMs — group reactions could be noisy / misread by other members. */
    if (!isGroup && settings.telegramBotToken) {
      fireAutoReaction(settings.telegramBotToken, chatId, msg.message_id, text, settings);
    }

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

      const { reply, transcript } = await runPersonalGptVoiceTurn({
        audioBase64,
        audioFormat: format,
        source: "telegram",
        persist: !isGroup,
      });
      const sendOpts = isGroup ? { reply_to_message_id: msg.message_id } : undefined;

      /* If the voice transcript contains a reminder/note request, RUN the
         same extractors that the text handler uses. The multimodal model
         tends to reply "ok I set it!" without anything actually happening,
         so we run the real action and override the reply with a verifiable
         confirmation. DM only — group voice notes never auto-create rows. */
      logger.info({ chatId, hasTranscript: !!transcript, transcriptPreview: transcript?.slice(0, 120) ?? null }, "Personal GPT voice turn finished");
      let actionReply: string | null = null;
      if (!isGroup && transcript) {
        try {
          const apiKeyForIntent = await getOpenRouterKey();
          if (apiKeyForIntent) {
            const reminderIntent = await extractReminderIntent(transcript, apiKeyForIntent);
            if (reminderIntent?.kind === "ok") {
              const reminder = await createReminder({
                message: reminderIntent.message,
                remindAt: reminderIntent.remindAt,
                chatId,
                source: "telegram",
              });
              const whenLocal = formatLocalTime(reminder.remindAt);
              actionReply = `🔔 Reminder #${reminder.id} set for *${whenLocal}*: _${reminder.message}_\n\n_Cancel anytime with_ \`/unremind ${reminder.id}\``;
            } else if (reminderIntent?.kind === "unparseable") {
              /* LLM affirmed reminder intent but couldn't lock a future time.
                 Override the chat model's "set kore dilam" hallucination
                 with an explicit failure message. */
              actionReply = `⏰ Reminder ta set korte parlam na — time tah past e chole geche ba bujhte parinai.\n\n` +
                `_Try:_ \`5 minute pore\`, \`kal sokal 9 tay\`, \`bikel 4:30 e\`, or set from admin panel.`;
            } else {
              const noteIntent = await extractNoteIntent(transcript, apiKeyForIntent);
              if (noteIntent) {
                const note = await addNote({
                  category: noteIntent.category,
                  title: noteIntent.title,
                  body: noteIntent.body,
                });
                const bodyLine = note.body ? `\n_${note.body.slice(0, 200)}${note.body.length > 200 ? "…" : ""}_` : "";
                actionReply = `📝 Saved as *${note.category}* #${note.id}: *${note.title}*${bodyLine}`;
              }
            }
          }
        } catch (err) {
          logger.warn({ err }, "Voice intent detection failed (falling back to model reply)");
        }
      }

      const finalReply = actionReply ?? reply;
      const finalOpts = actionReply
        ? { ...(sendOpts ?? {}), parse_mode: "Markdown" as const }
        : sendOpts;
      for (let i = 0; i < finalReply.length; i += 4000) {
        await bot.sendMessage(chatId, finalReply.slice(i, i + 4000), finalOpts).catch(() => {});
      }
      /* React to the voice note based on what they actually said. Same DM-only
         rule as text — group voice notes don't get reactions. */
      if (!isGroup && transcript && settings.telegramBotToken) {
        fireAutoReaction(settings.telegramBotToken, chatId, msg.message_id, transcript, settings);
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
