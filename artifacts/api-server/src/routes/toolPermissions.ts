import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { requireToolUser } from "../middleware/toolAuth.js";

const router: IRouter = Router();

export const ALL_TOOLS = [
  { slug: "url-shortener",            name: "URL Shortener",              description: "Shorten links and track clicks" },
  { slug: "screen-recorder",          name: "Screen Recorder",            description: "Record your screen in the browser" },
  { slug: "pdf-audio",                name: "PDF to Audio",               description: "Convert PDFs to audio files" },
  { slug: "advantix-ai",              name: "Advantix AI",                description: "Multi-model AI chat assistant" },
  { slug: "advantix-assistant",       name: "Advantix Assistant",         description: "AI agent that controls your local machine" },
  { slug: "social-media-manager",     name: "Social Media Manager",       description: "Schedule and manage social media posts" },
  { slug: "facebook-auto-reply",      name: "Facebook Auto-Reply",        description: "Auto-reply to Facebook comments and DMs" },
  { slug: "finance",                  name: "Finance Management",         description: "Track income, expenses, planned payments and subscriptions" },
  { slug: "whatsapp",                 name: "WhatsApp Assistant",         description: "Connect WhatsApp and chat with the assistant from any phone" },
  { slug: "project-management",       name: "Manage Your Project",        description: "Multi-tenant workspaces with projects, tasks, board, comments, members and Telegram alerts" },
];

export const ALL_TOOL_SLUGS = ALL_TOOLS.map(t => t.slug);

/* ── Helpers ──────────────────────────────────────────────── */

/* Fallback when no site_setting exists — 10 minutes. */
const DEFAULT_RECORDING_MAX_SECONDS = 600;
/* Hard ceiling we will accept from admin input — 4 hours.
   Browsers struggle with anything longer due to memory, so don't tempt fate. */
const ABSOLUTE_RECORDING_CEILING = 4 * 60 * 60;

async function getDefaultToolSlugs(): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT value FROM site_settings WHERE key = 'default_tool_permissions'
  `);
  const rows = r.rows as { value: string }[];
  if (rows.length === 0) return ALL_TOOL_SLUGS;
  try { return JSON.parse(rows[0].value); } catch { return ALL_TOOL_SLUGS; }
}

async function getDefaultRecordingMaxSeconds(): Promise<number> {
  const r = await db.execute(sql`
    SELECT value FROM site_settings WHERE key = 'default_recording_max_seconds'
  `);
  const rows = r.rows as { value: string }[];
  if (rows.length === 0) return DEFAULT_RECORDING_MAX_SECONDS;
  const n = parseInt(rows[0].value, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RECORDING_MAX_SECONDS;
}

export async function getEffectiveRecordingMaxSeconds(userId: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT recording_max_seconds FROM tool_users WHERE id = ${userId}
  `);
  const rows = r.rows as { recording_max_seconds: number | null }[];
  const override = rows[0]?.recording_max_seconds;
  if (override && override > 0) return override;
  return getDefaultRecordingMaxSeconds();
}

export async function getUserToolSlugs(userId: number): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT tool_slug, enabled FROM user_tool_permissions WHERE user_id = ${userId}
  `);
  const stored = r.rows as { tool_slug: string; enabled: boolean }[];
  const storedMap = new Map(stored.map(row => [row.tool_slug, row.enabled]));

  // For slugs added after the user registered (no row yet), fall back to defaults
  const defaults = await getDefaultToolSlugs();

  return ALL_TOOL_SLUGS.filter(slug => {
    if (storedMap.has(slug)) return storedMap.get(slug) === true;
    return defaults.includes(slug);
  });
}

export async function applyDefaultPermissions(userId: number): Promise<void> {
  const defaults = await getDefaultToolSlugs();
  for (const slug of ALL_TOOL_SLUGS) {
    const enabled = defaults.includes(slug);
    await db.execute(sql`
      INSERT INTO user_tool_permissions (user_id, tool_slug, enabled)
      VALUES (${userId}, ${slug}, ${enabled})
      ON CONFLICT (user_id, tool_slug) DO NOTHING
    `);
  }
}

/* ── Public routes ────────────────────────────────────────── */

/* GET /api/settings/tool-permissions/defaults */
router.get("/settings/tool-permissions/defaults", async (_req, res) => {
  const defaults = await getDefaultToolSlugs();
  const recordingMaxSeconds = await getDefaultRecordingMaxSeconds();
  res.json({ tools: ALL_TOOLS, defaults, recordingMaxSeconds });
});

/* GET /api/tools/my-permissions — authenticated tool user */
router.get("/tools/my-permissions", requireToolUser, async (req, res) => {
  const userId = (req.session as any).toolUserId as number;
  const allowed = await getUserToolSlugs(userId);
  res.json({ allowed });
});

/* GET /api/tools/recording-limit — authenticated tool user.
   Used by ScreenRecorder.tsx to know how long this user is allowed to record. */
router.get("/tools/recording-limit", requireToolUser, async (req, res) => {
  const userId = (req.session as any).toolUserId as number;
  const maxSeconds = await getEffectiveRecordingMaxSeconds(userId);
  res.json({ maxSeconds });
});

/* ── Admin routes ─────────────────────────────────────────── */

/* PUT /api/admin/settings/tool-permissions/defaults */
router.put("/admin/settings/tool-permissions/defaults", requireAdmin, async (req, res) => {
  const { defaults, recordingMaxSeconds } = req.body as { defaults: string[]; recordingMaxSeconds?: number };
  if (!Array.isArray(defaults)) { res.status(400).json({ error: "defaults must be an array" }); return; }
  const valid = defaults.filter(s => ALL_TOOL_SLUGS.includes(s));
  await db.execute(sql`
    INSERT INTO site_settings (key, value) VALUES ('default_tool_permissions', ${JSON.stringify(valid)})
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(valid)}, updated_at = now()
  `);

  /* Optional global default recording limit — accept any positive number up
     to the absolute ceiling. Silently clamp instead of erroring so a single
     bad value can't block saving the rest. */
  if (recordingMaxSeconds !== undefined && Number.isFinite(recordingMaxSeconds)) {
    const clamped = Math.max(60, Math.min(ABSOLUTE_RECORDING_CEILING, Math.round(Number(recordingMaxSeconds))));
    await db.execute(sql`
      INSERT INTO site_settings (key, value) VALUES ('default_recording_max_seconds', ${String(clamped)})
      ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
    `);
  }

  const updatedRecordingMaxSeconds = await getDefaultRecordingMaxSeconds();
  res.json({ defaults: valid, recordingMaxSeconds: updatedRecordingMaxSeconds });
});

/* GET /api/admin/tool-permissions/users — list all tool users */
router.get("/admin/tool-permissions/users", requireAdmin, async (_req, res) => {
  const usersR = await db.execute(sql`
    SELECT id, name, email, created_at, recording_max_seconds
    FROM tool_users ORDER BY created_at DESC
  `);
  const users = usersR.rows as {
    id: number; name: string; email: string; created_at: string;
    recording_max_seconds: number | null;
  }[];

  const permsR = await db.execute(sql`
    SELECT user_id, tool_slug, enabled FROM user_tool_permissions
  `);
  const permsMap: Record<number, Record<string, boolean>> = {};
  for (const row of permsR.rows as { user_id: number; tool_slug: string; enabled: boolean }[]) {
    if (!permsMap[row.user_id]) permsMap[row.user_id] = {};
    permsMap[row.user_id][row.tool_slug] = row.enabled;
  }

  const defaultRecordingMaxSeconds = await getDefaultRecordingMaxSeconds();

  const result = users.map(u => ({
    ...u,
    tools: ALL_TOOL_SLUGS.reduce<Record<string, boolean>>((acc, slug) => {
      acc[slug] = permsMap[u.id]?.[slug] ?? true;
      return acc;
    }, {}),
    recordingMaxSeconds: u.recording_max_seconds, // null = inherits default
  }));

  res.json({ users: result, allTools: ALL_TOOLS, defaultRecordingMaxSeconds });
});

/* PUT /api/admin/tool-permissions/users/:id — update user's permissions */
router.put("/admin/tool-permissions/users/:id", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { tools, recordingMaxSeconds } = req.body as {
    tools: Record<string, boolean>;
    /* null explicitly clears the override (user falls back to global default).
       undefined means "don't touch". A positive number sets a per-user cap. */
    recordingMaxSeconds?: number | null;
  };
  if (!tools || typeof tools !== "object") { res.status(400).json({ error: "tools object required" }); return; }

  for (const slug of ALL_TOOL_SLUGS) {
    const enabled = tools[slug] !== undefined ? Boolean(tools[slug]) : true;
    await db.execute(sql`
      INSERT INTO user_tool_permissions (user_id, tool_slug, enabled)
      VALUES (${userId}, ${slug}, ${enabled})
      ON CONFLICT (user_id, tool_slug) DO UPDATE SET enabled = ${enabled}
    `);
  }

  if (recordingMaxSeconds !== undefined) {
    if (recordingMaxSeconds === null) {
      await db.execute(sql`UPDATE tool_users SET recording_max_seconds = NULL WHERE id = ${userId}`);
    } else if (Number.isFinite(recordingMaxSeconds)) {
      const clamped = Math.max(60, Math.min(ABSOLUTE_RECORDING_CEILING, Math.round(Number(recordingMaxSeconds))));
      await db.execute(sql`UPDATE tool_users SET recording_max_seconds = ${clamped} WHERE id = ${userId}`);
    }
  }

  const allowed = await getUserToolSlugs(userId);
  const effectiveRecordingMaxSeconds = await getEffectiveRecordingMaxSeconds(userId);
  res.json({ userId, allowed, recordingMaxSeconds: effectiveRecordingMaxSeconds });
});

export default router;
