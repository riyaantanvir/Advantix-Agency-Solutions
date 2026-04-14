import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Upload, Link2, Loader2, ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Volume2, ChevronDown, RotateCcw, X, Headphones, BookOpen, Trash2, Clock
} from "lucide-react";
import { useToolsUser } from "@/context/ToolsUserContext";
import { toolsApi, type PdfBook } from "@/lib/toolsApi";

const expo = [0.22, 1, 0.36, 1] as const;

// ── Text helpers ─────────────────────────────────────────────────────────────
function cleanAndSplit(raw: string): string[] {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .split("\n")
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(l => l.length > 3);

  const merged: string[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (prev && !/[.!?:;\u2026]$/.test(prev) && /^[a-z]/.test(line)) {
      merged[merged.length - 1] = prev + " " + line;
    } else {
      merged.push(line);
    }
  }

  const result: string[] = [];
  for (const line of merged) {
    if (line.length > 250) {
      const sentences = line.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);
      result.push(...sentences);
    } else {
      result.push(line);
    }
  }

  return result;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Types ────────────────────────────────────────────────────────────────────
interface PdfResult {
  bookId: number;
  text: string;
  title: string;
  numPages: number;
  filename: string;
  lines: string[];
  startLine?: number;
}

// A speakable chunk — sub-sentence or sentence, with pause after it
interface AudioChunk {
  text: string;
  lineIdx: number;    // which original line this belongs to (for progress tracking)
  pauseAfter: number; // ms to wait after this chunk before playing the next
  isBengali: boolean;
}

// ── Bengali detection ─────────────────────────────────────────────────────────
function hasBengali(text: string) { return /[\u0980-\u09FF]/.test(text); }

// ── Build audio chunks from lines by Bengali sentence punctuation ─────────────
// For Bengali: split by ।  ?  !  giving natural pauses.
// Commas and dashes stay in the text — the TTS engine handles those naturally.
// For English/other: treat each line as one chunk.
function buildChunks(lines: string[]): AudioChunk[] {
  const result: AudioChunk[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line) continue;

    const isBn = hasBengali(line);

    if (isBn) {
      // Match everything up to (and including) a sentence-ending character
      const regex = /([^।?!?!]*[।?!?!])/g;
      let lastEnd = 0;
      let m: RegExpExecArray | null;

      while ((m = regex.exec(line)) !== null) {
        const seg = m[1].trim();
        if (!seg) { lastEnd = m.index + m[0].length; continue; }
        const end = seg.slice(-1);
        const pause = end === "।" ? 1200 : 1000;
        result.push({ text: seg, lineIdx, pauseAfter: pause, isBengali: true });
        lastEnd = m.index + m[0].length;
      }

      // Remaining text (mid-sentence, no ending punctuation) — no extra pause
      const remaining = line.slice(lastEnd).trim();
      if (remaining.length > 2) {
        result.push({ text: remaining, lineIdx, pauseAfter: 0, isBengali: true });
      }
    } else {
      // Non-Bengali line — no extra pause between lines
      result.push({ text: line, lineIdx, pauseAfter: 0, isBengali: false });
    }
  }

  return result;
}

// Find the first chunk index whose lineIdx >= targetLine
function findChunkForLine(chunks: AudioChunk[], lineIdx: number): number {
  const idx = chunks.findIndex(c => c.lineIdx >= lineIdx);
  return idx >= 0 ? idx : 0;
}

// ── Get all browser voices, Bengali first ─────────────────────────────────────
function getAllVoices(): SpeechSynthesisVoice[] {
  const all = window.speechSynthesis.getVoices();
  const bn = all.filter(v => v.lang.startsWith("bn") || v.lang.startsWith("bn-"));
  const others = all.filter(v => !v.lang.startsWith("bn"));
  return [...bn, ...others];
}

// ── Voice Selector ────────────────────────────────────────────────────────────
function VoiceSelector({ value, onChange }: { value: SpeechSynthesisVoice | null; onChange: (v: SpeechSynthesisVoice) => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      const vs = getAllVoices();
      if (vs.length) setVoices(vs);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const bengaliVoices = voices.filter(v => v.lang.startsWith("bn"));
  const otherVoices = voices.filter(v => !v.lang.startsWith("bn"));
  const selected = value ?? bengaliVoices[0] ?? voices[0];
  if (!voices.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/70 px-3 py-1.5 rounded-lg max-w-40 truncate"
      >
        <Volume2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{selected?.name.replace(/\(.*?\)/g, "").trim() ?? "Voice"}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-2xl py-1 z-50 w-64 max-h-72 overflow-y-auto"
          >
            {bengaliVoices.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold text-primary uppercase tracking-wider">Bengali Voices</p>
                {bengaliVoices.map(v => (
                  <button key={v.name} onClick={() => { onChange(v); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 transition-colors ${selected?.name === v.name ? "text-primary font-semibold" : "text-foreground"}`}>
                    {v.name.replace(/\(.*?\)/g, "").trim()}
                    <span className="ml-1 text-muted-foreground text-[10px]">{v.lang}</span>
                  </button>
                ))}
                {otherVoices.length > 0 && <div className="border-t border-border my-1" />}
              </>
            )}
            {bengaliVoices.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-amber-400">No Bengali voice found on this device.</p>
            )}
            {otherVoices.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Other Voices</p>
                {otherVoices.map(v => (
                  <button key={v.name} onClick={() => { onChange(v); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 transition-colors ${selected?.name === v.name ? "text-primary font-semibold" : "text-foreground"}`}>
                    {v.name.replace(/\(.*?\)/g, "").trim()}
                    <span className="ml-1 text-muted-foreground text-[10px]">{v.lang}</span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Book Card ─────────────────────────────────────────────────────────────────
function BookCard({
  book,
  onOpen,
  onDelete,
}: {
  book: PdfBook;
  onOpen: (book: PdfBook) => void;
  onDelete: (id: number) => void;
}) {
  const pct = book.totalLines > 0 ? Math.round((book.lastLine / book.totalLines) * 100) : 0;
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await toolsApi.pdf.deleteBook(book.id);
      onDelete(book.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => onOpen(book)}
      className="group relative flex items-center gap-3 bg-card hover:bg-muted/30 border border-border/50 hover:border-border rounded-xl p-3.5 cursor-pointer transition-all duration-200"
    >
      <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
        <BookOpen className="w-5 h-5 text-rose-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{book.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{book.numPages} pages</span>
          {pct > 0 && pct < 100 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-primary font-medium">{pct}% read</span>
            </>
          )}
          {pct === 100 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-emerald-400 font-medium">Completed</span>
            </>
          )}
        </div>
        <div className="mt-1.5 h-0.5 bg-muted/40 rounded-full overflow-hidden w-full">
          <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
        {book.lastLine > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
            <Clock className="w-3 h-3" />
            <span>Line {book.lastLine}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function PdfAudio() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();

  // Upload state
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Book library
  const [books, setBooks] = useState<PdfBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [openingBook, setOpeningBook] = useState<number | null>(null);

  // PDF result
  const [pdf, setPdf] = useState<PdfResult | null>(null);

  // Player state
  // currentIdx = index into the `chunks` array (NOT pdf.lines)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0); // chunk index
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [wordIndex, setWordIndex] = useState<number>(-1);
  const [elapsed, setElapsed] = useState(0);
  const [totalEstimate, setTotalEstimate] = useState(0);

  // Refs
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map()); // chunkIdx → blob URL
  const fetchingRef = useRef<Set<number>>(new Set());          // chunks being fetched

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Audio chunks — derived from pdf.lines by Bengali sentence splitting ──
  const chunks = useMemo((): AudioChunk[] => {
    if (!pdf) return [];
    return buildChunks(pdf.lines);
  }, [pdf]);

  // currentLineIdx: which original line we're currently on (for display, scroll, saving)
  const currentLineIdx = chunks[currentIdx]?.lineIdx ?? 0;

  // Clear audio cache on book change (revoke blob URLs to free memory)
  const clearAudioCache = useCallback(() => {
    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    fetchingRef.current.clear();
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading]);

  // Load books
  useEffect(() => {
    if (!user) return;
    toolsApi.pdf.books()
      .then(setBooks)
      .catch(() => {})
      .finally(() => setBooksLoading(false));
  }, [user]);

  // Estimate total reading time
  useEffect(() => {
    if (!pdf) return;
    const words = pdf.lines.reduce((s, l) => s + l.split(/\s+/).length, 0);
    setTotalEstimate(Math.ceil((words / (150 * rate)) * 60));
  }, [pdf, rate]);

  // Elapsed time counter
  useEffect(() => {
    if (isPlaying) {
      elapsedInterval.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    }
    return () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current); };
  }, [isPlaying]);

  // Save progress (debounced) when line changes
  useEffect(() => {
    if (!pdf || !pdf.bookId) return;
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => {
      toolsApi.pdf.saveProgress(pdf.bookId, currentLineIdx).catch(() => {});
      setBooks(prev => prev.map(b => b.id === pdf.bookId ? { ...b, lastLine: currentLineIdx } : b));
    }, 2000);
    return () => { if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current); };
  }, [currentLineIdx, pdf?.bookId]);

  // Auto-scroll current line into view
  useEffect(() => {
    const el = lineRefs.current[currentLineIdx];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentLineIdx, isPlaying]);

  // ── Audio prefetching ─────────────────────────────────────────────────────
  // Fire-and-forget: fetch the next N Bengali chunks and store blob URLs in cache
  const prefetchAhead = useCallback((fromIdx: number, theChunks: AudioChunk[], count = 3) => {
    for (let i = fromIdx + 1; i <= fromIdx + count && i < theChunks.length; i++) {
      if (!theChunks[i].isBengali) continue;
      if (audioCacheRef.current.has(i) || fetchingRef.current.has(i)) continue;
      fetchingRef.current.add(i);
      const encoded = encodeURIComponent(theChunks[i].text.slice(0, 500));
      fetch(`/api/tools/tts?text=${encoded}&lang=bn`, { credentials: "include" })
        .then(r => r.ok ? r.blob() : null)
        .then(blob => {
          if (blob) audioCacheRef.current.set(i, URL.createObjectURL(blob));
          fetchingRef.current.delete(i);
        })
        .catch(() => fetchingRef.current.delete(i));
    }
  }, []);

  // ── Play a chunk (replaces old speakLine) ─────────────────────────────────
  const playChunk = useCallback(async (
    idx: number,
    theChunks: AudioChunk[],
    r: number,
    v: SpeechSynthesisVoice | null
  ) => {
    if (idx >= theChunks.length) {
      setIsPlaying(false);
      setCurrentIdx(0);
      setWordIndex(-1);
      return;
    }

    // Stop current audio/speech/pause timer
    window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }

    setCurrentIdx(idx);
    const chunk = theChunks[idx];

    // Pre-fetch next chunks in background
    prefetchAhead(idx, theChunks, 3);

    // Helper: wait pauseMs then advance to next chunk
    const advance = (pauseMs: number) => {
      const next = idx + 1;
      if (!isPlayingRef.current) return;
      const delay = Math.round(pauseMs / Math.max(0.25, r));
      if (delay > 50) {
        pauseTimerRef.current = setTimeout(() => {
          pauseTimerRef.current = null;
          if (isPlayingRef.current) playChunk(next, theChunks, r, v);
        }, delay);
      } else {
        playChunk(next, theChunks, r, v);
      }
    };

    // ── Bengali: use server TTS (HuggingFace MMS → Google Translate) ─────
    if (chunk.isBengali) {
      let blobUrl = audioCacheRef.current.get(idx);

      if (!blobUrl) {
        try {
          const encoded = encodeURIComponent(chunk.text.slice(0, 500));
          const resp = await fetch(`/api/tools/tts?text=${encoded}&lang=bn`, { credentials: "include" });
          if (!resp.ok) throw new Error("TTS failed");
          const blob = await resp.blob();
          blobUrl = URL.createObjectURL(blob);
          audioCacheRef.current.set(idx, blobUrl);
        } catch {
          if (isPlayingRef.current) advance(0);
          return;
        }
      }

      // Check again — user may have paused while we were fetching
      if (!isPlayingRef.current) return;

      const audioEl = new Audio(blobUrl);
      audioRef.current = audioEl;
      audioEl.playbackRate = Math.min(Math.max(r, 0.25), 4);

      audioEl.onended = () => {
        audioRef.current = null;
        advance(chunk.pauseAfter);
      };
      audioEl.onerror = () => {
        audioRef.current = null;
        if (isPlayingRef.current) advance(0);
      };
      audioEl.play().catch(() => {
        audioRef.current = null;
        if (isPlayingRef.current) advance(0);
      });

      return;
    }

    // ── Non-Bengali: Web Speech API ───────────────────────────────────────
    const utt = new SpeechSynthesisUtterance(chunk.text);
    utt.rate = r;
    if (v) utt.voice = v;

    utt.onboundary = (e) => {
      if (e.name === "word") {
        const before = chunk.text.slice(0, e.charIndex).split(/\s+/);
        setWordIndex(before.length - 1);
      }
    };
    utt.onend = () => {
      setWordIndex(-1);
      advance(chunk.pauseAfter);
    };
    utt.onerror = () => {
      setWordIndex(-1);
      if (isPlayingRef.current) advance(0);
    };

    window.speechSynthesis.speak(utt);
  }, [prefetchAhead]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const stopAll = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
  };

  const togglePlay = () => {
    if (!pdf) return;
    if (isPlaying) {
      stopAll();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playChunk(currentIdx, chunks, rate, voice);
    }
  };

  const skipBack = () => {
    if (!pdf) return;
    const next = Math.max(0, currentIdx - 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) playChunk(next, chunks, rate, voice);
  };

  const skipForward = () => {
    if (!pdf) return;
    const next = Math.min(chunks.length - 1, currentIdx + 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) playChunk(next, chunks, rate, voice);
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (isPlaying && pdf) {
      stopAll();
      playChunk(currentIdx, chunks, r, voice);
    }
  };

  const changeVoice = (v: SpeechSynthesisVoice) => {
    setVoice(v);
    if (isPlaying && pdf) {
      stopAll();
      playChunk(currentIdx, chunks, rate, v);
    }
  };

  const restart = () => {
    stopAll();
    setIsPlaying(false);
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
  };

  const closePdf = () => {
    stopAll();
    setIsPlaying(false);
    if (pdf?.bookId) {
      toolsApi.pdf.saveProgress(pdf.bookId, currentLineIdx).catch(() => {});
      setBooks(prev => prev.map(b => b.id === pdf.bookId ? { ...b, lastLine: currentLineIdx } : b));
    }
    clearAudioCache();
    setPdf(null);
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
  };

  // ── PDF loading ───────────────────────────────────────────────────────────
  const openPdfData = (data: {
    bookId: number;
    text: string;
    title: string;
    numPages: number;
    filename: string;
    startLine?: number;
  }) => {
    stopAll();
    clearAudioCache();
    const lines = cleanAndSplit(data.text);
    setPdf({ ...data, lines });
    // We'll set currentIdx after chunks are computed via useEffect
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
    setIsPlaying(false);
    // Store startLine so we can jump after chunks are built
    pendingStartLineRef.current = data.startLine ?? 0;
  };

  // After chunks are built (useMemo), jump to the pending start line
  const pendingStartLineRef = useRef<number>(0);
  useEffect(() => {
    if (chunks.length === 0) return;
    const target = pendingStartLineRef.current;
    if (target > 0) {
      const chunkIdx = findChunkForLine(chunks, target);
      setCurrentIdx(chunkIdx);
      pendingStartLineRef.current = 0;
    }
  }, [chunks]);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setFetchError("Please upload a PDF file.");
      return;
    }
    setFetchError("");
    setFetching(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tools/pdf/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      openPdfData(data);
      setBooks(prev => {
        const existing = prev.find(b => b.id === data.bookId);
        if (existing) return prev;
        return [{ id: data.bookId, title: data.title, filename: data.filename, numPages: data.numPages, totalLines: cleanAndSplit(data.text).length, lastLine: 0, createdAt: new Date().toISOString() }, ...prev];
      });
    } catch (err: any) {
      setFetchError(err.message ?? "Failed to process PDF");
    } finally {
      setFetching(false);
    }
  };

  const handleUrlLoad = async () => {
    if (!urlInput.trim()) return;
    setFetchError("");
    setFetching(true);
    try {
      const res = await fetch("/api/tools/pdf/from-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch PDF");
      openPdfData(data);
      setBooks(prev => {
        const existing = prev.find(b => b.id === data.bookId);
        if (existing) return prev;
        return [{ id: data.bookId, title: data.title, filename: data.filename, numPages: data.numPages, totalLines: cleanAndSplit(data.text).length, lastLine: 0, createdAt: new Date().toISOString() }, ...prev];
      });
    } catch (err: any) {
      setFetchError(err.message ?? "Failed to load PDF from URL");
    } finally {
      setFetching(false);
    }
  };

  const openBook = async (book: PdfBook) => {
    setOpeningBook(book.id);
    try {
      const full = await toolsApi.pdf.getBook(book.id);
      openPdfData({
        bookId: full.id,
        text: full.text,
        title: full.title,
        numPages: full.numPages,
        filename: full.filename,
        startLine: full.lastLine,
      });
    } catch {
      setFetchError("Failed to open book.");
    } finally {
      setOpeningBook(null);
    }
  };

  const deleteBook = (id: number) => {
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  useEffect(() => () => {
    window.speechSynthesis.cancel();
    clearAudioCache();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
  if (!user) return null;

  // Progress bar uses currentLineIdx (original line position)
  const progress = pdf ? (currentLineIdx / Math.max(1, pdf.lines.length - 1)) * 100 : 0;

  // ── PDF Reader View ───────────────────────────────────────────────────────
  if (pdf) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3 flex items-center gap-3">
          <button onClick={closePdf} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{pdf.title}</p>
            <p className="text-xs text-muted-foreground">
              {pdf.numPages} pages · {chunks.length} chunks
            </p>
          </div>
          <button onClick={restart} className="text-muted-foreground hover:text-foreground transition-colors" title="Restart">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Document reader */}
        <div className="flex-1 overflow-y-auto pb-48 pt-8 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="font-reader text-[16px] leading-loose space-y-0.5">
              {pdf.lines.map((line, lIdx) => {
                const isCurrent = lIdx === currentLineIdx;
                const isPast = lIdx < currentLineIdx;
                const words = line.split(/(\s+)/);
                let wCount = 0;

                return (
                  <div
                    key={lIdx}
                    ref={el => { lineRefs.current[lIdx] = el; }}
                    onClick={() => {
                      // Jump to the first chunk of this line
                      const chunkIdx = findChunkForLine(chunks, lIdx);
                      setCurrentIdx(chunkIdx);
                      setWordIndex(-1);
                      if (isPlaying) {
                        stopAll();
                        playChunk(chunkIdx, chunks, rate, voice);
                      }
                    }}
                    className={`relative px-3 py-0.5 rounded-lg cursor-pointer transition-all duration-200 group ${
                      isCurrent
                        ? "bg-primary/12 ring-1 ring-primary/25"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
                    )}
                    <span className={`${isPast ? "text-muted-foreground/40" : isCurrent ? "text-foreground" : "text-muted-foreground/75"}`}>
                      {words.map((seg, wIdx) => {
                        if (/^\s+$/.test(seg)) return <span key={wIdx}>{seg}</span>;
                        const wi = wCount++;
                        return (
                          <span
                            key={wIdx}
                            className={
                              isCurrent && isPlaying && wi === wordIndex
                                ? "bg-primary text-primary-foreground rounded px-0.5 transition-all"
                                : ""
                            }
                          >
                            {seg}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="h-4 mt-8 text-center">
              <p className="text-xs text-muted-foreground/40">— End of document —</p>
            </div>
          </div>
        </div>

        {/* ── Fixed Player Bar ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/60 shadow-2xl z-40">
          {/* Progress bar (scrub by line) */}
          <div
            className="h-1 bg-muted/60 cursor-pointer"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const targetLine = Math.floor(pct * pdf.lines.length);
              const chunkIdx = findChunkForLine(chunks, targetLine);
              setCurrentIdx(chunkIdx);
              setWordIndex(-1);
              if (isPlaying) { stopAll(); playChunk(chunkIdx, chunks, rate, voice); }
            }}
          >
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{formatTime(elapsed)}</span>
              <span className="text-muted-foreground/60">
                Line {currentLineIdx + 1} of {pdf.lines.length}
              </span>
              <span>{formatTime(Math.max(0, totalEstimate - elapsed))}</span>
            </div>

            {/* Info pill: shows which TTS mode is active */}
            {chunks[currentIdx]?.isBengali && (
              <div className="mb-2 px-3 py-1.5 bg-sky-500/8 border border-sky-500/20 rounded-xl text-[11px] text-sky-400/80 text-center">
                Google MMS-TTS · Punctuation-aware pauses · {chunks.length} chunks
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 flex items-center">
                <VoiceSelector value={voice} onChange={changeVoice} />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={skipBack} className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                  <SkipBack className="w-5 h-5" />
                </button>
                <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all active:scale-95">
                  {isPlaying
                    ? <Pause className="w-6 h-6 text-primary-foreground fill-current" />
                    : <Play className="w-6 h-6 text-primary-foreground fill-current ml-0.5" />
                  }
                </button>
                <button onClick={skipForward} className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-end">
                <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
                  {SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => changeRate(s)}
                      className={`text-xs px-2 py-1 rounded-md transition-all font-medium ${
                        rate === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Upload / URL View ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-28 pb-24 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo }}>

          <Link href="/tools/dashboard">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </button>
          </Link>

          {/* Hero */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 ring-1 ring-rose-500/20 flex items-center justify-center mx-auto mb-4">
              <Headphones className="w-8 h-8 text-rose-400" />
            </div>
            <h1 className="text-3xl font-display font-extrabold mb-2">PDF to Audio</h1>
            <p className="text-muted-foreground">Upload a PDF or paste a link — listen to any document line by line.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/40 p-1 rounded-xl mb-6">
            {(["upload", "url"] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setFetchError(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "upload" ? <><Upload className="w-4 h-4" /> Upload PDF</> : <><Link2 className="w-4 h-4" /> From URL</>}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {fetching ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="border border-border/50 rounded-2xl p-12 text-center bg-card"
              >
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
                <p className="text-sm font-semibold text-foreground mb-1">Running Bengali OCR…</p>
                <p className="text-xs text-muted-foreground">Reading each page visually for accurate Bengali text. Large books may take 1–2 minutes.</p>
              </motion.div>
            ) : tab === "upload" ? (
              <motion.div key="upload" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFile(file);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/50 hover:border-primary/50 hover:bg-muted/20"
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="font-bold text-foreground mb-1">Drop your PDF here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <span className="inline-block text-xs bg-muted/60 text-muted-foreground px-3 py-1.5 rounded-full">Max 30MB · PDF only</span>
                </div>
                <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              </motion.div>
            ) : (
              <motion.div key="url" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className="bg-card border border-border/50 rounded-2xl p-6">
                  <label className="block text-sm font-semibold text-foreground mb-2">PDF URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleUrlLoad()}
                      placeholder="https://example.com/document.pdf"
                      className="flex-1 bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                    />
                    <button
                      onClick={handleUrlLoad}
                      disabled={!urlInput.trim()}
                      className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-primary/90 transition-all"
                    >
                      Load
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">The PDF must be publicly accessible.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {fetchError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
              {fetchError}
            </motion.p>
          )}

          {/* ── My Library ── */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-rose-400" />
                My Library
              </h2>
              {books.length > 0 && (
                <span className="text-xs text-muted-foreground">{books.length} book{books.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {booksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : books.length === 0 ? (
              <div className="text-center py-10 bg-muted/20 rounded-2xl border border-border/30">
                <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No books yet. Upload a PDF to get started.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <AnimatePresence>
                  {books.map(book => (
                    <BookCard
                      key={book.id}
                      book={book}
                      onOpen={openBook}
                      onDelete={deleteBook}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Opening book overlay */}
          <AnimatePresence>
            {openingBook !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3"
              >
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-semibold text-foreground">Opening book…</p>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </div>
    </div>
  );
}
