import { Router } from "express";
import multer from "multer";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

async function extractTextFromBuffer(buffer: Buffer): Promise<{ text: string; title?: string; author?: string; numPages: number }> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    title: (data.info?.Title as string) || undefined,
    author: (data.info?.Author as string) || undefined,
    numPages: data.numpages,
  };
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
      title: result.title || req.file.originalname.replace(/\.pdf$/i, ""),
      author: result.author,
      numPages: result.numPages,
      filename: req.file.originalname,
    });
  } catch (err: any) {
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
      title: result.title || filename.replace(/\.pdf$/i, ""),
      author: result.author,
      numPages: result.numPages,
      filename,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      res.status(408).json({ error: "Request timed out fetching the PDF" });
    } else {
      res.status(500).json({ error: err.message ?? "Failed to process PDF" });
    }
  }
});

export default router;
