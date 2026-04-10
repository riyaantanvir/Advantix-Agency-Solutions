import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable, projectMembersTable, tasksTable, adminsTable, taskCommentsTable } from "@workspace/db";
import { eq, and, desc, lte, or, ne, sql, inArray, count, gte, lt } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { sendTelegramMessage, buildTaskCommentMessage } from "../services/telegram.js";

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

// ── Project Stats / Report ────────────────────────────────────────────────────

router.get("/admin/projects/:id/stats", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);

  const { from, to, assignedTo, priority, status } = req.query as {
    from?: string; to?: string; assignedTo?: string; priority?: string; status?: string;
  };

  const conditions: ReturnType<typeof eq>[] = [eq(tasksTable.projectId, id)];
  if (from) conditions.push(gte(tasksTable.createdAt, new Date(from)));
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lt(tasksTable.createdAt, toDate));
  }
  if (assignedTo) conditions.push(eq(tasksTable.assignedTo, assignedTo));
  if (priority) conditions.push(eq(tasksTable.priority, priority));
  if (status) conditions.push(eq(tasksTable.status, status));

  const tasks = await db.select().from(tasksTable).where(and(...conditions));

  const total = tasks.length;
  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0, cancelled: 0 } as Record<string, number>;
  const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 } as Record<string, number>;
  const byAssignee: Record<string, { total: number; done: number; open: number }> = {};

  let completionDaysSum = 0;
  let completionDaysCount = 0;
  const now = new Date();
  let overdueCount = 0;

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;

    const name = t.assignedTo ?? "Unassigned";
    if (!byAssignee[name]) byAssignee[name] = { total: 0, done: 0, open: 0 };
    byAssignee[name].total++;
    if (t.status === "done") byAssignee[name].done++;
    else byAssignee[name].open++;

    if (t.status === "done") {
      const diffMs = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      completionDaysSum += diffDays;
      completionDaysCount++;
    }

    if (t.dueDate && t.status !== "done" && t.status !== "cancelled" && new Date(t.dueDate) < now) {
      overdueCount++;
    }
  }

  const open = (byStatus.todo ?? 0) + (byStatus.in_progress ?? 0) + (byStatus.review ?? 0);
  const done = byStatus.done ?? 0;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
  const avgCompletionDays = completionDaysCount > 0
    ? Math.round((completionDaysSum / completionDaysCount) * 10) / 10
    : null;

  let totalComments = 0;
  if (tasks.length > 0) {
    const ids = tasks.map(t => t.id);
    const [row] = await db
      .select({ cnt: count() })
      .from(taskCommentsTable)
      .where(inArray(taskCommentsTable.taskId, ids));
    totalComments = row?.cnt ?? 0;
  }

  const avgCommentsPerTask = total > 0 ? Math.round((totalComments / total) * 10) / 10 : 0;

  const assignees = Object.entries(byAssignee).map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total);

  const members = await db
    .select({ username: adminsTable.username })
    .from(projectMembersTable)
    .leftJoin(adminsTable, eq(projectMembersTable.adminId, adminsTable.id))
    .where(eq(projectMembersTable.projectId, id));

  res.json({
    total, open, done, cancelled: byStatus.cancelled ?? 0,
    pending: byStatus.todo ?? 0, inProgress: byStatus.in_progress ?? 0, inReview: byStatus.review ?? 0,
    completionRate, overdueCount, avgCompletionDays,
    totalComments, avgCommentsPerTask,
    byPriority, byStatus, assignees,
    memberUsernames: members.map(m => m.username).filter(Boolean),
  });
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

  // Send Telegram notification (non-blocking)
  const [task] = await db.select({ title: tasksTable.title, projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
  if (task) {
    let projectName: string | null = null;
    if (task.projectId) {
      const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, task.projectId)).limit(1);
      projectName = p?.name ?? null;
    }
    sendTelegramMessage(
      buildTaskCommentMessage({ taskTitle: task.title, authorName: comment.authorName, content: comment.content, projectName }),
      "TELEGRAM_NOTIFY_TASK_COMMENT"
    ).catch(() => {});
  }
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
