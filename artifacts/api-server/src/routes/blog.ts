import { Router, type IRouter } from "express";
import { db, blogPostsTable } from "@workspace/db";
import { eq, desc, and, ne, or, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsDir = path.resolve(__dirname, "../../../uploads/blog");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) { cb(null, uploadsDir); },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    const safe = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

const router: IRouter = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function estimateReadingTime(content: string): string {
  const words = content.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

/* ── Public Routes ──────────────────────────────────────── */
router.get("/blog", async (_req, res) => {
  const posts = await db
    .select()
    .from(blogPostsTable)
    .where(eq(blogPostsTable.status, "published"))
    .orderBy(desc(blogPostsTable.publishedAt));
  res.json(posts);
});

router.get("/blog/:slug", async (req, res) => {
  const [post] = await db
    .select()
    .from(blogPostsTable)
    .where(and(eq(blogPostsTable.slug, req.params.slug!), eq(blogPostsTable.status, "published")));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(post);
});

/* POST /api/blog/:slug/view — fire-and-forget view counter */
router.post("/blog/:slug/view", async (req, res) => {
  res.json({ ok: true });
  db.execute(sql`
    UPDATE blog_posts SET views = views + 1
    WHERE slug = ${req.params.slug!} AND status = 'published'
  `).catch(() => {});
});

/* POST /api/blog/:slug/like — toggle like */
router.post("/blog/:slug/like", async (req, res) => {
  const { action } = req.body as { action?: "like" | "unlike" };
  if (action !== "like" && action !== "unlike") {
    res.status(400).json({ error: "action must be 'like' or 'unlike'" }); return;
  }
  const delta = action === "like" ? 1 : -1;
  const result = await db.execute(sql`
    UPDATE blog_posts
    SET likes = GREATEST(0, likes + ${delta})
    WHERE slug = ${req.params.slug!} AND status = 'published'
    RETURNING likes
  `);
  const row = result.rows[0] as { likes: number } | undefined;
  res.json({ likes: row?.likes ?? 0 });
});

/* GET /api/blog/:slug/related — same category, exclude self, limit 3 */
router.get("/blog/:slug/related", async (req, res) => {
  const [post] = await db
    .select({ id: blogPostsTable.id, category: blogPostsTable.category, tags: blogPostsTable.tags })
    .from(blogPostsTable)
    .where(and(eq(blogPostsTable.slug, req.params.slug!), eq(blogPostsTable.status, "published")));

  if (!post) { res.json([]); return; }

  const related = await db
    .select({
      id: blogPostsTable.id, title: blogPostsTable.title, slug: blogPostsTable.slug,
      excerpt: blogPostsTable.excerpt, coverImageUrl: blogPostsTable.coverImageUrl,
      author: blogPostsTable.author, category: blogPostsTable.category,
      readingTime: blogPostsTable.readingTime, publishedAt: blogPostsTable.publishedAt,
      views: blogPostsTable.views,
    })
    .from(blogPostsTable)
    .where(and(
      eq(blogPostsTable.status, "published"),
      ne(blogPostsTable.id, post.id),
      eq(blogPostsTable.category, post.category),
    ))
    .orderBy(desc(blogPostsTable.publishedAt))
    .limit(3);

  res.json(related);
});

/* ── Admin Routes ───────────────────────────────────────── */
router.get("/admin/blog", requireAdmin, async (_req, res) => {
  const posts = await db
    .select()
    .from(blogPostsTable)
    .orderBy(desc(blogPostsTable.createdAt));
  res.json(posts);
});

router.get("/admin/blog/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(post);
});

router.post("/admin/blog/upload-image", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const url = `/uploads/blog/${req.file.filename}`;
  res.json({ url });
});

router.post("/admin/blog", requireAdmin, async (req, res) => {
  const { title, excerpt, content, coverImageUrl, author, category, tags, status, seoTitle, seoDescription, featured } = req.body as {
    title?: string; excerpt?: string; content?: string; coverImageUrl?: string;
    author?: string; category?: string; tags?: string; status?: string;
    seoTitle?: string; seoDescription?: string; featured?: boolean;
  };

  if (!title) { res.status(400).json({ error: "Title is required" }); return; }

  const baseSlug = slugify(title);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const existing = await db.select({ id: blogPostsTable.id }).from(blogPostsTable).where(eq(blogPostsTable.slug, slug));
    if (!existing.length) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const safeStatus = status === "published" ? "published" : "draft";
  const [post] = await db.insert(blogPostsTable).values({
    title,
    slug,
    excerpt: excerpt ?? null,
    content: content ?? "",
    coverImageUrl: coverImageUrl ?? null,
    author: author ?? "Advantix Team",
    category: category ?? "General",
    tags: tags ?? null,
    status: safeStatus,
    readingTime: estimateReadingTime(content ?? ""),
    seoTitle: seoTitle ?? null,
    seoDescription: seoDescription ?? null,
    featured: Boolean(featured),
    publishedAt: safeStatus === "published" ? new Date() : null,
  }).returning();

  res.status(201).json(post);
});

router.put("/admin/blog/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { title, excerpt, content, coverImageUrl, author, category, tags, status, seoTitle, seoDescription, featured } = req.body as {
    title?: string; excerpt?: string; content?: string; coverImageUrl?: string;
    author?: string; category?: string; tags?: string; status?: string;
    seoTitle?: string; seoDescription?: string; featured?: boolean;
  };

  if (!title) { res.status(400).json({ error: "Title is required" }); return; }

  const [existing] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

  const safeStatus = status === "published" ? "published" : "draft";
  const wasPublished = existing.status === "published";
  const nowPublished = safeStatus === "published";

  const [updated] = await db.update(blogPostsTable).set({
    title,
    excerpt: excerpt ?? null,
    content: content ?? "",
    coverImageUrl: coverImageUrl ?? null,
    author: author ?? "Advantix Team",
    category: category ?? "General",
    tags: tags ?? null,
    status: safeStatus,
    readingTime: estimateReadingTime(content ?? ""),
    seoTitle: seoTitle ?? null,
    seoDescription: seoDescription ?? null,
    featured: Boolean(featured),
    publishedAt: nowPublished ? (wasPublished ? existing.publishedAt : new Date()) : null,
    updatedAt: new Date(),
  }).where(eq(blogPostsTable.id, id)).returning();

  res.json(updated);
});

router.delete("/admin/blog/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
  res.json({ message: "Deleted" });
});

export default router;
