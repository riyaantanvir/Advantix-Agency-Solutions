import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SIDECAR = "http://127.0.0.1:1106";

/* ── Storage backend detection ───────────────────────────────────────────── */
// Replit mode: PRIVATE_OBJECT_DIR is set (Replit Object Storage via sidecar)
// S3 mode: S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY are set (DO Spaces / AWS S3)

function isReplitStorage(): boolean {
  return !!process.env.PRIVATE_OBJECT_DIR;
}

function getS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!endpoint, // required for DO Spaces / non-AWS endpoints
  });
}

/* ── Replit sidecar helpers ──────────────────────────────────────────────── */
function parseStorageDir(): { bucketName: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("Object storage not configured");
  const clean = dir.startsWith("gs://") ? dir.slice(5) : dir.replace(/^\//, "");
  const parts = clean.split("/").filter(Boolean);
  if (!parts[0]) throw new Error("Object storage not configured");
  return { bucketName: parts[0], prefix: parts.slice(1).join("/") };
}

async function getSidecarSignedUrl(objectName: string, method: "GET" | "PUT"): Promise<string> {
  const { bucketName } = parseStorageDir();
  const body = { bucket_name: bucketName, object_name: objectName, method, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() };
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sidecar error: ${res.status} — body: ${text}`);
  }
  const { signed_url } = await res.json() as { signed_url: string };
  return signed_url;
}

/* ── Unified upload & signed GET ─────────────────────────────────────────── */
async function uploadImage(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName) || ".jpg";
  const filename = `gallery/${randomUUID()}${ext}`;

  if (isReplitStorage()) {
    // Replit Object Storage path
    const { prefix } = parseStorageDir();
    const objectName = [prefix, filename].filter(Boolean).join("/");
    const putUrl = await getSidecarSignedUrl(objectName, "PUT");
    const uploadRes = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": mimetype },
      body: buffer,
      signal: AbortSignal.timeout(60_000),
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
    return `/api/gallery-img/${objectName}`;
  } else {
    // S3-compatible path (DO Spaces, AWS S3, etc.)
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("No storage configured — set PRIVATE_OBJECT_DIR (Replit) or S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY");
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: filename, Body: buffer, ContentType: mimetype }));
    // Return a path our serving route can resolve to a signed URL
    return `/api/gallery-img/${filename}`;
  }
}

async function getSignedReadUrl(objectName: string): Promise<string> {
  if (isReplitStorage()) {
    const { prefix } = parseStorageDir();
    const fullName = prefix && !objectName.startsWith(`${prefix}/`) ? `${prefix}/${objectName}` : objectName;
    return getSidecarSignedUrl(fullName, "GET");
  } else {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("No storage configured");
    const s3 = getS3Client();
    return s3GetSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: objectName }), { expiresIn: 3600 });
  }
}

/* ── Public image serving — redirect via signed URL ──────────────────────── */
router.get("/gallery-img/{*filePath}", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    if (!filePath) { res.status(400).json({ error: "Missing path" }); return; }
    const signedUrl = await getSignedReadUrl(filePath);
    res.redirect(302, signedUrl);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to serve image" });
  }
});

/* ── Public page fetch ───────────────────────────────────────────────────── */
router.get("/pages/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const session = req.session as { adminId?: number; toolUserId?: number };
  const isAdmin = !!session?.adminId;
  const userId = session?.toolUserId ?? null;

  // Must be logged in (or admin) to view any custom page
  if (!isAdmin && !userId) {
    // Return minimal page info so the frontend can show the login gate with the page title
    const peek = await db.execute(sql`SELECT title, slug FROM custom_pages WHERE slug = ${slug} AND is_published = true LIMIT 1`);
    const p = peek.rows[0] as Record<string, unknown> | undefined;
    if (!p) { res.status(404).json({ error: "Page not found" }); return; }
    res.status(401).json({ requiresLogin: true, title: p.title, slug: p.slug });
    return;
  }

  const rows = await db.execute(
    isAdmin
      ? sql`SELECT * FROM custom_pages WHERE slug = ${slug} LIMIT 1`
      : sql`SELECT * FROM custom_pages WHERE slug = ${slug} AND is_published = true LIMIT 1`
  );
  const page = rows.rows[0] as Record<string, unknown> | undefined;
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }

  if (page.password_hash) {
    const provided = (req.query.pw as string) || "";
    const valid = provided ? await bcrypt.compare(provided, page.password_hash as string) : false;
    if (!valid) {
      res.json({ id: page.id, slug: page.slug, title: page.title, type: page.type, requiresPassword: true });
      return;
    }
  }

  const pageData = { ...page, password_hash: undefined };

  if (page.type === "gallery") {
    const foldersRes = await db.execute(sql`
      SELECT * FROM gallery_folders WHERE page_id = ${page.id as number} ORDER BY sort_order, id
    `);
    const folders = await Promise.all(
      (foldersRes.rows as Array<Record<string, unknown>>).map(async (folder) => {
        const imagesRes = await db.execute(sql`
          SELECT * FROM gallery_images WHERE folder_id = ${folder.id as number} ORDER BY sort_order, id
        `);
        return { ...folder, images: imagesRes.rows };
      })
    );
    res.json({ ...pageData, folders });
  } else {
    res.json(pageData);
  }
});

router.post("/pages/:slug/verify", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { password } = req.body as { password?: string };
  if (!password) { res.status(400).json({ error: "Password required" }); return; }

  const session = req.session as { adminId?: number };
  const isAdmin = !!session?.adminId;
  const rows = await db.execute(
    isAdmin
      ? sql`SELECT * FROM custom_pages WHERE slug = ${slug} LIMIT 1`
      : sql`SELECT * FROM custom_pages WHERE slug = ${slug} AND is_published = true LIMIT 1`
  );
  const page = rows.rows[0] as Record<string, unknown> | undefined;
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }

  const valid = await bcrypt.compare(password, (page.password_hash as string) || "");
  if (!valid) { res.status(401).json({ error: "Incorrect password" }); return; }

  const pageData = { ...page, password_hash: undefined };
  if (page.type === "gallery") {
    const foldersRes = await db.execute(sql`
      SELECT * FROM gallery_folders WHERE page_id = ${page.id as number} ORDER BY sort_order, id
    `);
    const folders = await Promise.all(
      (foldersRes.rows as Array<Record<string, unknown>>).map(async (folder) => {
        const imagesRes = await db.execute(sql`
          SELECT * FROM gallery_images WHERE folder_id = ${folder.id as number} ORDER BY sort_order, id
        `);
        return { ...folder, images: imagesRes.rows };
      })
    );
    res.json({ ...pageData, folders });
  } else {
    res.json(pageData);
  }
});

/* ── Admin: Pages CRUD ─────────────────────────────────────────────────── */
router.get("/admin/custom-pages", requireAdmin, async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM custom_pages ORDER BY created_at DESC`);
  res.json(rows.rows);
});

router.post("/admin/custom-pages", requireAdmin, async (req, res) => {
  const { title, slug, type, description, content, password, isPublished, metaTitle, metaDescription } =
    req.body as {
      title: string; slug: string; type: string; description?: string; content?: string;
      password?: string; isPublished?: boolean; metaTitle?: string; metaDescription?: string;
    };

  if (!title || !slug) { res.status(400).json({ error: "Title and slug required" }); return; }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const rows = await db.execute(sql`
    INSERT INTO custom_pages (slug, title, type, description, content, password_hash, is_published, meta_title, meta_description)
    VALUES (${cleanSlug}, ${title}, ${type || "content"}, ${description || null}, ${content || ""}, ${passwordHash}, ${isPublished ?? false}, ${metaTitle || null}, ${metaDescription || null})
    RETURNING *
  `);
  res.status(201).json(rows.rows[0]);
});

router.get("/admin/custom-pages/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const rows = await db.execute(sql`SELECT * FROM custom_pages WHERE id = ${id} LIMIT 1`);
  const page = rows.rows[0] as Record<string, unknown> | undefined;
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }

  const foldersRes = await db.execute(sql`SELECT * FROM gallery_folders WHERE page_id = ${id} ORDER BY sort_order, id`);
  const folders = await Promise.all(
    (foldersRes.rows as Array<Record<string, unknown>>).map(async (folder) => {
      const imagesRes = await db.execute(sql`SELECT * FROM gallery_images WHERE folder_id = ${folder.id as number} ORDER BY sort_order, id`);
      return { ...folder, images: imagesRes.rows };
    })
  );
  res.json({ ...page, hasPassword: !!(page.password_hash), password_hash: undefined, folders });
});

router.put("/admin/custom-pages/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { title, slug, type, description, content, password, clearPassword, isPublished, metaTitle, metaDescription } =
    req.body as {
      title?: string; slug?: string; type?: string; description?: string; content?: string;
      password?: string; clearPassword?: boolean; isPublished?: boolean; metaTitle?: string; metaDescription?: string;
    };

  const cleanSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : undefined;

  if (clearPassword) {
    await db.execute(sql`UPDATE custom_pages SET password_hash = NULL WHERE id = ${id}`);
  } else if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(sql`UPDATE custom_pages SET password_hash = ${hash} WHERE id = ${id}`);
  }

  const rows = await db.execute(sql`
    UPDATE custom_pages SET
      title = COALESCE(${title || null}, title),
      slug = COALESCE(${cleanSlug || null}, slug),
      type = COALESCE(${type || null}, type),
      description = COALESCE(${description !== undefined ? description : null}, description),
      content = COALESCE(${content !== undefined ? content : null}, content),
      is_published = COALESCE(${isPublished !== undefined ? isPublished : null}, is_published),
      meta_title = COALESCE(${metaTitle || null}, meta_title),
      meta_description = COALESCE(${metaDescription || null}, meta_description),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  const page = rows.rows[0] as Record<string, unknown> | undefined;
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }
  res.json({ ...page, hasPassword: !!(page.password_hash), password_hash: undefined });
});

router.delete("/admin/custom-pages/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  await db.execute(sql`DELETE FROM custom_pages WHERE id = ${id}`);
  res.json({ ok: true });
});

/* ── Admin: Gallery Folders ─────────────────────────────────────────────── */
router.post("/admin/custom-pages/:id/folders", requireAdmin, async (req, res) => {
  const pageId = parseInt(req.params.id as string, 10);
  const { name, description, sortOrder } = req.body as { name: string; description?: string; sortOrder?: number };
  if (!name) { res.status(400).json({ error: "Name required" }); return; }

  const rows = await db.execute(sql`
    INSERT INTO gallery_folders (page_id, name, description, sort_order)
    VALUES (${pageId}, ${name}, ${description || null}, ${sortOrder ?? 0})
    RETURNING *
  `);
  res.status(201).json({ ...rows.rows[0], images: [] });
});

router.put("/admin/custom-pages/:id/folders/:folderId", requireAdmin, async (req, res) => {
  const folderId = parseInt(req.params.folderId as string, 10);
  const { name, description, coverImageUrl, sortOrder } = req.body as {
    name?: string; description?: string; coverImageUrl?: string; sortOrder?: number;
  };

  const rows = await db.execute(sql`
    UPDATE gallery_folders SET
      name = COALESCE(${name || null}, name),
      description = COALESCE(${description !== undefined ? description : null}, description),
      cover_image_url = COALESCE(${coverImageUrl !== undefined ? coverImageUrl : null}, cover_image_url),
      sort_order = COALESCE(${sortOrder !== undefined ? sortOrder : null}, sort_order)
    WHERE id = ${folderId}
    RETURNING *
  `);
  if (!rows.rows[0]) { res.status(404).json({ error: "Folder not found" }); return; }
  res.json(rows.rows[0]);
});

router.delete("/admin/custom-pages/:id/folders/:folderId", requireAdmin, async (req, res) => {
  const folderId = parseInt(req.params.folderId as string, 10);
  await db.execute(sql`DELETE FROM gallery_folders WHERE id = ${folderId}`);
  res.json({ ok: true });
});

/* ── Admin: Gallery Image Upload ────────────────────────────────────────── */
router.post(
  "/admin/custom-pages/:id/folders/:folderId/images",
  requireAdmin,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const folderId = parseInt(req.params.folderId as string, 10);
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    try {
      const url = await uploadImage(req.file.buffer, req.file.mimetype, req.file.originalname);
      const { caption } = req.body as { caption?: string };
      const maxOrderRes = await db.execute(sql`SELECT COALESCE(MAX(sort_order), -1) as max_order FROM gallery_images WHERE folder_id = ${folderId}`);
      const nextOrder = ((maxOrderRes.rows[0] as Record<string, unknown>).max_order as number) + 1;

      const rows = await db.execute(sql`
        INSERT INTO gallery_images (folder_id, url, caption, sort_order)
        VALUES (${folderId}, ${url}, ${caption || null}, ${nextOrder})
        RETURNING *
      `);
      res.status(201).json(rows.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" });
    }
  }
);

router.put("/admin/custom-pages/:id/folders/:folderId/images/:imageId", requireAdmin, async (req, res) => {
  const imageId = parseInt(req.params.imageId as string, 10);
  const { caption, sortOrder } = req.body as { caption?: string; sortOrder?: number };
  const rows = await db.execute(sql`
    UPDATE gallery_images SET
      caption = COALESCE(${caption !== undefined ? caption : null}, caption),
      sort_order = COALESCE(${sortOrder !== undefined ? sortOrder : null}, sort_order)
    WHERE id = ${imageId} RETURNING *
  `);
  res.json(rows.rows[0]);
});

router.delete("/admin/custom-pages/:id/folders/:folderId/images/:imageId", requireAdmin, async (req, res) => {
  const imageId = parseInt(req.params.imageId as string, 10);
  await db.execute(sql`DELETE FROM gallery_images WHERE id = ${imageId}`);
  res.json({ ok: true });
});

/* ── Admin: Set folder cover from existing image ───────────────────────── */
router.post("/admin/custom-pages/:id/folders/:folderId/cover", requireAdmin, async (req, res) => {
  const folderId = parseInt(req.params.folderId as string, 10);
  const { imageUrl } = req.body as { imageUrl: string };
  await db.execute(sql`UPDATE gallery_folders SET cover_image_url = ${imageUrl} WHERE id = ${folderId}`);
  res.json({ ok: true });
});

/* ── User Favorites ──────────────────────────────────────────────────────── */

function requireToolUser(req: Request, res: Response): number | null {
  const session = req.session as { toolUserId?: number };
  if (!session.toolUserId) { res.status(401).json({ error: "Login required" }); return null; }
  return session.toolUserId;
}

// Toggle favorite for an image (add or remove)
router.post("/favorites/images/:imageId", async (req: Request, res: Response) => {
  const userId = requireToolUser(req, res);
  if (!userId) return;
  const imageId = parseInt(req.params.imageId as string, 10);
  if (!imageId) { res.status(400).json({ error: "Invalid image id" }); return; }

  const existing = await db.execute(sql`
    SELECT id FROM page_image_favorites WHERE user_id = ${userId} AND image_id = ${imageId} LIMIT 1
  `);

  if (existing.rows.length > 0) {
    await db.execute(sql`DELETE FROM page_image_favorites WHERE user_id = ${userId} AND image_id = ${imageId}`);
    res.json({ favorited: false });
  } else {
    await db.execute(sql`INSERT INTO page_image_favorites (user_id, image_id) VALUES (${userId}, ${imageId}) ON CONFLICT DO NOTHING`);
    res.json({ favorited: true });
  }
});

// Get favorited image IDs for a specific page (for overlay state)
router.get("/favorites/images/page/:pageId", async (req: Request, res: Response) => {
  const userId = requireToolUser(req, res);
  if (!userId) return;
  const pageId = parseInt(req.params.pageId as string, 10);

  const rows = await db.execute(sql`
    SELECT pif.image_id FROM page_image_favorites pif
    JOIN gallery_images gi ON gi.id = pif.image_id
    JOIN gallery_folders gf ON gf.id = gi.folder_id
    WHERE pif.user_id = ${userId} AND gf.page_id = ${pageId}
  `);
  res.json((rows.rows as Array<Record<string, unknown>>).map(r => r.image_id));
});

// Get all favorites for the user's dashboard (full image + page info)
router.get("/favorites/images", async (req: Request, res: Response) => {
  const userId = requireToolUser(req, res);
  if (!userId) return;

  const rows = await db.execute(sql`
    SELECT
      gi.id AS image_id,
      gi.url,
      gi.caption,
      gf.name AS folder_name,
      cp.id AS page_id,
      cp.title AS page_title,
      cp.slug AS page_slug,
      pif.created_at AS favorited_at
    FROM page_image_favorites pif
    JOIN gallery_images gi ON gi.id = pif.image_id
    JOIN gallery_folders gf ON gf.id = gi.folder_id
    JOIN custom_pages cp ON cp.id = gf.page_id
    WHERE pif.user_id = ${userId}
    ORDER BY pif.created_at DESC
  `);
  res.json(rows.rows);
});

export default router;
