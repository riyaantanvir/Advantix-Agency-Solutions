import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";

const router = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session?.adminId) {
    res.status(401).json({ error: "Admin required" });
    return;
  }
  next();
}

function maskValue(value: string): string {
  if (!value || value.length <= 8) return "••••••••";
  return "••••••••" + value.slice(-4);
}

router.get("/admin/integrations", requireAdmin, async (req: Request, res: Response) => {
  const rows = await db.select().from(integrationsTable).orderBy(integrationsTable.category, integrationsTable.label);
  res.json(rows.map(r => ({ ...r, value: maskValue(r.value), hasValue: !!r.value })));
});

router.post("/admin/integrations", requireAdmin, async (req: Request, res: Response) => {
  const { name, label, value, description, category } = req.body as {
    name: string; label: string; value: string; description?: string; category: string;
  };
  if (!name?.trim() || !label?.trim()) {
    res.status(400).json({ error: "Name and label are required" });
    return;
  }
  const [row] = await db.insert(integrationsTable)
    .values({ name: name.trim().toUpperCase().replace(/\s+/g, "_"), label: label.trim(), value: value ?? "", description, category })
    .returning();
  res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
});

router.put("/admin/integrations/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { label, value, description, category } = req.body as {
    label?: string; value?: string; description?: string; category?: string;
  };
  const updates: Partial<typeof integrationsTable.$inferInsert> = { updatedAt: new Date() };
  if (label !== undefined) updates.label = label;
  if (value !== undefined && value !== "") updates.value = value;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;

  const [row] = await db.update(integrationsTable).set(updates).where(eq(integrationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
});

router.delete("/admin/integrations/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.delete(integrationsTable).where(eq(integrationsTable.id, id));
  res.json({ success: true });
});

export default router;
