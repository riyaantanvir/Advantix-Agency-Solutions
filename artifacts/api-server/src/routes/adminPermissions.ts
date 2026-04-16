import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

/* ─── Admin pages definition ────────────────────────────────────── */

export const ALL_ADMIN_PAGES = [
  { slug: "dashboard",          label: "Dashboard",             group: null },
  { slug: "management",         label: "Management",            group: "Management" },
  { slug: "project-management", label: "Project Management",    group: "Project Management" },
  { slug: "marketing",          label: "Mail Management",       group: "Mail Management" },
  { slug: "content",            label: "Content",               group: "Content" },
  { slug: "social-media",       label: "Social Media",          group: "Social Media" },
  { slug: "analytics",          label: "Website Analytics",     group: null },
  { slug: "generate-content",   label: "Generate Content",      group: "Generate Content" },
  { slug: "finance",            label: "Finance",               group: "Finance" },
  { slug: "system",             label: "System",                group: "System" },
  { slug: "admin-settings",     label: "Admin Settings",        group: "Admin Settings" },
];

export const ALL_PAGE_SLUGS = ALL_ADMIN_PAGES.map(p => p.slug);

/* ─── Auto-migrate ──────────────────────────────────────────────── */

export async function ensureAdminPermissionsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      id          SERIAL PRIMARY KEY,
      admin_id    INTEGER NOT NULL,
      page_slug   TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      UNIQUE (admin_id, page_slug)
    )
  `);
}

/* ─── Helper: ensure all pages exist for an admin ───────────────── */

const RESTRICTED_BY_DEFAULT = new Set(["admin-settings"]);

async function ensureAdminPages(adminId: number): Promise<void> {
  for (const slug of ALL_PAGE_SLUGS) {
    const defaultEnabled = !RESTRICTED_BY_DEFAULT.has(slug);
    await db.execute(sql`
      INSERT INTO admin_permissions (admin_id, page_slug, enabled)
      VALUES (${adminId}, ${slug}, ${defaultEnabled})
      ON CONFLICT (admin_id, page_slug) DO NOTHING
    `);
  }
}

/* ─── Helper: get page slugs for an admin ───────────────────────── */

export async function getAdminPageSlugs(adminId: number): Promise<string[]> {
  await ensureAdminPages(adminId);
  const r = await db.execute(sql`
    SELECT page_slug FROM admin_permissions
    WHERE admin_id = ${adminId} AND enabled = true
  `);
  return (r.rows as { page_slug: string }[]).map(row => row.page_slug);
}

/* ════════════════════════════════════════════════════════════════ */
/* GET /api/auth/my-admin-permissions — current admin's pages       */
/* ════════════════════════════════════════════════════════════════ */

router.get("/auth/my-admin-permissions", requireAdmin, async (req, res) => {
  const session = req.session as { adminId?: number; isSuperAdmin?: boolean };
  const adminId = session.adminId!;
  const isSuperAdmin = session.isSuperAdmin ?? false;

  if (isSuperAdmin) {
    return res.json({ pages: ALL_PAGE_SLUGS, isSuperAdmin: true });
  }

  const pages = await getAdminPageSlugs(adminId);
  return res.json({ pages, isSuperAdmin: false });
});

/* ════════════════════════════════════════════════════════════════ */
/* GET /api/admin/admin-permissions — list all non-super admins     */
/* ════════════════════════════════════════════════════════════════ */

router.get("/admin/admin-permissions", requireAdmin, async (_req, res) => {
  const adminsR = await db.execute(sql`
    SELECT id, username, is_super_admin, created_at
    FROM admins
    ORDER BY created_at ASC
  `);
  const admins = adminsR.rows as { id: number; username: string; is_super_admin: boolean; created_at: string }[];

  const permsR = await db.execute(sql`
    SELECT admin_id, page_slug, enabled FROM admin_permissions
  `);
  const permsMap: Record<number, Record<string, boolean>> = {};
  for (const row of permsR.rows as { admin_id: number; page_slug: string; enabled: boolean }[]) {
    if (!permsMap[row.admin_id]) permsMap[row.admin_id] = {};
    permsMap[row.admin_id][row.page_slug] = row.enabled;
  }

  const result = admins.map(a => ({
    id: a.id,
    username: a.username,
    isSuperAdmin: a.is_super_admin,
    createdAt: a.created_at,
    pages: ALL_PAGE_SLUGS.reduce<Record<string, boolean>>((acc, slug) => {
      acc[slug] = permsMap[a.id]?.[slug] ?? true;
      return acc;
    }, {}),
  }));

  return res.json({ admins: result, allPages: ALL_ADMIN_PAGES });
});

/* ════════════════════════════════════════════════════════════════ */
/* PUT /api/admin/admin-permissions/:adminId — update permissions   */
/* ════════════════════════════════════════════════════════════════ */

router.put("/admin/admin-permissions/:adminId", requireAdmin, async (req, res) => {
  const session = req.session as { adminId?: number; isSuperAdmin?: boolean };
  const targetId = parseInt(req.params.adminId);
  const { pages } = req.body as { pages: Record<string, boolean> };

  if (!pages || typeof pages !== "object") {
    return res.status(400).json({ error: "pages object required" });
  }

  for (const slug of ALL_PAGE_SLUGS) {
    const enabled = pages[slug] !== undefined ? Boolean(pages[slug]) : true;
    await db.execute(sql`
      INSERT INTO admin_permissions (admin_id, page_slug, enabled)
      VALUES (${targetId}, ${slug}, ${enabled})
      ON CONFLICT (admin_id, page_slug) DO UPDATE SET enabled = ${enabled}
    `);
  }

  const allowed = await getAdminPageSlugs(targetId);
  return res.json({ adminId: targetId, pages: allowed });
});

export default router;
