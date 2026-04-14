import { Router } from "express";
import multer from "multer";
import { requireToolUser } from "../middleware/toolAuth.js";
import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@workspace/db";
import { toolPdfBooksTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const execAsync = promisify(exec);

const router = Router();

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

// ── Bengali (Bangla) pre-base vowel reordering ────────────────────────────
// PDFs that use visual glyph order store pre-base vowels BEFORE the consonant.
// Unicode logical order requires them AFTER the consonant cluster.
// Pre-base vowels: ি (U+09BF), ে (U+09C7), ৈ (U+09C8)
function fixBengaliVowelOrder(text: string): string {
  return text.replace(
    /([\u09BF\u09C7\u09C8])([\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?(?:\u09CD[\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?)*)/g,
    "$2$1"
  );
}

// ── Clean unmappable / garbage characters from extracted text ─────────────
// PDFs with custom/embedded fonts sometimes produce:
//   - U+FFFD replacement characters (shown as □)
//   - Private Use Area codepoints (U+E000–U+F8FF, U+F0000+) that no font renders
//   - Lone surrogates or other invalid Unicode
// We strip those so TTS reads clean text and the UI doesn't show boxes.
function cleanExtractedText(text: string): string {
  return text
    // Remove Unicode replacement character
    .replace(/\uFFFD/g, "")
    // Remove Private Use Area characters (BMP PUA: U+E000–U+F8FF)
    .replace(/[\uE000-\uF8FF]/g, "")
    // Remove control characters except newline, carriage return, tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Collapse multiple consecutive spaces/blanks on a line
    .replace(/[^\S\n]+/g, " ")
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, "\n\n");
}

// ── Extract text via pdftotext (Poppler) ──────────────────────────────────
async function extractTextFromBuffer(buffer: Buffer): Promise<{
  text: string;
  numPages: number;
}> {
  const tmpId = randomBytes(8).toString("hex");
  const inPath = join(tmpdir(), `pdf_in_${tmpId}.pdf`);
  const outPath = join(tmpdir(), `pdf_out_${tmpId}.txt`);

  try {
    await writeFile(inPath, buffer);

    await execAsync(
      `pdftotext -enc UTF-8 -nopgbrk "${inPath}" "${outPath}"`,
      { timeout: 30_000 }
    );

    const { stdout: rawText } = await execAsync(`cat "${outPath}"`, { maxBuffer: 50 * 1024 * 1024 });

    let numPages = 1;
    try {
      const { stdout: info } = await execAsync(`pdfinfo "${inPath}" 2>/dev/null || echo "Pages: 1"`, { timeout: 5_000 });
      const match = info.match(/Pages:\s*(\d+)/);
      if (match) numPages = parseInt(match[1], 10);
    } catch { /* ignore */ }

    const fixed = cleanExtractedText(fixBengaliVowelOrder(rawText));

    return { text: fixed, numPages };
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

// ── Helper: save or update book in DB ─────────────────────────────────────
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
      (req as any).toolUser.id,
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
      (req as any).toolUser.id,
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
    const userId = (req as any).toolUser.id;
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
    const userId = (req as any).toolUser.id;
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
    const userId = (req as any).toolUser.id;
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
    const userId = (req as any).toolUser.id;
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

// ── Shared line-splitter (mirrors frontend cleanAndSplit) ──────────────────
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
