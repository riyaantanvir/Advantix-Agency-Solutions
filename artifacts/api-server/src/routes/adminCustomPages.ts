import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getGalleryBucket(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("Object storage not configured");
  if (dir.startsWith("gs://")) {
    const match = dir.match(/^gs:\/\/([^/]+)/);
    if (!match) throw new Error("Object storage not configured");
    return match[1];
  }
  // Format: /bucket-name/path  (Replit object storage path)
  const parts = dir.split("/").filter(Boolean);
  if (!parts[0]) throw new Error("Object storage not configured");
  return parts[0];
}

async function uploadToGCS(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  const bucketName = getGalleryBucket();
  const ext = path.extname(originalName) || ".jpg";
  const objectName = `gallery/${randomUUID()}${ext}`;
  const bucket = objectStorageClient.bucket(bucketName);
  const blob = bucket.file(objectName);
  await blob.save(buffer, { contentType: mimetype, resumable: false });
  return `/api/gallery-img/${objectName}`;
}

/* ── Public image serving ───────────────────────────────────────────────── */
router.get("/gallery-img/*filePath", async (req: Request, res: Response) => {
  try {
    const filePath = req.params.filePath as string;
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) { res.status(500).json({ error: "Storage not configured" }); return; }
    let bucketName: string;
    if (dir.startsWith("gs://")) {
      const match = dir.match(/^gs:\/\/([^/]+)/);
      if (!match) { res.status(500).json({ error: "Storage not configured" }); return; }
      bucketName = match[1];
    } else {
      bucketName = dir.split("/").filter(Boolean)[0];
    }
    if (!bucketName) { res.status(500).json({ error: "Storage not configured" }); return; }
    const bucket = objectStorageClient.bucket(bucketName);
    const blob = bucket.file(filePath);
    const [exists] = await blob.exists();
    if (!exists) { res.status(404).json({ error: "Image not found" }); return; }
    const [metadata] = await blob.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    blob.createReadStream().pipe(res);
  } catch {
    res.status(500).json({ error: "Failed to serve image" });
  }
});

/* ── Public page fetch ───────────────────────────────────────────────────── */
router.get("/pages/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const rows = await db.execute(sql`SELECT * FROM custom_pages WHERE slug = ${slug} AND is_published = true LIMIT 1`);
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

  const rows = await db.execute(sql`SELECT * FROM custom_pages WHERE slug = ${slug} AND is_published = true LIMIT 1`);
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
      const url = await uploadToGCS(req.file.buffer, req.file.mimetype, req.file.originalname);
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

export default router;
