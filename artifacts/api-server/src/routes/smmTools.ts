import { Router, Request, Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { smmScheduledPostsTable, pageEventsTable } from "@workspace/db/schema";
import { requireToolUser } from "../middleware/toolAuth.js";
import { schedulePost, cancelScheduledPost } from "../lib/smmPublisher.js";
import { getSmmKeys, fetchAllPlatforms } from "../lib/smmService.js";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── image upload helpers ──────────────────────────────────────────────────────

function isReplitStorage(): boolean { return !!process.env.PRIVATE_OBJECT_DIR; }

function parseStorageDir(): { bucketName: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  const clean = dir.startsWith("gs://") ? dir.slice(5) : dir.replace(/^\//, "");
  const parts = clean.split("/").filter(Boolean);
  if (!parts[0]) throw new Error("Object storage not configured");
  return { bucketName: parts[0], prefix: parts.slice(1).join("/") };
}

async function getSidecarSignedUrl(objectName: string, method: "GET" | "PUT"): Promise<string> {
  const SIDECAR = "http://127.0.0.1:1106";
  const { bucketName } = parseStorageDir();
  const body = { bucket_name: bucketName, object_name: objectName, method, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() };
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sidecar error: ${res.status}`);
  const { signed_url } = await res.json() as { signed_url: string };
  return signed_url;
}

async function uploadSmmImage(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  if (isReplitStorage()) {
    const { prefix } = parseStorageDir();
    const ext = path.extname(originalName) || ".jpg";
    const objectName = [prefix, `smm/${randomUUID()}${ext}`].filter(Boolean).join("/");
    const putUrl = await getSidecarSignedUrl(objectName, "PUT");
    const uploadRes = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": mimetype },
      body: buffer,
      signal: AbortSignal.timeout(60_000),
    });
    if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);
    return `/api/gallery-img/${objectName}`;
  } else {
    const result = await db.execute(sql`
      INSERT INTO gallery_image_blobs (data, mime_type)
      VALUES (${buffer}, ${mimetype})
      RETURNING id
    `);
    const blobId = (result.rows[0] as Record<string, unknown>).id;
    return `/api/gallery-img/db/${blobId}`;
  }
}

// ── POST /api/tools/smm/upload ────────────────────────────────────────────────

router.post("/tools/smm/upload", requireToolUser, upload.single("image"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const url = await uploadSmmImage(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Tools SMM image upload failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── GET /api/tools/smm/platforms ──────────────────────────────────────────────

router.get("/tools/smm/platforms", requireToolUser, async (req: Request, res: Response) => {
  const notConnected = { connected: false as const };
  try {
    const keys = await getSmmKeys();
    const platforms = await fetchAllPlatforms(keys);
    res.json(platforms);
  } catch (err) {
    req.log.error({ err }, "Tools SMM platforms fetch failed");
    res.json({ facebook: notConnected, instagram: notConnected, twitter: notConnected, linkedin: notConnected, youtube: notConnected, pinterest: notConnected });
  }
});

// ── GET /api/tools/smm/traffic ────────────────────────────────────────────────

router.get("/tools/smm/traffic", requireToolUser, async (req: Request, res: Response) => {
  const emptyTraffic = { platforms: { instagram: 0, facebook: 0, twitter: 0, linkedin: 0, youtube: 0, pinterest: 0 }, total: 0 };
  try {
    const rows = await db
      .select({ referrer: pageEventsTable.referrer, count: sql<number>`count(*)`.as("count") })
      .from(pageEventsTable)
      .where(
        sql.raw(`event_type = 'pageview' AND created_at >= NOW() - INTERVAL '30 days' AND referrer IS NOT NULL
            AND (referrer ILIKE '%instagram%' OR referrer ILIKE '%facebook%'
              OR referrer ILIKE '%t.co%' OR referrer ILIKE '%twitter.com%' OR referrer ILIKE '%x.com%'
              OR referrer ILIKE '%linkedin%' OR referrer ILIKE '%youtube%' OR referrer ILIKE '%pinterest%')`)
      )
      .groupBy(pageEventsTable.referrer)
      .orderBy(sql`count(*) DESC`)
      .limit(100);

    const platforms: Record<string, number> = { instagram: 0, facebook: 0, twitter: 0, linkedin: 0, youtube: 0, pinterest: 0 };
    for (const row of rows) {
      const ref = (row.referrer ?? "").toLowerCase();
      if (ref.includes("instagram")) platforms.instagram += Number(row.count);
      else if (ref.includes("facebook")) platforms.facebook += Number(row.count);
      else if (ref.includes("t.co") || ref.includes("twitter") || ref.includes("x.com")) platforms.twitter += Number(row.count);
      else if (ref.includes("linkedin")) platforms.linkedin += Number(row.count);
      else if (ref.includes("youtube")) platforms.youtube += Number(row.count);
      else if (ref.includes("pinterest")) platforms.pinterest += Number(row.count);
    }
    res.json({ platforms, total: Object.values(platforms).reduce((a, b) => a + b, 0) });
  } catch (err) {
    req.log.error({ err }, "Tools SMM traffic fetch failed");
    res.json(emptyTraffic);
  }
});

// ── GET /api/tools/smm/scheduled ─────────────────────────────────────────────

router.get("/tools/smm/scheduled", requireToolUser, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(smmScheduledPostsTable)
      .orderBy(desc(smmScheduledPostsTable.scheduledAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    _req.log.error({ err }, "Tools SMM scheduled posts fetch failed");
    res.json([]);
  }
});

// ── POST /api/tools/smm/scheduled ────────────────────────────────────────────

router.post("/tools/smm/scheduled", requireToolUser, async (req: Request, res: Response) => {
  const session = req.session as any;
  const { platforms, content, imageUrl, scheduledAt } = req.body as {
    platforms: string[]; content: string; imageUrl?: string; scheduledAt: string;
  };
  if (!platforms?.length || !content?.trim() || !scheduledAt) {
    res.status(400).json({ error: "platforms, content, and scheduledAt are required" });
    return;
  }
  const [row] = await db.insert(smmScheduledPostsTable).values({
    platforms: platforms.join(","),
    content: content.trim(),
    imageUrl: imageUrl || null,
    scheduledAt: new Date(scheduledAt),
    createdBy: session.toolUserName ?? session.toolUserEmail ?? "user",
  }).returning();
  schedulePost(row);
  res.json(row);
});

// ── DELETE /api/tools/smm/scheduled/:id ──────────────────────────────────────

router.delete("/tools/smm/scheduled/:id", requireToolUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  cancelScheduledPost(id);
  await db.delete(smmScheduledPostsTable).where(eq(smmScheduledPostsTable.id, id));
  res.json({ success: true });
});

// ── PATCH /api/tools/smm/scheduled/:id/cancel ────────────────────────────────

router.patch("/tools/smm/scheduled/:id/cancel", requireToolUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  cancelScheduledPost(id);
  const [row] = await db.update(smmScheduledPostsTable)
    .set({ status: "cancelled" })
    .where(eq(smmScheduledPostsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
