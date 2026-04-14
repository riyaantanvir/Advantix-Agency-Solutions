import { Router } from "express";
import multer from "multer";
import { createRequire } from "node:module";
import { requireToolUser } from "../middleware/toolAuth.js";

const _require = createRequire(import.meta.url);

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

// ── Extract text using pdf2json (pure Node.js, no browser APIs needed) ───────
function extractTextFromBuffer(buffer: Buffer): Promise<{
  text: string;
  title?: string;
  author?: string;
  numPages: number;
}> {
  return new Promise((resolve, reject) => {
    const PDFParser = _require("pdf2json");
    const parser = new PDFParser(null, 1);

    const timeout = setTimeout(() => {
      reject(new Error("PDF parsing timed out"));
    }, 30_000);

    parser.on("pdfParser_dataError", (err: any) => {
      clearTimeout(timeout);
      reject(new Error(err?.parserError ?? "Failed to parse PDF"));
    });

    parser.on("pdfParser_dataReady", (data: any) => {
      clearTimeout(timeout);
      try {
        const pages: any[] = data.Pages ?? [];
        const lines: string[] = [];

        for (const page of pages) {
          // Group text items by their Y position (row), then join by X order
          const rowMap = new Map<number, { x: number; t: string }[]>();
          for (const textItem of page.Texts ?? []) {
            const y = Math.round(textItem.y * 10); // round to bucket nearby items
            const x = textItem.x;
            const decoded = (textItem.R ?? [])
              .map((r: any) => decodeURIComponent(r.T))
              .join("");
            if (!decoded.trim()) continue;
            if (!rowMap.has(y)) rowMap.set(y, []);
            rowMap.get(y)!.push({ x, t: decoded });
          }

          // Sort rows by Y, then tokens by X, join into lines
          const sortedYs = Array.from(rowMap.keys()).sort((a, b) => a - b);
          for (const y of sortedYs) {
            const tokens = rowMap.get(y)!.sort((a, b) => a.x - b.x);
            const line = tokens.map(t => t.t).join(" ").replace(/\s+/g, " ").trim();
            if (line) lines.push(line);
          }

          lines.push(""); // blank line between pages
        }

        const text = lines.join("\n").trim();
        const meta = data.Meta ?? {};

        resolve({
          text,
          title: meta.Title?.trim() || undefined,
          author: meta.Author?.trim() || undefined,
          numPages: pages.length,
        });
      } catch (e: any) {
        reject(new Error("Failed to extract text: " + e.message));
      }
    });

    parser.parseBuffer(buffer);
  });
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
    console.error("[pdf/upload]", err);
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
      console.error("[pdf/from-url]", err);
      res.status(500).json({ error: err.message ?? "Failed to process PDF" });
    }
  }
});

export default router;
