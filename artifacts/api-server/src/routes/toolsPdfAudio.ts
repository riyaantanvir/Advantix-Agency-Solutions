import { Router } from "express";
import multer from "multer";
import { requireToolUser } from "../middleware/toolAuth.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@workspace/db";
import { toolPdfBooksTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();
const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// ── Clean OCR output ──────────────────────────────────────────────────────
function cleanOcrText(text: string): string {
  return text
    .replace(/\uFFFD/g, "")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── OCR-based PDF text extraction ─────────────────────────────────────────
// Uses pdftoppm to render pages → PNG, then Tesseract.js with Bengali language.
// This is the ONLY reliable way to get correct text from PDFs with custom/private
// font encodings (common in fan-digitized Bengali books).
const OCR_CONCURRENCY = 4;

async function extractTextFromBuffer(buffer: Buffer): Promise<{
  text: string;
  numPages: number;
}> {
  const { createWorker } = await import("tesseract.js");

  const tmpDir = join(tmpdir(), `pdf_ocr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Write PDF buffer to disk so pdftoppm can read it
    const pdfPath = join(tmpDir, "input.pdf");
    writeFileSync(pdfPath, buffer);

    // Convert all PDF pages to PNG images at 150 DPI
    const outputPrefix = join(tmpDir, "page");
    await execFileAsync("pdftoppm", [
      "-r", "150",
      "-png",
      pdfPath,
      outputPrefix,
    ]);

    // Collect all generated page images, sorted by page number
    const images = readdirSync(tmpDir)
      .filter((f: string) => f.endsWith(".png"))
      .sort();

    if (images.length === 0) {
      throw new Error("pdftoppm produced no images — PDF may be corrupted");
    }

    const numPages = images.length;
    const pageTexts: string[] = new Array(numPages).fill("");

    // OCR pages in parallel batches of OCR_CONCURRENCY
    for (let i = 0; i < images.length; i += OCR_CONCURRENCY) {
      const batch = images.slice(i, i + OCR_CONCURRENCY);
      await Promise.all(batch.map(async (imgFile: string, batchIdx: number) => {
        const pageIdx = i + batchIdx;
        const worker = await createWorker("ben", 1, {
          logger: () => {},
          errorHandler: () => {},
        } as any);
        try {
          const result = await worker.recognize(join(tmpDir, imgFile));
          pageTexts[pageIdx] = result.data.text ?? "";
        } finally {
          await worker.terminate();
        }
      }));
    }

    const rawText = pageTexts.join("\n\n");
    const cleaned = cleanOcrText(rawText);

    return { text: cleaned, numPages };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Helper: save book to DB ────────────────────────────────────────────────
async function upsertBook(
  userId: number,
  title: string,
  filename: string,
  text: string,
  numPages: number,
  totalLines: number,
): Promise<number> {
  const [book] = await db
    .insert(toolPdfBooksTable)
    .values({ userId, title, filename, text, numPages, totalLines, lastLine: 0 })
    .returning({ id: toolPdfBooksTable.id });
  return book.id;
}

// ── Upload PDF file ─────────────────────────────────────────────────────────
router.post("/tools/pdf/upload", requireToolUser, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No PDF file provided" });
      return;
    }

    const result = await extractTextFromBuffer(req.file.buffer);

    if (!result.text?.trim()) {
      res.status(422).json({ error: "Could not extract text from this PDF. It may be scanned/image-only." });
      return;
    }

    const title = req.file.originalname.replace(/\.pdf$/i, "");
    const lines = splitLines(result.text);
    const bookId = await upsertBook(
      (req.session as any).toolUserId as number,
      title,
      req.file.originalname,
      result.text,
      result.numPages,
      lines.length,
    );

    res.json({
      bookId,
      text: result.text,
      title,
      numPages: result.numPages,
      filename: req.file.originalname,
    });
  } catch (err: any) {
    console.error("[pdf/upload]", err.message);
    res.status(500).json({ error: err.message ?? "Failed to process PDF" });
  }
});

// ── Fetch PDF from URL ──────────────────────────────────────────────────────
router.post("/tools/pdf/from-url", requireToolUser, async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: "Only HTTP/HTTPS URLs are supported" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let fetchRes: Response;
    try {
      fetchRes = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AdvantixPDFReader/1.0)" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!fetchRes.ok) {
      res.status(422).json({ error: `Could not fetch PDF (HTTP ${fetchRes.status})` });
      return;
    }

    const contentType = fetchRes.headers.get("content-type") ?? "";
    if (!contentType.includes("pdf") && !url.toLowerCase().includes(".pdf")) {
      res.status(422).json({ error: "URL does not appear to be a PDF" });
      return;
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    if (arrayBuffer.byteLength > 30 * 1024 * 1024) {
      res.status(413).json({ error: "PDF is too large (max 30MB)" });
      return;
    }

    const buffer = Buffer.from(arrayBuffer);
    const result = await extractTextFromBuffer(buffer);

    if (!result.text?.trim()) {
      res.status(422).json({ error: "Could not extract text from this PDF. It may be scanned/image-only." });
      return;
    }

    const filename = parsedUrl.pathname.split("/").pop() ?? "document.pdf";
    const title = filename.replace(/\.pdf$/i, "");
    const lines = splitLines(result.text);
    const bookId = await upsertBook(
      (req.session as any).toolUserId as number,
      title,
      filename,
      result.text,
      result.numPages,
      lines.length,
    );

    res.json({
      bookId,
      text: result.text,
      title,
      numPages: result.numPages,
      filename,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      res.status(408).json({ error: "Request timed out fetching the PDF" });
    } else {
      console.error("[pdf/from-url]", err.message);
      res.status(500).json({ error: err.message ?? "Failed to process PDF" });
    }
  }
});

// ── List user's saved books ────────────────────────────────────────────────
router.get("/tools/pdf/books", requireToolUser, async (req, res) => {
  try {
    const userId = (req.session as any).toolUserId as number;
    const books = await db
      .select({
        id: toolPdfBooksTable.id,
        title: toolPdfBooksTable.title,
        filename: toolPdfBooksTable.filename,
        numPages: toolPdfBooksTable.numPages,
        totalLines: toolPdfBooksTable.totalLines,
        lastLine: toolPdfBooksTable.lastLine,
        createdAt: toolPdfBooksTable.createdAt,
      })
      .from(toolPdfBooksTable)
      .where(eq(toolPdfBooksTable.userId, userId))
      .orderBy(desc(toolPdfBooksTable.updatedAt));

    res.json(books);
  } catch (err: any) {
    console.error("[pdf/books]", err.message);
    res.status(500).json({ error: err.message ?? "Failed to fetch books" });
  }
});

// ── Get a single book (with text) ─────────────────────────────────────────
router.get("/tools/pdf/books/:id", requireToolUser, async (req, res) => {
  try {
    const userId = (req.session as any).toolUserId as number;
    const bookId = parseInt(req.params.id, 10);
    if (isNaN(bookId)) { res.status(400).json({ error: "Invalid book id" }); return; }

    const [book] = await db
      .select()
      .from(toolPdfBooksTable)
      .where(and(eq(toolPdfBooksTable.id, bookId), eq(toolPdfBooksTable.userId, userId)))
      .limit(1);

    if (!book) { res.status(404).json({ error: "Book not found" }); return; }

    res.json(book);
  } catch (err: any) {
    console.error("[pdf/books/:id]", err.message);
    res.status(500).json({ error: err.message ?? "Failed to fetch book" });
  }
});

// ── Update reading progress ────────────────────────────────────────────────
router.patch("/tools/pdf/books/:id/progress", requireToolUser, async (req, res) => {
  try {
    const userId = (req.session as any).toolUserId as number;
    const bookId = parseInt(req.params.id, 10);
    if (isNaN(bookId)) { res.status(400).json({ error: "Invalid book id" }); return; }

    const { lastLine } = req.body as { lastLine?: number };
    if (typeof lastLine !== "number") { res.status(400).json({ error: "lastLine is required" }); return; }

    await db
      .update(toolPdfBooksTable)
      .set({ lastLine, updatedAt: new Date() })
      .where(and(eq(toolPdfBooksTable.id, bookId), eq(toolPdfBooksTable.userId, userId)));

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[pdf/books/:id/progress]", err.message);
    res.status(500).json({ error: err.message ?? "Failed to update progress" });
  }
});

// ── Delete a book ─────────────────────────────────────────────────────────
router.delete("/tools/pdf/books/:id", requireToolUser, async (req, res) => {
  try {
    const userId = (req.session as any).toolUserId as number;
    const bookId = parseInt(req.params.id, 10);
    if (isNaN(bookId)) { res.status(400).json({ error: "Invalid book id" }); return; }

    await db
      .delete(toolPdfBooksTable)
      .where(and(eq(toolPdfBooksTable.id, bookId), eq(toolPdfBooksTable.userId, userId)));

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[pdf/books/:id delete]", err.message);
    res.status(500).json({ error: err.message ?? "Failed to delete book" });
  }
});

// ── Shared line-splitter ──────────────────────────────────────────────────
function splitLines(raw: string): string[] {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l: string) => l.replace(/\s+/g, " ").trim())
    .filter((l: string) => l.length > 3);
  const result: string[] = [];
  for (const line of lines) {
    if (line.length > 250) {
      result.push(...line.split(/(?<=[.!?])\s+/).filter((s: string) => s.trim().length > 3));
    } else {
      result.push(line);
    }
  }
  return result;
}

export default router;
