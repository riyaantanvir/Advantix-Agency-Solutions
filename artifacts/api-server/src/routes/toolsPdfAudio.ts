import { Router } from "express";
import multer from "multer";
import { requireToolUser } from "../middleware/toolAuth.js";
import { createRequire } from "node:module";
import { db } from "@workspace/db";
import { toolPdfBooksTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// ── Resolve pdfjs-dist paths at module load (externalized, lives in node_modules) ──
const _require = createRequire(import.meta.url);
const pdfjsPkgDir: string = _require.resolve("pdfjs-dist/package.json").replace(/\/package\.json$/, "");
const pdfjsWorkerSrc: string = `${pdfjsPkgDir}/legacy/build/pdf.worker.mjs`;
const pdfjsCMapUrl: string = `${pdfjsPkgDir}/cmaps/`;

// ── Lazy-load PDF.js (ESM, externalized) ─────────────────────────────────
let _pdfjs: any = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  _pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;
  return _pdfjs;
}

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

// ── Bengali pre-base vowel reordering ─────────────────────────────────────
// PDFs using visual glyph order store ে/ি/ৈ BEFORE the consonant.
// Unicode logical order requires them AFTER. We swap them here.
function fixBengaliVowelOrder(text: string): string {
  return text.replace(
    /([\u09BF\u09C7\u09C8])([\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?(?:\u09CD[\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?)*)/g,
    "$2$1"
  );
}

// ── Clean unmappable garbage from extracted text ──────────────────────────
function cleanExtractedText(text: string): string {
  return text
    .replace(/\uFFFD/g, "")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

// ── PDF.js text extraction ─────────────────────────────────────────────────
// Uses the same rendering engine as Firefox/Chrome PDF viewer.
// With CMap support, it properly decodes embedded custom fonts for Indic scripts.
async function extractTextFromBuffer(buffer: Buffer): Promise<{
  text: string;
  numPages: number;
}> {
  const pdfjs = await getPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // CMap tables tell PDF.js how to map glyph IDs → Unicode for embedded fonts
    cMapUrl: pdfjsCMapUrl,
    cMapPacked: true,
    // Disable web-specific features
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: false,
    // Use system font data for better Indic script support
    standardFontDataUrl: `${pdfjsPkgDir}/standard_fonts/`,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent({
      includeMarkedContent: false,
    });

    // Reconstruct text lines from positioned text items
    // Items come in reading order for most PDFs, but some need y-sort + grouping
    const items = content.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
      hasEOL: boolean;
    }>;

    // Group items into lines by y-position (within ~5 pt tolerance)
    const lineMap = new Map<number, { x: number; text: string }[]>();
    for (const item of items) {
      if (!item.str) continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      // Round y to nearest 5 to group items on the same line
      const yKey = Math.round(y / 5) * 5;
      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey)!.push({ x, text: item.str });
    }

    // Sort lines top-to-bottom (y descends in PDF coords = ascending in reading order)
    const sortedYKeys = [...lineMap.keys()].sort((a, b) => b - a);

    const lines: string[] = [];
    for (const yKey of sortedYKeys) {
      const lineItems = lineMap.get(yKey)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(i => i.text).join("").trim();
      if (lineText) lines.push(lineText);
    }

    pageTexts.push(lines.join("\n"));
  }

  const rawText = pageTexts.join("\n\n");
  const cleaned = cleanExtractedText(fixBengaliVowelOrder(rawText));

  return { text: cleaned, numPages };
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
