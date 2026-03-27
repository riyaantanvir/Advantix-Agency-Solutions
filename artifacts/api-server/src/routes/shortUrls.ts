import { Router } from "express";
import { db, shortUrlsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

function generateCode(len = 7): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    const [existing] = await db
      .select({ id: shortUrlsTable.id })
      .from(shortUrlsTable)
      .where(eq(shortUrlsTable.shortCode, code))
      .limit(1);
    if (!existing) return code;
  }
  return generateCode(9);
}

/* GET /api/tools/urls/resolve/:code — used by the SPA redirect page */
router.get("/tools/urls/resolve/:code", async (req, res) => {
  const code = String(req.params.code);
  const [url] = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.shortCode, code))
    .limit(1);

  if (!url) {
    res.status(404).json({ error: "Short URL not found" });
    return;
  }

  await db
    .update(shortUrlsTable)
    .set({ clicks: url.clicks + 1 })
    .where(eq(shortUrlsTable.id, url.id));

  res.json({ url: url.originalUrl, title: url.title });
});

/* GET /api/tools/urls — list user's URLs */
router.get("/tools/urls", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const urls = await db
    .select()
    .from(shortUrlsTable)
    .where(eq(shortUrlsTable.userId, session.toolUserId!));
  res.json(urls);
});

/* POST /api/tools/urls — create short URL */
router.post("/tools/urls", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const { originalUrl, title } = req.body;

  if (!originalUrl) {
    res.status(400).json({ error: "originalUrl is required" });
    return;
  }

  let normalized = originalUrl.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }

  try {
    new URL(normalized);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const shortCode = await uniqueCode();
  const [url] = await db
    .insert(shortUrlsTable)
    .values({
      shortCode,
      originalUrl: normalized,
      title: title?.trim() || null,
      userId: session.toolUserId!,
    })
    .returning();

  res.json(url);
});

/* PATCH /api/tools/urls/:id — update title */
router.patch("/tools/urls/:id", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const id = parseInt(String(req.params.id));
  const { title } = req.body;

  await db
    .update(shortUrlsTable)
    .set({ title: title?.trim() || null })
    .where(and(eq(shortUrlsTable.id, id), eq(shortUrlsTable.userId, session.toolUserId!)));

  res.json({ ok: true });
});

/* DELETE /api/tools/urls/:id */
router.delete("/tools/urls/:id", requireToolUser, async (req, res) => {
  const session = req.session as { toolUserId?: number };
  const id = parseInt(String(req.params.id));

  await db
    .delete(shortUrlsTable)
    .where(and(eq(shortUrlsTable.id, id), eq(shortUrlsTable.userId, session.toolUserId!)));

  res.json({ ok: true });
});

export default router;
