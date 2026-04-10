import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable, projectMembersTable, tasksTable, adminsTable, taskCommentsTable } from "@workspace/db";
import { eq, and, desc, lte, or, ne, sql, inArray, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

// ── Projects CRUD ─────────────────────────────────────────────────────────────

router.get("/admin/projects", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { adminId?: number };
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));

  const enriched = await Promise.all(
    projects.map(async (p) => {
      const [memberCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectMembersTable)
        .where(eq(projectMembersTable.projectId, p.id));
      const [taskCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(eq(tasksTable.projectId, p.id));
      return {
        ...p,
        memberCount: memberCount?.count ?? 0,
        taskCount: taskCount?.count ?? 0,
      };
    })
  );

  res.json(enriched);
});

router.post("/admin/projects", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { adminId?: number };
  const { name, description, color } = req.body as {
    name?: string;
    description?: string;
    color?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "Project name is required" });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      name: name.trim(),
      description: description?.trim() ?? null,
      color: color ?? "#3b82f6",
      createdBy: session.adminId,
    })
    .returning();

  // Auto-add creator as owner
  if (session.adminId) {
    await db.insert(projectMembersTable).values({
      projectId: project.id,
      adminId: session.adminId,
      role: "owner",
    });
  }

  res.status(201).json(project);
});

router.get("/admin/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const members = await db
    .select({
      id: projectMembersTable.id,
      adminId: projectMembersTable.adminId,
      role: projectMembersTable.role,
      addedAt: projectMembersTable.addedAt,
      username: adminsTable.username,
    })
    .from(projectMembersTable)
    .leftJoin(adminsTable, eq(projectMembersTable.adminId, adminsTable.id))
    .where(eq(projectMembersTable.projectId, id));

  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.projectId, id)).orderBy(desc(tasksTable.createdAt));

  res.json({ ...project, members, tasks });
});

router.put("/admin/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { name, description, color, status } = req.body as {
    name?: string;
    description?: string;
    color?: string;
    status?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

  const [updated] = await db
    .update(projectsTable)
    .set({ name: name.trim(), description: description?.trim() ?? null, color: color ?? "#3b82f6", status: status ?? "active", updatedAt: new Date() })
    .where(eq(projectsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(updated);
});

router.delete("/admin/projects/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.update(tasksTable).set({ projectId: null }).where(eq(tasksTable.projectId, id));
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.json({ message: "Project deleted" });
});

// ── Project Members ───────────────────────────────────────────────────────────

router.get("/admin/projects/:id/members", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const members = await db
    .select({
      id: projectMembersTable.id,
      adminId: projectMembersTable.adminId,
      role: projectMembersTable.role,
      addedAt: projectMembersTable.addedAt,
      username: adminsTable.username,
    })
    .from(projectMembersTable)
    .leftJoin(adminsTable, eq(projectMembersTable.adminId, adminsTable.id))
    .where(eq(projectMembersTable.projectId, id));
  res.json(members);
});

router.post("/admin/projects/:id/members", requireAdmin, async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.id ?? "0"), 10);
  const { adminId, role } = req.body as { adminId?: number; role?: string };

  if (!adminId) { res.status(400).json({ error: "adminId is required" }); return; }

  const [existing] = await db
    .select()
    .from(projectMembersTable)
    .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.adminId, adminId)))
    .limit(1);

  if (existing) { res.status(409).json({ error: "Already a member" }); return; }

  const [member] = await db
    .insert(projectMembersTable)
    .values({ projectId, adminId, role: role ?? "member" })
    .returning();
  res.status(201).json(member);
});

router.delete("/admin/projects/:id/members/:adminId", requireAdmin, async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.id ?? "0"), 10);
  const adminId = parseInt(String(req.params.adminId ?? "0"), 10);
  await db.delete(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.adminId, adminId))
  );
  res.json({ message: "Member removed" });
});

// ── Task Comments ─────────────────────────────────────────────────────────────

router.get("/admin/tasks/:id/comments", requireAdmin, async (req: Request, res: Response) => {
  const taskId = parseInt(String(req.params.id ?? "0"), 10);
  const comments = await db
    .select()
    .from(taskCommentsTable)
    .where(eq(taskCommentsTable.taskId, taskId))
    .orderBy(taskCommentsTable.createdAt);
  res.json(comments);
});

router.post("/admin/tasks/:id/comments", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { adminId?: number; username?: string };
  const taskId = parseInt(String(req.params.id ?? "0"), 10);
  const { content } = req.body as { content?: string };

  if (!content?.trim()) { res.status(400).json({ error: "Content is required" }); return; }

  const [comment] = await db
    .insert(taskCommentsTable)
    .values({
      taskId,
      authorId: session.adminId!,
      authorName: session.username ?? "Admin",
      content: content.trim(),
    })
    .returning();
  res.status(201).json(comment);
});

router.delete("/admin/tasks/:id/comments/:commentId", requireAdmin, async (req: Request, res: Response) => {
  const commentId = parseInt(String(req.params.commentId ?? "0"), 10);
  await db.delete(taskCommentsTable).where(eq(taskCommentsTable.id, commentId));
  res.json({ message: "Comment deleted" });
});

// ── PM Views ──────────────────────────────────────────────────────────────────

router.get("/admin/pm/my-tasks", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { username?: string };
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      or(
        eq(tasksTable.assignedTo, session.username ?? ""),
        eq(tasksTable.createdBy, session.username ?? "")
      )
    )
    .orderBy(desc(tasksTable.createdAt));

  const projectIds = [...new Set(tasks.map(t => t.projectId).filter(Boolean))] as number[];
  let projectMap: Record<number, string> = {};
  if (projectIds.length > 0) {
    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  }

  let countMap: Record<number, number> = {};
  if (tasks.length > 0) {
    const ids = tasks.map(t => t.id);
    const rows = await db
      .select({ taskId: taskCommentsTable.taskId, cnt: count() })
      .from(taskCommentsTable)
      .where(inArray(taskCommentsTable.taskId, ids))
      .groupBy(taskCommentsTable.taskId);
    for (const r of rows) countMap[r.taskId] = r.cnt;
  }

  res.json(tasks.map(t => ({ ...t, projectName: t.projectId ? projectMap[t.projectId] : null, commentCount: countMap[t.id] ?? 0 })));
});

router.get("/admin/pm/assigned-to-me", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { username?: string };
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.assignedTo, session.username ?? ""))
    .orderBy(desc(tasksTable.createdAt));

  const projectIds = [...new Set(tasks.map(t => t.projectId).filter(Boolean))] as number[];
  let projectMap: Record<number, string> = {};
  if (projectIds.length > 0) {
    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  }

  let countMap: Record<number, number> = {};
  if (tasks.length > 0) {
    const ids = tasks.map(t => t.id);
    const rows = await db
      .select({ taskId: taskCommentsTable.taskId, cnt: count() })
      .from(taskCommentsTable)
      .where(inArray(taskCommentsTable.taskId, ids))
      .groupBy(taskCommentsTable.taskId);
    for (const r of rows) countMap[r.taskId] = r.cnt;
  }

  res.json(tasks.map(t => ({ ...t, projectName: t.projectId ? projectMap[t.projectId] : null, commentCount: countMap[t.id] ?? 0 })));
});

router.get("/admin/pm/today-overdue", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { username?: string };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        lte(tasksTable.dueDate, tomorrow),
        ne(tasksTable.status, "done"),
        ne(tasksTable.status, "cancelled")
      )
    )
    .orderBy(tasksTable.dueDate);

  const projectIds = [...new Set(tasks.map(t => t.projectId).filter(Boolean))] as number[];
  let projectMap: Record<number, string> = {};
  if (projectIds.length > 0) {
    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  }

  let countMap: Record<number, number> = {};
  if (tasks.length > 0) {
    const ids = tasks.map(t => t.id);
    const rows = await db
      .select({ taskId: taskCommentsTable.taskId, cnt: count() })
      .from(taskCommentsTable)
      .where(inArray(taskCommentsTable.taskId, ids))
      .groupBy(taskCommentsTable.taskId);
    for (const r of rows) countMap[r.taskId] = r.cnt;
  }

  res.json(tasks.map(t => ({ ...t, projectName: t.projectId ? projectMap[t.projectId] : null, commentCount: countMap[t.id] ?? 0 })));
});

router.get("/admin/pm/replies", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { username?: string };

  const assignedTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title })
    .from(tasksTable)
    .where(eq(tasksTable.assignedTo, session.username ?? ""));

  if (assignedTasks.length === 0) { res.json([]); return; }

  const taskIds = assignedTasks.map(t => t.id);
  const taskMap = Object.fromEntries(assignedTasks.map(t => [t.id, t.title]));

  const comments = await db
    .select()
    .from(taskCommentsTable)
    .where(inArray(taskCommentsTable.taskId, taskIds))
    .orderBy(desc(taskCommentsTable.createdAt));

  res.json(comments.map(c => ({ ...c, taskTitle: taskMap[c.taskId] })));
});

router.get("/admin/pm/assigned-comments", requireAdmin, async (req: Request, res: Response) => {
  const session = req.session as { username?: string };

  const myTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title })
    .from(tasksTable)
    .where(eq(tasksTable.createdBy, session.username ?? ""));

  if (myTasks.length === 0) { res.json([]); return; }

  const taskIds = myTasks.map(t => t.id);
  const taskMap = Object.fromEntries(myTasks.map(t => [t.id, t.title]));

  const comments = await db
    .select()
    .from(taskCommentsTable)
    .where(inArray(taskCommentsTable.taskId, taskIds))
    .orderBy(desc(taskCommentsTable.createdAt));

  res.json(comments.map(c => ({ ...c, taskTitle: taskMap[c.taskId] })));
});

// ── Admins list (for member picker) ──────────────────────────────────────────

router.get("/admin/admins", requireAdmin, async (_req: Request, res: Response) => {
  const admins = await db.select({ id: adminsTable.id, username: adminsTable.username }).from(adminsTable);
  res.json(admins);
});

export default router;
