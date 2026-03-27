import { Router, type IRouter } from "express";
import { db, portfolioItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/portfolio", async (_req, res) => {
  const items = await db.select().from(portfolioItemsTable).orderBy(desc(portfolioItemsTable.createdAt));
  res.json(items);
});

router.post("/portfolio", requireAdmin, async (req, res) => {
  const { title, category, description, imageUrl, videoUrl, clientName } = req.body as {
    title?: string;
    category?: string;
    description?: string;
    imageUrl?: string;
    videoUrl?: string;
    clientName?: string;
  };

  if (!title || !category) {
    res.status(400).json({ error: "Title and category are required" });
    return;
  }

  const [item] = await db
    .insert(portfolioItemsTable)
    .values({
      title,
      category,
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      videoUrl: videoUrl ?? null,
      clientName: clientName ?? null,
    })
    .returning();

  res.status(201).json(item);
});

router.put("/portfolio/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { title, category, description, imageUrl, videoUrl, clientName } = req.body as {
    title?: string;
    category?: string;
    description?: string;
    imageUrl?: string;
    videoUrl?: string;
    clientName?: string;
  };

  if (!title || !category) {
    res.status(400).json({ error: "Title and category are required" });
    return;
  }

  const [updated] = await db
    .update(portfolioItemsTable)
    .set({
      title,
      category,
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      videoUrl: videoUrl ?? null,
      clientName: clientName ?? null,
    })
    .where(eq(portfolioItemsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Portfolio item not found" });
    return;
  }

  res.json(updated);
});

router.delete("/portfolio/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(portfolioItemsTable).where(eq(portfolioItemsTable.id, id));
  res.json({ message: "Deleted" });
});

export default router;
