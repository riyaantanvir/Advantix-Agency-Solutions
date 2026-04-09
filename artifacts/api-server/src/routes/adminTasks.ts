import { Router, type IRouter, type Request, type Response } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, desc, asc, and, or, ilike } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import {
  sendTelegramMessage,
  buildTaskCreatedMessage,
  buildTaskAssignedMessage,
  buildStatusChangedMessage,
} from "../services/telegram.js";

const router: IRouter = Router();

/* GET /api/admin/tasks */
router.get("/admin/tasks", requireAdmin, async (req: Request, res: Response) => {
  const { type, status, priority, assignedTo, search } = req.query as Record<string, string>;

  let query = db.select().from(tasksTable).$dynamic();

  const conditions = [];
  if (type && type !== "all") conditions.push(eq(tasksTable.type, type));
  if (status && status !== "all") conditions.push(eq(tasksTable.status, status));
  if (priority && priority !== "all") conditions.push(eq(tasksTable.priority, priority));
  if (assignedTo && assignedTo !== "all") conditions.push(eq(tasksTable.assignedTo, assignedTo));
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
  res.json(tasks);
});

/* POST /api/admin/tasks */
router.post("/admin/tasks", requireAdmin, async (req: Request, res: Response) => {
  const { title, description, status, priority, type, clientName, assignedTo, dueDate, tags, createdBy } =
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
      createdBy: createdBy?.trim() ?? null,
    })
    .returning();

  res.status(201).json(task);

  // Fire Telegram notifications (non-blocking)
  sendTelegramMessage(buildTaskCreatedMessage(task), "TELEGRAM_NOTIFY_TASK_CREATED").catch(() => {});
  if (task.assignedTo) {
    sendTelegramMessage(buildTaskAssignedMessage(task), "TELEGRAM_NOTIFY_TASK_ASSIGNED").catch(() => {});
  }
});

/* PUT /api/admin/tasks/:id */
router.put("/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { title, description, status, priority, type, clientName, assignedTo, dueDate, tags } =
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
    };

  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

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
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(updated);

  // Notify if assignee changed
  const prevAssignee = (req.body as { _prevAssignedTo?: string })._prevAssignedTo;
  if (updated.assignedTo && updated.assignedTo !== prevAssignee) {
    sendTelegramMessage(buildTaskAssignedMessage(updated), "TELEGRAM_NOTIFY_TASK_ASSIGNED").catch(() => {});
  }
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
    sendTelegramMessage(
      buildStatusChangedMessage({ title: updated.title, oldStatus, newStatus: status, assignedTo: updated.assignedTo }),
      "TELEGRAM_NOTIFY_TASK_STATUS"
    ).catch(() => {});
  }
});

/* DELETE /api/admin/tasks/:id */
router.delete("/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ message: "Task deleted" });
});

export default router;
