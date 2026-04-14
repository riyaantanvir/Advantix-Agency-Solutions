import { Router } from "express";
import multer from "multer";
import { requireToolUser } from "../middleware/toolAuth.js";
import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

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
// Bengali consonants: U+0995–U+09B9, U+09CE, U+09DC–U+09DF, U+09F0–U+09F1
const PREBASE = /[\u09BF\u09C7\u09C8]/;
const CONSONANT = /[\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1]/;
const HASANTA = "\u09CD"; // virama

function fixBengaliVowelOrder(text: string): string {
  // Regex: (pre-base vowel)(consonant cluster with optional hasanta+consonant chains)
  return text.replace(
    /([\u09BF\u09C7\u09C8])([\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?(?:\u09CD[\u0995-\u09B9\u09CE\u09DC-\u09DF\u09F0\u09F1](?:\u09BC)?)*)/g,
    "$2$1"
  );
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

    // pdftotext is always available in the Replit environment (Poppler)
    await execAsync(
      `pdftotext -enc UTF-8 -nopgbrk "${inPath}" "${outPath}"`,
      { timeout: 30_000 }
    );

    const { stdout: rawText } = await execAsync(`cat "${outPath}"`, { maxBuffer: 50 * 1024 * 1024 });

    // Get page count
    let numPages = 1;
    try {
      const { stdout: info } = await execAsync(`pdfinfo "${inPath}" 2>/dev/null || echo "Pages: 1"`, { timeout: 5_000 });
      const match = info.match(/Pages:\s*(\d+)/);
      if (match) numPages = parseInt(match[1], 10);
    } catch { /* ignore */ }

    // Apply Bengali vowel reordering fix
    const fixed = fixBengaliVowelOrder(rawText);

    return { text: fixed, numPages };
  } finally {
    // Clean up temp files
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
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

    res.json({
      text: result.text,
      title: req.file.originalname.replace(/\.pdf$/i, ""),
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
    res.json({
      text: result.text,
      title: filename.replace(/\.pdf$/i, ""),
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

export default router;
