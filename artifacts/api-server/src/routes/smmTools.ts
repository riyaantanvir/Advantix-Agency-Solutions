import { Router, Request, Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { smmScheduledPostsTable, smmUserKeysTable, pageEventsTable } from "@workspace/db/schema";
import { requireToolUser } from "../middleware/toolAuth.js";
import { schedulePost, cancelScheduledPost } from "../lib/smmPublisher.js";
import { fetchAllPlatforms } from "../lib/smmService.js";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── helpers ───────────────────────────────────────────────────────────────────

function getToolUserId(req: Request): number {
  return (req.session as any).toolUserId as number;
}

async function getUserKeys(toolUserId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(smmUserKeysTable).where(eq(smmUserKeysTable.toolUserId, toolUserId));
  return Object.fromEntries(rows.filter(r => r.keyValue).map(r => [r.keyName, r.keyValue!]));
}

// ── image upload ──────────────────────────────────────────────────────────────

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
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
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
    const uploadRes = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mimetype }, body: buffer, signal: AbortSignal.timeout(60_000) });
    if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);
    return `/api/gallery-img/${objectName}`;
  } else {
    const result = await db.execute(sql`INSERT INTO gallery_image_blobs (data, mime_type) VALUES (${buffer}, ${mimetype}) RETURNING id`);
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

// ── GET /api/tools/smm/settings ───────────────────────────────────────────────

router.get("/tools/smm/settings", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const rows = await db.select().from(smmUserKeysTable).where(eq(smmUserKeysTable.toolUserId, toolUserId));
  // Return keys but mask values (except show last 6 chars so user can verify)
  const settings = Object.fromEntries(rows.map(r => [r.keyName, r.keyValue ? `••••${r.keyValue.slice(-6)}` : ""]));
  res.json({ settings, connected: rows.filter(r => r.keyValue).map(r => r.keyName) });
});

// ── PUT /api/tools/smm/settings ───────────────────────────────────────────────

router.put("/tools/smm/settings", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const body = req.body as Record<string, string>;
  const validKeys = [
    "SMM_META_ACCESS_TOKEN", "SMM_META_PAGE_ID", "SMM_META_IG_USER_ID",
    "SMM_TWITTER_BEARER_TOKEN", "SMM_TWITTER_USER_ID",
    "SMM_LINKEDIN_ACCESS_TOKEN", "SMM_LINKEDIN_ORG_ID",
    "SMM_YOUTUBE_API_KEY", "SMM_YOUTUBE_CHANNEL_ID",
    "SMM_PINTEREST_ACCESS_TOKEN",
  ];
  for (const [key, value] of Object.entries(body)) {
    if (!validKeys.includes(key)) continue;
    // Skip if value looks like our masked value (starts with ••••)
    if (value.startsWith("••••")) continue;
    if (value.trim() === "") {
      // Delete the key
      await db.delete(smmUserKeysTable).where(and(eq(smmUserKeysTable.toolUserId, toolUserId), eq(smmUserKeysTable.keyName, key)));
    } else {
      // Upsert
      await db.insert(smmUserKeysTable).values({ toolUserId, keyName: key, keyValue: value.trim() })
        .onConflictDoUpdate({ target: [smmUserKeysTable.toolUserId, smmUserKeysTable.keyName], set: { keyValue: value.trim(), updatedAt: new Date() } });
    }
  }
  res.json({ success: true });
});

// ── POST /api/tools/smm/test ──────────────────────────────────────────────────

router.post("/tools/smm/test", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const { platform } = req.body as { platform: string };
  if (!platform) { res.status(400).json({ ok: false, message: "platform is required" }); return; }

  const keys = await getUserKeys(toolUserId);

  try {
    switch (platform) {
      case "facebook": {
        if (!keys.SMM_META_ACCESS_TOKEN || !keys.SMM_META_PAGE_ID) {
          res.json({ ok: false, message: "Missing Page Access Token or Page ID" }); return;
        }
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${keys.SMM_META_PAGE_ID}?fields=name,id&access_token=${keys.SMM_META_ACCESS_TOKEN}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (d.error) { res.json({ ok: false, message: d.error.message }); return; }
        res.json({ ok: true, message: `Connected as: ${d.name} (ID: ${d.id})` });
        break;
      }
      case "instagram": {
        if (!keys.SMM_META_ACCESS_TOKEN || !keys.SMM_META_IG_USER_ID) {
          res.json({ ok: false, message: "Missing Access Token or Instagram User ID" }); return;
        }
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${keys.SMM_META_IG_USER_ID}?fields=username,id&access_token=${keys.SMM_META_ACCESS_TOKEN}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (d.error) { res.json({ ok: false, message: d.error.message }); return; }
        res.json({ ok: true, message: `Connected as: @${d.username} (ID: ${d.id})` });
        break;
      }
      case "twitter": {
        if (!keys.SMM_TWITTER_BEARER_TOKEN || !keys.SMM_TWITTER_USER_ID) {
          res.json({ ok: false, message: "Missing Bearer Token or User ID" }); return;
        }
        const r = await fetch(
          `https://api.twitter.com/2/users/${keys.SMM_TWITTER_USER_ID}?user.fields=username,name`,
          { headers: { Authorization: `Bearer ${keys.SMM_TWITTER_BEARER_TOKEN}` }, signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (d.errors || !d.data) { res.json({ ok: false, message: d.errors?.[0]?.detail ?? "Invalid credentials" }); return; }
        res.json({ ok: true, message: `Connected as: @${d.data.username} (${d.data.name})` });
        break;
      }
      case "linkedin": {
        if (!keys.SMM_LINKEDIN_ACCESS_TOKEN) {
          res.json({ ok: false, message: "Missing Access Token" }); return;
        }
        const r = await fetch(
          keys.SMM_LINKEDIN_ORG_ID
            ? `https://api.linkedin.com/v2/organizations/${keys.SMM_LINKEDIN_ORG_ID}`
            : `https://api.linkedin.com/v2/me`,
          { headers: { Authorization: `Bearer ${keys.SMM_LINKEDIN_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (d.status === 401 || d.status === 403) { res.json({ ok: false, message: "Invalid or expired access token" }); return; }
        const name = d.localizedName ?? `${d.localizedFirstName ?? ""} ${d.localizedLastName ?? ""}`.trim();
        res.json({ ok: true, message: `Connected as: ${name || "LinkedIn Profile"}` });
        break;
      }
      case "youtube": {
        if (!keys.SMM_YOUTUBE_API_KEY || !keys.SMM_YOUTUBE_CHANNEL_ID) {
          res.json({ ok: false, message: "Missing API Key or Channel ID" }); return;
        }
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${keys.SMM_YOUTUBE_CHANNEL_ID}&key=${keys.SMM_YOUTUBE_API_KEY}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (d.error) { res.json({ ok: false, message: d.error.message }); return; }
        const ch = d.items?.[0];
        if (!ch) { res.json({ ok: false, message: "Channel not found" }); return; }
        res.json({ ok: true, message: `Connected as: ${ch.snippet?.title}` });
        break;
      }
      case "pinterest": {
        if (!keys.SMM_PINTEREST_ACCESS_TOKEN) {
          res.json({ ok: false, message: "Missing Access Token" }); return;
        }
        const r = await fetch(
          "https://api.pinterest.com/v5/user_account",
          { headers: { Authorization: `Bearer ${keys.SMM_PINTEREST_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10000) }
        );
        const d = await r.json();
        if (r.status === 401) { res.json({ ok: false, message: "Invalid or expired access token" }); return; }
        res.json({ ok: true, message: `Connected as: @${d.username}` });
        break;
      }
      default:
        res.json({ ok: false, message: "Unknown platform" });
    }
  } catch (err: any) {
    if (err?.name === "TimeoutError") { res.json({ ok: false, message: "Request timed out — check your credentials" }); return; }
    req.log.error({ err }, "SMM test connection failed");
    res.json({ ok: false, message: "Connection failed — check your credentials" });
  }
});

// ── GET /api/tools/smm/platforms ──────────────────────────────────────────────

router.get("/tools/smm/platforms", requireToolUser, async (req: Request, res: Response) => {
  const notConnected = { connected: false as const };
  try {
    const toolUserId = getToolUserId(req);
    const keys = await getUserKeys(toolUserId);
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
      .where(sql.raw(`event_type = 'pageview' AND created_at >= NOW() - INTERVAL '30 days' AND referrer IS NOT NULL
          AND (referrer ILIKE '%instagram%' OR referrer ILIKE '%facebook%'
            OR referrer ILIKE '%t.co%' OR referrer ILIKE '%twitter.com%' OR referrer ILIKE '%x.com%'
            OR referrer ILIKE '%linkedin%' OR referrer ILIKE '%youtube%' OR referrer ILIKE '%pinterest%')`))
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

router.get("/tools/smm/scheduled", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  try {
    const rows = await db.select().from(smmScheduledPostsTable)
      .where(eq(smmScheduledPostsTable.toolUserId, toolUserId))
      .orderBy(desc(smmScheduledPostsTable.scheduledAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Tools SMM scheduled posts fetch failed");
    res.json([]);
  }
});

// ── POST /api/tools/smm/scheduled ────────────────────────────────────────────

router.post("/tools/smm/scheduled", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const session = req.session as any;
  const { platforms, content, imageUrl, scheduledAt } = req.body as { platforms: string[]; content: string; imageUrl?: string; scheduledAt: string };
  if (!platforms?.length || !content?.trim() || !scheduledAt) {
    res.status(400).json({ error: "platforms, content, and scheduledAt are required" }); return;
  }
  const [row] = await db.insert(smmScheduledPostsTable).values({
    platforms: platforms.join(","),
    content: content.trim(),
    imageUrl: imageUrl || null,
    scheduledAt: new Date(scheduledAt),
    toolUserId,
    createdBy: session.toolUserName ?? session.toolUserEmail ?? "user",
  }).returning();
  schedulePost(row);
  res.json(row);
});

// ── DELETE /api/tools/smm/scheduled/:id ──────────────────────────────────────

router.delete("/tools/smm/scheduled/:id", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const id = parseInt(req.params.id);
  cancelScheduledPost(id);
  await db.delete(smmScheduledPostsTable).where(and(eq(smmScheduledPostsTable.id, id), eq(smmScheduledPostsTable.toolUserId, toolUserId)));
  res.json({ success: true });
});

// ── PATCH /api/tools/smm/scheduled/:id/cancel ────────────────────────────────

router.patch("/tools/smm/scheduled/:id/cancel", requireToolUser, async (req: Request, res: Response) => {
  const toolUserId = getToolUserId(req);
  const id = parseInt(req.params.id);
  cancelScheduledPost(id);
  const [row] = await db.update(smmScheduledPostsTable)
    .set({ status: "cancelled" })
    .where(and(eq(smmScheduledPostsTable.id, id), eq(smmScheduledPostsTable.toolUserId, toolUserId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
