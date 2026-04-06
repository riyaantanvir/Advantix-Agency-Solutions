import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { bugReportsTable } from "@workspace/db/schema";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.post("/bugs", async (req, res) => {
  try {
    const { title, description, screenshot, reporterName, reporterEmail, pageUrl } = req.body as {
      title?: string;
      description?: string;
      screenshot?: string;
      reporterName?: string;
      reporterEmail?: string;
      pageUrl?: string;
    };

    if (!title?.trim() || !description?.trim()) {
      res.status(400).json({ error: "Title and description are required" });
      return;
    }

    const [bug] = await db
      .insert(bugReportsTable)
      .values({
        title: title.trim(),
        description: description.trim(),
        screenshot: screenshot || null,
        reporterName: reporterName?.trim() || null,
        reporterEmail: reporterEmail?.trim() || null,
        pageUrl: pageUrl?.trim() || null,
      })
      .returning();

    res.status(201).json(bug);
  } catch {
    res.status(500).json({ error: "Failed to submit bug report" });
  }
});

router.get("/bugs", requireAdmin, async (_req, res) => {
  try {
    const bugs = await db
      .select()
      .from(bugReportsTable)
      .orderBy(desc(bugReportsTable.createdAt));
    res.json(bugs);
  } catch {
    res.status(500).json({ error: "Failed to fetch bug reports" });
  }
});

router.get("/bugs/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [bug] = await db
      .select()
      .from(bugReportsTable)
      .where(eq(bugReportsTable.id, id))
      .limit(1);
    if (!bug) { res.status(404).json({ error: "Bug report not found" }); return; }
    res.json(bug);
  } catch {
    res.status(500).json({ error: "Failed to fetch bug report" });
  }
});

router.patch("/bugs/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, priority, adminNote } = req.body as {
      status?: string;
      priority?: string;
      adminNote?: string;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (adminNote !== undefined) updateData.adminNote = adminNote;

    const [updated] = await db
      .update(bugReportsTable)
      .set(updateData)
      .where(eq(bugReportsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Bug report not found" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update bug report" });
  }
});

router.delete("/bugs/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(bugReportsTable).where(eq(bugReportsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete bug report" });
  }
});

export default router;
