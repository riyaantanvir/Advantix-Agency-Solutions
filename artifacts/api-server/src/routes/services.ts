import { Router, type IRouter } from "express";
import { db, servicesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/services", async (_req, res) => {
  const items = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.isActive, true))
    .orderBy(asc(servicesTable.order), asc(servicesTable.id));
  res.json(items);
});

router.get("/services/all", requireAdmin, async (_req, res) => {
  const items = await db
    .select()
    .from(servicesTable)
    .orderBy(asc(servicesTable.order), asc(servicesTable.id));
  res.json(items);
});

router.post("/services", requireAdmin, async (req, res) => {
  const { name, icon, description, details, order, isActive } = req.body as {
    name?: string;
    icon?: string;
    description?: string;
    details?: string;
    order?: number;
    isActive?: boolean;
  };

  if (!name || !description) {
    res.status(400).json({ error: "Name and description are required" });
    return;
  }

  const [item] = await db
    .insert(servicesTable)
    .values({
      name,
      icon: icon ?? "Briefcase",
      description,
      details: details ?? null,
      order: order ?? 0,
      isActive: isActive ?? true,
    })
    .returning();

  res.status(201).json(item);
});

router.put("/services/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { name, icon, description, details, order, isActive } = req.body as {
    name?: string;
    icon?: string;
    description?: string;
    details?: string;
    order?: number;
    isActive?: boolean;
  };

  if (!name || !description) {
    res.status(400).json({ error: "Name and description are required" });
    return;
  }

  const [updated] = await db
    .update(servicesTable)
    .set({
      name,
      icon: icon ?? "Briefcase",
      description,
      details: details ?? null,
      order: order ?? 0,
      isActive: isActive ?? true,
    })
    .where(eq(servicesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json(updated);
});

router.delete("/services/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(servicesTable).where(eq(servicesTable.id, id));
  res.json({ message: "Deleted" });
});

export default router;
