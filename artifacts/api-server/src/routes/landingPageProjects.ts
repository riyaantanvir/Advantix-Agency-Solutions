import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { landingPageProjectsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

router.use(requireToolUser);

function userId(req: Request): number {
  return (req.session as { toolUserId: number }).toolUserId;
}

// List all projects (summary, no full HTML to keep payload small)
router.get("/landing-page/projects", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: landingPageProjectsTable.id,
        name: landingPageProjectsTable.name,
        createdAt: landingPageProjectsTable.createdAt,
        updatedAt: landingPageProjectsTable.updatedAt,
      })
      .from(landingPageProjectsTable)
      .where(eq(landingPageProjectsTable.userId, userId(req)))
      .orderBy(desc(landingPageProjectsTable.updatedAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project with full html + messages
router.get("/landing-page/projects/:id", async (req: Request, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(landingPageProjectsTable)
      .where(
        and(
          eq(landingPageProjectsTable.id, Number(req.params.id)),
          eq(landingPageProjectsTable.userId, userId(req))
        )
      );
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new project
router.post("/landing-page/projects", async (req: Request, res: Response) => {
  const { name, html, messages } = req.body as {
    name?: string;
    html?: string;
    messages?: unknown[];
  };
  try {
    const [project] = await db
      .insert(landingPageProjectsTable)
      .values({
        userId: userId(req),
        name: (name || "Untitled Project").trim(),
        html: html || "",
        messages: (messages || []) as any,
      })
      .returning();
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a project
router.put("/landing-page/projects/:id", async (req: Request, res: Response) => {
  const { name, html, messages } = req.body as {
    name?: string;
    html?: string;
    messages?: unknown[];
  };
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim() || "Untitled Project";
    if (html !== undefined) updates.html = html;
    if (messages !== undefined) updates.messages = messages;

    const [project] = await db
      .update(landingPageProjectsTable)
      .set(updates as any)
      .where(
        and(
          eq(landingPageProjectsTable.id, Number(req.params.id)),
          eq(landingPageProjectsTable.userId, userId(req))
        )
      )
      .returning({
        id: landingPageProjectsTable.id,
        name: landingPageProjectsTable.name,
        updatedAt: landingPageProjectsTable.updatedAt,
      });
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a project
router.delete("/landing-page/projects/:id", async (req: Request, res: Response) => {
  try {
    await db
      .delete(landingPageProjectsTable)
      .where(
        and(
          eq(landingPageProjectsTable.id, Number(req.params.id)),
          eq(landingPageProjectsTable.userId, userId(req))
        )
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
