import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  workspacesTable,
  workspaceMembersTable,
  workspaceProjectsTable,
  workspaceTasksTable,
  workspaceTaskCommentsTable,
  workspaceTelegramSettingsTable,
  toolUsersTable,
} from "@workspace/db";
import { requireToolUser } from "../middleware/toolAuth.js";
import {
  notifyWorkspace,
  sendWorkspaceTestMessage,
  buildTaskCreatedHtml,
  buildStatusChangedHtml,
  buildCommentHtml,
} from "../lib/workspaceTelegram.js";

const router = Router();

function uid(req: Request): number | null {
  const internal = (req as unknown as { internalToolUserId?: number }).internalToolUserId;
  if (typeof internal === "number") return internal;
  const sess = req.session as { toolUserId?: number } | undefined;
  return sess?.toolUserId ?? null;
}

async function membership(workspaceId: number, toolUserId: number) {
  const r = await db.select().from(workspaceMembersTable)
    .where(and(eq(workspaceMembersTable.workspaceId, workspaceId), eq(workspaceMembersTable.toolUserId, toolUserId)))
    .limit(1);
  return r[0] ?? null;
}

async function requireMember(req: Request, res: Response): Promise<{ wid: number; uid: number } | null> {
  const u = uid(req); if (!u) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const w = parseInt(req.params.workspaceId ?? req.params.wid ?? "", 10);
  if (!Number.isFinite(w)) { res.status(400).json({ error: "Bad workspace id" }); return null; }
  const m = await membership(w, u);
  if (!m) { res.status(403).json({ error: "Not a member" }); return null; }
  return { wid: w, uid: u };
}

async function requireOwner(req: Request, res: Response): Promise<{ wid: number; uid: number } | null> {
  const ctx = await requireMember(req, res); if (!ctx) return null;
  const m = await membership(ctx.wid, ctx.uid);
  if (m?.role !== "owner") { res.status(403).json({ error: "Owner only" }); return null; }
  return ctx;
}

async function getWorkspaceName(wid: number): Promise<string> {
  const r = await db.select({ name: workspacesTable.name }).from(workspacesTable).where(eq(workspacesTable.id, wid)).limit(1);
  return r[0]?.name ?? `#${wid}`;
}
async function getUserName(toolUserId: number | null): Promise<string | null> {
  if (toolUserId == null) return null;
  const r = await db.select({ name: toolUsersTable.name }).from(toolUsersTable).where(eq(toolUsersTable.id, toolUserId)).limit(1);
  return r[0]?.name ?? null;
}

/* ── PROJECTS ─────────────────────────────────────────────────────────── */

router.get("/tools/workspaces/:workspaceId/projects", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const rows = await db.execute(sql`
    SELECT p.*,
           (SELECT COUNT(*) FROM workspace_tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','cancelled')) AS open_task_count,
           (SELECT COUNT(*) FROM workspace_tasks t WHERE t.project_id = p.id) AS task_count
    FROM workspace_projects p
    WHERE p.workspace_id = ${ctx.wid}
    ORDER BY (p.status = 'archived') ASC, p.created_at DESC
  `);
  res.json({ projects: rows.rows });
});

router.post("/tools/workspaces/:workspaceId/projects", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const name = String(req.body?.name ?? "").trim();
  const description = typeof req.body?.description === "string" ? req.body.description.slice(0, 2000) : null;
  const color = typeof req.body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : "#3b82f6";
  if (!name || name.length > 120) { res.status(400).json({ error: "Name required (1-120 chars)" }); return; }

  const r = await db.insert(workspaceProjectsTable).values({
    workspaceId: ctx.wid, name, description, color,
    createdByToolUserId: ctx.uid,
  }).returning();
  res.json({ project: r[0] });
});

router.get("/tools/workspaces/:workspaceId/projects/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const r = await db.select().from(workspaceProjectsTable)
    .where(and(eq(workspaceProjectsTable.id, id), eq(workspaceProjectsTable.workspaceId, ctx.wid))).limit(1);
  if (!r[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ project: r[0] });
});

router.patch("/tools/workspaces/:workspaceId/projects/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") patch.name = req.body.name.trim().slice(0, 120);
  if (typeof req.body?.description === "string") patch.description = req.body.description.slice(0, 2000);
  if (typeof req.body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.color)) patch.color = req.body.color;
  if (req.body?.status === "active" || req.body?.status === "archived") patch.status = req.body.status;
  await db.update(workspaceProjectsTable).set(patch as never)
    .where(and(eq(workspaceProjectsTable.id, id), eq(workspaceProjectsTable.workspaceId, ctx.wid)));
  res.json({ ok: true });
});

router.delete("/tools/workspaces/:workspaceId/projects/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  /* Detach tasks (don't delete; user data) */
  await db.update(workspaceTasksTable).set({ projectId: null })
    .where(and(eq(workspaceTasksTable.projectId, id), eq(workspaceTasksTable.workspaceId, ctx.wid)));
  await db.delete(workspaceProjectsTable)
    .where(and(eq(workspaceProjectsTable.id, id), eq(workspaceProjectsTable.workspaceId, ctx.wid)));
  res.json({ ok: true });
});

/* ── TASKS ────────────────────────────────────────────────────────────── */

router.get("/tools/workspaces/:workspaceId/tasks", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const projectId = req.query.projectId ? parseInt(String(req.query.projectId), 10) : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const assignedToMe = req.query.assignedToMe === "true";

  let queryStr = sql`
    SELECT t.*,
           u.name AS assigned_to_name, u.email AS assigned_to_email,
           c.name AS created_by_name,
           p.name AS project_name, p.color AS project_color
    FROM workspace_tasks t
    LEFT JOIN tool_users u ON u.id = t.assigned_to_tool_user_id
    LEFT JOIN tool_users c ON c.id = t.created_by_tool_user_id
    LEFT JOIN workspace_projects p ON p.id = t.project_id
    WHERE t.workspace_id = ${ctx.wid}
  `;
  if (projectId !== null && Number.isFinite(projectId)) {
    queryStr = sql`${queryStr} AND t.project_id = ${projectId}`;
  }
  if (status) queryStr = sql`${queryStr} AND t.status = ${status}`;
  if (assignedToMe) queryStr = sql`${queryStr} AND t.assigned_to_tool_user_id = ${ctx.uid}`;
  queryStr = sql`${queryStr} ORDER BY t.position ASC, t.created_at DESC`;

  const rows = await db.execute(queryStr);
  res.json({ tasks: rows.rows });
});

router.post("/tools/workspaces/:workspaceId/tasks", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const title = String(req.body?.title ?? "").trim();
  if (!title || title.length > 300) { res.status(400).json({ error: "Title required (1-300 chars)" }); return; }
  const description = typeof req.body?.description === "string" ? req.body.description.slice(0, 5000) : null;
  const priority = ["low","medium","high","urgent"].includes(req.body?.priority) ? req.body.priority : "medium";
  const status = ["todo","in_progress","review","done","cancelled"].includes(req.body?.status) ? req.body.status : "todo";
  const projectId = req.body?.projectId ? parseInt(String(req.body.projectId), 10) : null;
  const assignedTo = req.body?.assignedToToolUserId ? parseInt(String(req.body.assignedToToolUserId), 10) : null;
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;

  /* Validate project and assignee belong to workspace */
  if (projectId !== null) {
    const p = await db.select().from(workspaceProjectsTable)
      .where(and(eq(workspaceProjectsTable.id, projectId), eq(workspaceProjectsTable.workspaceId, ctx.wid))).limit(1);
    if (!p[0]) { res.status(400).json({ error: "Invalid project" }); return; }
  }
  if (assignedTo !== null) {
    const m = await membership(ctx.wid, assignedTo);
    if (!m) { res.status(400).json({ error: "Assignee is not a member of this workspace" }); return; }
  }

  const r = await db.insert(workspaceTasksTable).values({
    workspaceId: ctx.wid,
    projectId: Number.isFinite(projectId) ? projectId : null,
    title, description, status, priority,
    assignedToToolUserId: Number.isFinite(assignedTo) ? assignedTo : null,
    dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
    createdByToolUserId: ctx.uid,
  }).returning();
  const task = r[0];

  /* Fire telegram notification */
  try {
    const wsName = await getWorkspaceName(ctx.wid);
    const projectName = projectId !== null
      ? (await db.select({ name: workspaceProjectsTable.name }).from(workspaceProjectsTable).where(eq(workspaceProjectsTable.id, projectId)).limit(1))[0]?.name ?? null
      : null;
    const assignedName = await getUserName(task.assignedToToolUserId);
    const createdName = await getUserName(ctx.uid) ?? undefined;
    await notifyWorkspace(ctx.wid, buildTaskCreatedHtml({
      workspaceName: wsName, projectName,
      title: task.title, priority: task.priority,
      assignedToName: assignedName, dueDate: task.dueDate,
      description: task.description, createdByName: createdName,
    }), "create");
  } catch (e) { console.error("workspace task-create notify failed:", e); }

  res.json({ task });
});

router.get("/tools/workspaces/:workspaceId/tasks/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const rows = await db.execute(sql`
    SELECT t.*, u.name AS assigned_to_name, u.email AS assigned_to_email,
           c.name AS created_by_name,
           p.name AS project_name, p.color AS project_color
    FROM workspace_tasks t
    LEFT JOIN tool_users u ON u.id = t.assigned_to_tool_user_id
    LEFT JOIN tool_users c ON c.id = t.created_by_tool_user_id
    LEFT JOIN workspace_projects p ON p.id = t.project_id
    WHERE t.id = ${id} AND t.workspace_id = ${ctx.wid}
    LIMIT 1
  `);
  if (!rows.rows[0]) { res.status(404).json({ error: "Task not found" }); return; }
  res.json({ task: rows.rows[0] });
});

router.patch("/tools/workspaces/:workspaceId/tasks/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const existing = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Task not found" }); return; }
  const oldStatus = existing[0].status;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.title === "string") patch.title = req.body.title.trim().slice(0, 300);
  if (typeof req.body?.description === "string") patch.description = req.body.description.slice(0, 5000);
  if (["low","medium","high","urgent"].includes(req.body?.priority)) patch.priority = req.body.priority;
  if (["todo","in_progress","review","done","cancelled"].includes(req.body?.status)) patch.status = req.body.status;
  if (req.body?.projectId !== undefined) {
    const pid = req.body.projectId === null ? null : parseInt(String(req.body.projectId), 10);
    if (pid === null) patch.projectId = null;
    else if (Number.isFinite(pid)) {
      const p = await db.select().from(workspaceProjectsTable)
        .where(and(eq(workspaceProjectsTable.id, pid), eq(workspaceProjectsTable.workspaceId, ctx.wid))).limit(1);
      if (!p[0]) { res.status(400).json({ error: "Invalid project" }); return; }
      patch.projectId = pid;
    }
  }
  if (req.body?.assignedToToolUserId !== undefined) {
    const aid = req.body.assignedToToolUserId === null ? null : parseInt(String(req.body.assignedToToolUserId), 10);
    if (aid === null) patch.assignedToToolUserId = null;
    else if (Number.isFinite(aid)) {
      const m = await membership(ctx.wid, aid);
      if (!m) { res.status(400).json({ error: "Assignee not a member" }); return; }
      patch.assignedToToolUserId = aid;
    }
  }
  if (req.body?.dueDate !== undefined) {
    if (req.body.dueDate === null) patch.dueDate = null;
    else { const d = new Date(req.body.dueDate); if (!isNaN(d.getTime())) patch.dueDate = d; }
  }

  await db.update(workspaceTasksTable).set(patch as never)
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid)));

  if (patch.status && patch.status !== oldStatus) {
    try {
      const wsName = await getWorkspaceName(ctx.wid);
      const byName = (await getUserName(ctx.uid)) ?? undefined;
      await notifyWorkspace(ctx.wid, buildStatusChangedHtml({
        workspaceName: wsName, title: existing[0].title,
        from: oldStatus, to: String(patch.status), byName,
      }), "status");
    } catch (e) { console.error("workspace status notify failed:", e); }
  }

  res.json({ ok: true });
});

router.patch("/tools/workspaces/:workspaceId/tasks/:id/status", requireToolUser, async (req, res) => {
  /* Lightweight endpoint for board drag-drop */
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const newStatus = req.body?.status;
  if (!["todo","in_progress","review","done","cancelled"].includes(newStatus)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const existing = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Task not found" }); return; }
  const oldStatus = existing[0].status;
  if (oldStatus === newStatus) { res.json({ ok: true }); return; }

  await db.update(workspaceTasksTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid)));

  try {
    const wsName = await getWorkspaceName(ctx.wid);
    const byName = (await getUserName(ctx.uid)) ?? undefined;
    await notifyWorkspace(ctx.wid, buildStatusChangedHtml({
      workspaceName: wsName, title: existing[0].title,
      from: oldStatus, to: newStatus, byName,
    }), "status");
  } catch (e) { console.error("workspace status notify failed:", e); }
  res.json({ ok: true });
});

router.delete("/tools/workspaces/:workspaceId/tasks/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const t = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!t[0]) { res.status(404).json({ error: "Task not found" }); return; }
  await db.delete(workspaceTaskCommentsTable).where(eq(workspaceTaskCommentsTable.taskId, id));
  await db.delete(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, id), eq(workspaceTasksTable.workspaceId, ctx.wid)));
  res.json({ ok: true });
});

/* ── COMMENTS ─────────────────────────────────────────────────────────── */

router.get("/tools/workspaces/:workspaceId/tasks/:taskId/comments", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const taskId = parseInt(req.params.taskId, 10);
  /* Verify the task belongs to this workspace */
  const t = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, taskId), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!t[0]) { res.status(404).json({ error: "Task not found" }); return; }

  const rows = await db.execute(sql`
    SELECT c.id, c.content, c.created_at, c.author_tool_user_id,
           u.name AS author_name, u.email AS author_email
    FROM workspace_task_comments c
    LEFT JOIN tool_users u ON u.id = c.author_tool_user_id
    WHERE c.task_id = ${taskId}
    ORDER BY c.created_at ASC
  `);
  res.json({ comments: rows.rows });
});

router.post("/tools/workspaces/:workspaceId/tasks/:taskId/comments", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const taskId = parseInt(req.params.taskId, 10);
  const content = String(req.body?.content ?? "").trim();
  if (!content || content.length > 5000) { res.status(400).json({ error: "Content required (1-5000 chars)" }); return; }

  const t = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, taskId), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!t[0]) { res.status(404).json({ error: "Task not found" }); return; }

  const r = await db.insert(workspaceTaskCommentsTable).values({
    taskId, authorToolUserId: ctx.uid, content,
  }).returning();

  try {
    const wsName = await getWorkspaceName(ctx.wid);
    const authorName = (await getUserName(ctx.uid)) ?? "Someone";
    await notifyWorkspace(ctx.wid, buildCommentHtml({
      workspaceName: wsName, taskTitle: t[0].title, authorName, content,
    }), "comment");
  } catch (e) { console.error("workspace comment notify failed:", e); }

  res.json({ comment: r[0] });
});

router.delete("/tools/workspaces/:workspaceId/tasks/:taskId/comments/:id", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const id = parseInt(req.params.id, 10);
  const taskId = parseInt(req.params.taskId, 10);
  const c = await db.select().from(workspaceTaskCommentsTable).where(eq(workspaceTaskCommentsTable.id, id)).limit(1);
  if (!c[0] || c[0].taskId !== taskId) { res.status(404).json({ error: "Comment not found" }); return; }
  const t = await db.select().from(workspaceTasksTable)
    .where(and(eq(workspaceTasksTable.id, taskId), eq(workspaceTasksTable.workspaceId, ctx.wid))).limit(1);
  if (!t[0]) { res.status(404).json({ error: "Comment not found" }); return; }
  /* Author OR workspace owner can delete */
  if (c[0].authorToolUserId !== ctx.uid) {
    const m = await membership(ctx.wid, ctx.uid);
    if (m?.role !== "owner") { res.status(403).json({ error: "Cannot delete others' comments" }); return; }
  }
  await db.delete(workspaceTaskCommentsTable).where(eq(workspaceTaskCommentsTable.id, id));
  res.json({ ok: true });
});

/* ── TELEGRAM SETTINGS ─────────────────────────────────────────────── */

router.get("/tools/workspaces/:workspaceId/telegram", requireToolUser, async (req, res) => {
  const ctx = await requireMember(req, res); if (!ctx) return;
  const r = await db.select().from(workspaceTelegramSettingsTable)
    .where(eq(workspaceTelegramSettingsTable.workspaceId, ctx.wid)).limit(1);
  if (!r[0]) {
    /* Lazily create defaults */
    await db.insert(workspaceTelegramSettingsTable).values({ workspaceId: ctx.wid }).onConflictDoNothing();
    const r2 = await db.select().from(workspaceTelegramSettingsTable)
      .where(eq(workspaceTelegramSettingsTable.workspaceId, ctx.wid)).limit(1);
    res.json({ settings: r2[0] });
    return;
  }
  res.json({ settings: r[0] });
});

router.put("/tools/workspaces/:workspaceId/telegram", requireToolUser, async (req, res) => {
  const ctx = await requireOwner(req, res); if (!ctx) return;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.chatIds === "string") {
    /* Validate format: comma-separated numeric/-numeric */
    const v = req.body.chatIds.trim();
    if (v && !/^\s*-?\d{3,20}(\s*,\s*-?\d{3,20})*\s*$/.test(v)) {
      res.status(400).json({ error: "chatIds must be comma-separated numeric IDs" });
      return;
    }
    patch.chatIds = v ? v.split(",").map((s: string) => s.trim()).join(",") : null;
  }
  if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
  if (typeof req.body?.taskRemindIntervalHours === "number" && req.body.taskRemindIntervalHours >= 1) {
    patch.taskRemindIntervalHours = Math.round(req.body.taskRemindIntervalHours);
  }
  if (typeof req.body?.workHoursStart === "number") {
    patch.workHoursStart = ((Math.round(req.body.workHoursStart) % 24) + 24) % 24;
  }
  if (typeof req.body?.workHoursEnd === "number") {
    patch.workHoursEnd = ((Math.round(req.body.workHoursEnd) % 24) + 24) % 24;
  }
  if (typeof req.body?.notifyOnCreate === "boolean") patch.notifyOnCreate = req.body.notifyOnCreate;
  if (typeof req.body?.notifyOnStatusChange === "boolean") patch.notifyOnStatusChange = req.body.notifyOnStatusChange;
  if (typeof req.body?.notifyOnComment === "boolean") patch.notifyOnComment = req.body.notifyOnComment;

  /* Ensure row exists */
  await db.insert(workspaceTelegramSettingsTable).values({ workspaceId: ctx.wid }).onConflictDoNothing();
  await db.update(workspaceTelegramSettingsTable).set(patch as never)
    .where(eq(workspaceTelegramSettingsTable.workspaceId, ctx.wid));
  res.json({ ok: true });
});

router.post("/tools/workspaces/:workspaceId/telegram/test", requireToolUser, async (req, res) => {
  const ctx = await requireOwner(req, res); if (!ctx) return;
  const r = await sendWorkspaceTestMessage(ctx.wid);
  res.json(r);
});

export default router;
