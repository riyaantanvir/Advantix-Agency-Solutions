import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { requireToolUser } from "../middleware/toolAuth.js";

const router: IRouter = Router();

export const ALL_TOOLS = [
  { slug: "url-shortener",        name: "URL Shortener",       description: "Shorten links and track clicks" },
  { slug: "screen-recorder",      name: "Screen Recorder",     description: "Record your screen in the browser" },
  { slug: "pdf-audio",            name: "PDF to Audio",         description: "Convert PDFs to audio files" },
  { slug: "advantix-ai",          name: "Advantix AI",          description: "Multi-model AI chat assistant" },
  { slug: "advantix-assistant",   name: "Advantix Assistant",   description: "AI agent that controls your local machine" },
];

export const ALL_TOOL_SLUGS = ALL_TOOLS.map(t => t.slug);

/* ── Helpers ──────────────────────────────────────────────── */

async function getDefaultToolSlugs(): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT value FROM site_settings WHERE key = 'default_tool_permissions'
  `);
  const rows = r.rows as { value: string }[];
  if (rows.length === 0) return ALL_TOOL_SLUGS;
  try { return JSON.parse(rows[0].value); } catch { return ALL_TOOL_SLUGS; }
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
  res.json({ tools: ALL_TOOLS, defaults });
});

/* GET /api/tools/my-permissions — authenticated tool user */
router.get("/tools/my-permissions", requireToolUser, async (req, res) => {
  const userId = (req.session as any).toolUserId as number;
  const allowed = await getUserToolSlugs(userId);
  res.json({ allowed });
});

/* ── Admin routes ─────────────────────────────────────────── */

/* PUT /api/admin/settings/tool-permissions/defaults */
router.put("/admin/settings/tool-permissions/defaults", requireAdmin, async (req, res) => {
  const { defaults } = req.body as { defaults: string[] };
  if (!Array.isArray(defaults)) { res.status(400).json({ error: "defaults must be an array" }); return; }
  const valid = defaults.filter(s => ALL_TOOL_SLUGS.includes(s));
  await db.execute(sql`
    INSERT INTO site_settings (key, value) VALUES ('default_tool_permissions', ${JSON.stringify(valid)})
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(valid)}, updated_at = now()
  `);
  res.json({ defaults: valid });
});

/* GET /api/admin/tool-permissions/users — list all tool users */
router.get("/admin/tool-permissions/users", requireAdmin, async (_req, res) => {
  const usersR = await db.execute(sql`
    SELECT id, name, email, created_at FROM tool_users ORDER BY created_at DESC
  `);
  const users = usersR.rows as { id: number; name: string; email: string; created_at: string }[];

  const permsR = await db.execute(sql`
    SELECT user_id, tool_slug, enabled FROM user_tool_permissions
  `);
  const permsMap: Record<number, Record<string, boolean>> = {};
  for (const row of permsR.rows as { user_id: number; tool_slug: string; enabled: boolean }[]) {
    if (!permsMap[row.user_id]) permsMap[row.user_id] = {};
    permsMap[row.user_id][row.tool_slug] = row.enabled;
  }

  const result = users.map(u => ({
    ...u,
    tools: ALL_TOOL_SLUGS.reduce<Record<string, boolean>>((acc, slug) => {
      acc[slug] = permsMap[u.id]?.[slug] ?? true;
      return acc;
    }, {}),
  }));

  res.json({ users: result, allTools: ALL_TOOLS });
});

/* PUT /api/admin/tool-permissions/users/:id — update user's permissions */
router.put("/admin/tool-permissions/users/:id", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { tools } = req.body as { tools: Record<string, boolean> };
  if (!tools || typeof tools !== "object") { res.status(400).json({ error: "tools object required" }); return; }

  for (const slug of ALL_TOOL_SLUGS) {
    const enabled = tools[slug] !== undefined ? Boolean(tools[slug]) : true;
    await db.execute(sql`
      INSERT INTO user_tool_permissions (user_id, tool_slug, enabled)
      VALUES (${userId}, ${slug}, ${enabled})
      ON CONFLICT (user_id, tool_slug) DO UPDATE SET enabled = ${enabled}
    `);
  }

  const allowed = await getUserToolSlugs(userId);
  res.json({ userId, allowed });
});

export default router;
