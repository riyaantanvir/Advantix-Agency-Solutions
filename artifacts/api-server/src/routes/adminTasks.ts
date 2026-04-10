import { Router, type IRouter, type Request, type Response } from "express";
import { db, tasksTable, taskCommentsTable, projectsTable } from "@workspace/db";
import { eq, desc, asc, and, or, ilike, sql, inArray, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import {
  sendTelegramMessage,
  buildTaskCreatedMessage,
  buildTaskAssignedMessage,
  buildStatusChangedMessage,
} from "../services/telegram.js";

async function getProjectName(projectId: number | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  return p?.name ?? null;
}

const router: IRouter = Router();

/* GET /api/admin/tasks */
router.get("/admin/tasks", requireAdmin, async (req: Request, res: Response) => {
  const { type, status, priority, assignedTo, search, projectId } = req.query as Record<string, string>;

  let query = db.select().from(tasksTable).$dynamic();

  const conditions = [];
  if (type && type !== "all") conditions.push(eq(tasksTable.type, type));
  if (status && status !== "all") conditions.push(eq(tasksTable.status, status));
  if (priority && priority !== "all") conditions.push(eq(tasksTable.priority, priority));
  if (assignedTo && assignedTo !== "all") conditions.push(eq(tasksTable.assignedTo, assignedTo));
  if (projectId && projectId !== "all") conditions.push(eq(tasksTable.projectId, parseInt(projectId, 10)));
  if (search) conditions.push(
    or(
      ilike(tasksTable.title, `%${search}%`),
      ilike(tasksTable.description, `%${search}%`),
      ilike(tasksTable.clientName, `%${search}%`)
    )
  );

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const tasks = await query.orderBy(asc(tasksTable.position), desc(tasksTable.createdAt));

  let countMap: Record<number, number> = {};
  if (tasks.length > 0) {
    const ids = tasks.map(t => t.id);
    const rows = await db
      .select({ taskId: taskCommentsTable.taskId, cnt: count() })
      .from(taskCommentsTable)
      .where(inArray(taskCommentsTable.taskId, ids))
      .groupBy(taskCommentsTable.taskId);
    for (const r of rows) {
      countMap[r.taskId] = r.cnt;
    }
  }

  res.json(tasks.map(t => ({ ...t, commentCount: countMap[t.id] ?? 0 })));
});

/* GET /api/admin/tasks/:id */
router.get("/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(taskCommentsTable).where(eq(taskCommentsTable.taskId, id));
  res.json({ ...task, commentCount: cnt ?? 0 });
});

/* POST /api/admin/tasks */
router.post("/admin/tasks", requireAdmin, async (req: Request, res: Response) => {
  const { title, description, status, priority, type, clientName, assignedTo, dueDate, tags, createdBy, projectId, isRecurring, recurrenceType, recurrenceTime } =
    req.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      type?: string;
      clientName?: string;
      assignedTo?: string;
      dueDate?: string;
      tags?: string;
      createdBy?: string;
      projectId?: number | null;
      isRecurring?: boolean;
      recurrenceType?: string;
      recurrenceTime?: string;
    };

  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      title: title.trim(),
      description: description?.trim() ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      type: type ?? "internal",
      clientName: clientName?.trim() ?? null,
      assignedTo: assignedTo?.trim() ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: tags ?? null,
      projectId: projectId ?? null,
      createdBy: createdBy?.trim() ?? null,
      isRecurring: isRecurring ?? false,
      recurrenceType: isRecurring ? (recurrenceType ?? "daily") : null,
      recurrenceTime: isRecurring ? (recurrenceTime ?? null) : null,
    })
    .returning();

  res.status(201).json(task);

  // Fire Telegram notifications (non-blocking)
  getProjectName(task.projectId).then(projectName => {
    sendTelegramMessage(buildTaskCreatedMessage({ ...task, projectName }), "TELEGRAM_NOTIFY_TASK_CREATED").catch(() => {});
    if (task.assignedTo) {
      sendTelegramMessage(buildTaskAssignedMessage({ ...task, projectName }), "TELEGRAM_NOTIFY_TASK_ASSIGNED").catch(() => {});
    }
  }).catch(() => {});
});

/* PUT /api/admin/tasks/:id */
router.put("/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { title, description, status, priority, type, clientName, assignedTo, dueDate, tags, projectId, isRecurring, recurrenceType, recurrenceTime } =
    req.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      type?: string;
      clientName?: string;
      assignedTo?: string;
      dueDate?: string | null;
      tags?: string;
      projectId?: number | null;
      isRecurring?: boolean;
      recurrenceType?: string;
      recurrenceTime?: string;
    };

  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  // Fetch current state BEFORE update for change detection
  const [before] = await db.select({ status: tasksTable.status, assignedTo: tasksTable.assignedTo, projectId: tasksTable.projectId })
    .from(tasksTable).where(eq(tasksTable.id, id)).limit(1);

  const [updated] = await db
    .update(tasksTable)
    .set({
      title: title.trim(),
      description: description?.trim() ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      type: type ?? "internal",
      clientName: clientName?.trim() ?? null,
      assignedTo: assignedTo?.trim() ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: tags ?? null,
      projectId: projectId !== undefined ? (projectId ?? null) : undefined,
      isRecurring: isRecurring ?? false,
      recurrenceType: isRecurring ? (recurrenceType ?? "daily") : null,
      recurrenceTime: isRecurring ? (recurrenceTime ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(updated);

  // Fire notifications for changes (non-blocking)
  const effectiveProjectId = projectId !== undefined ? (projectId ?? null) : (before?.projectId ?? null);
  getProjectName(effectiveProjectId).then(projectName => {
    // Assignee changed
    if (updated.assignedTo && updated.assignedTo !== before?.assignedTo) {
      sendTelegramMessage(buildTaskAssignedMessage({ ...updated, projectName }), "TELEGRAM_NOTIFY_TASK_ASSIGNED").catch(() => {});
    }
    // Status changed
    const oldStatus = before?.status;
    if (oldStatus && oldStatus !== updated.status) {
      sendTelegramMessage(
        buildStatusChangedMessage({ title: updated.title, oldStatus, newStatus: updated.status, assignedTo: updated.assignedTo, projectName }),
        "TELEGRAM_NOTIFY_TASK_STATUS"
      ).catch(() => {});
    }
  }).catch(() => {});
});

/* PATCH /api/admin/tasks/:id/status */
router.patch("/admin/tasks/:id/status", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { status } = req.body as { status?: string };

  if (!status) {
    res.status(400).json({ error: "Status is required" });
    return;
  }

  // Fetch current status BEFORE updating
  const [current] = await db
    .select({ status: tasksTable.status })
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);

  const [updated] = await db
    .update(tasksTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(updated);

  // Send Telegram notification if status actually changed
  const oldStatus = current?.status;
  if (oldStatus && oldStatus !== status) {
    getProjectName(updated.projectId).then(projectName => {
      sendTelegramMessage(
        buildStatusChangedMessage({ title: updated.title, oldStatus, newStatus: status, assignedTo: updated.assignedTo, projectName }),
        "TELEGRAM_NOTIFY_TASK_STATUS"
      ).catch(() => {});
    }).catch(() => {});
  }
});

/* DELETE /api/admin/tasks/:id */
router.delete("/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ message: "Task deleted" });
});

export default router;
