import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db, workspacesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/admin/user-workspaces", requireAdmin, async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT w.id, w.name, w.slug, w.invite_code, w.owner_tool_user_id, w.created_at, w.updated_at,
           u.name AS owner_name, u.email AS owner_email,
           (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count,
           (SELECT COUNT(*) FROM workspace_projects p WHERE p.workspace_id = w.id) AS project_count,
           (SELECT COUNT(*) FROM workspace_tasks t WHERE t.workspace_id = w.id) AS task_count,
           (SELECT COUNT(*) FROM workspace_tasks t WHERE t.workspace_id = w.id AND t.status NOT IN ('done','cancelled')) AS open_task_count
    FROM workspaces w
    LEFT JOIN tool_users u ON u.id = w.owner_tool_user_id
    ORDER BY w.created_at DESC
  `);
  res.json({ workspaces: rows.rows });
});

router.get("/admin/user-workspaces/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const ws = await db.execute(sql`
    SELECT w.*, u.name AS owner_name, u.email AS owner_email
    FROM workspaces w LEFT JOIN tool_users u ON u.id = w.owner_tool_user_id
    WHERE w.id = ${id} LIMIT 1
  `);
  if (!ws.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const members = await db.execute(sql`
    SELECT m.id, m.role, m.joined_at, m.tool_user_id, u.name, u.email
    FROM workspace_members m LEFT JOIN tool_users u ON u.id = m.tool_user_id
    WHERE m.workspace_id = ${id}
    ORDER BY (m.role = 'owner') DESC, m.joined_at ASC
  `);
  const projects = await db.execute(sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM workspace_tasks t WHERE t.project_id = p.id) AS task_count
    FROM workspace_projects p WHERE p.workspace_id = ${id} ORDER BY p.created_at DESC
  `);
  const tasks = await db.execute(sql`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, t.created_at,
           u.name AS assigned_name, p.name AS project_name
    FROM workspace_tasks t
    LEFT JOIN tool_users u ON u.id = t.assigned_to_tool_user_id
    LEFT JOIN workspace_projects p ON p.id = t.project_id
    WHERE t.workspace_id = ${id}
    ORDER BY t.created_at DESC LIMIT 200
  `);
  res.json({
    workspace: ws.rows[0],
    members: members.rows,
    projects: projects.rows,
    tasks: tasks.rows,
  });
});

router.delete("/admin/user-workspaces/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  await db.execute(sql`DELETE FROM workspace_task_comments WHERE task_id IN (SELECT id FROM workspace_tasks WHERE workspace_id = ${id})`);
  await db.execute(sql`DELETE FROM workspace_tasks WHERE workspace_id = ${id}`);
  await db.execute(sql`DELETE FROM workspace_projects WHERE workspace_id = ${id}`);
  await db.execute(sql`DELETE FROM workspace_invites WHERE workspace_id = ${id}`);
  await db.execute(sql`DELETE FROM workspace_members WHERE workspace_id = ${id}`);
  await db.execute(sql`DELETE FROM workspace_telegram_settings WHERE workspace_id = ${id}`);
  await db.execute(sql`DELETE FROM workspaces WHERE id = ${id}`);
  res.json({ ok: true });
});

export default router;
