import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Upload, Link2, Loader2, ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Volume2, ChevronDown, RotateCcw, X, Headphones
} from "lucide-react";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;

// ── Text helpers ─────────────────────────────────────────────────────────────
function cleanAndSplit(raw: string): string[] {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")   // dehyphenate split words
    .split("\n")
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(l => l.length > 3);               // drop very short/empty lines

  // Merge lines that are clearly continuation (no sentence ending before them)
  const merged: string[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    // If previous line doesn't end with punctuation and current starts lowercase → merge
    if (prev && !/[.!?:;\u2026]$/.test(prev) && /^[a-z]/.test(line)) {
      merged[merged.length - 1] = prev + " " + line;
    } else {
      merged.push(line);
    }
  }

  // Split very long lines into sentences
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
  text: string;
  title: string;
  author?: string;
  numPages: number;
  filename: string;
  lines: string[];
}

// ── Voice Selector ────────────────────────────────────────────────────────────
function VoiceSelector({ value, onChange }: { value: SpeechSynthesisVoice | null; onChange: (v: SpeechSynthesisVoice) => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      const vs = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
      if (vs.length) setVoices(vs);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const selected = value ?? voices[0];
  if (!voices.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/70 px-3 py-1.5 rounded-lg max-w-36 truncate"
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
            className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-2xl py-1 z-50 w-64 max-h-64 overflow-y-auto"
          >
            {voices.map(v => (
              <button
                key={v.name}
                onClick={() => { onChange(v); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 transition-colors ${selected?.name === v.name ? "text-primary font-semibold" : "text-foreground"}`}
              >
                {v.name.replace(/\(.*?\)/g, "").trim()}
                {v.localService && <span className="ml-1 text-muted-foreground">(offline)</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

  // PDF result
  const [pdf, setPdf] = useState<PdfResult | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [wordIndex, setWordIndex] = useState<number>(-1);
  const [elapsed, setElapsed] = useState(0);
  const [totalEstimate, setTotalEstimate] = useState(0);

  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isPlayingRef = useRef(false);
  const currentIdxRef = useRef(0);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading]);

  useEffect(() => {
    if (!pdf) return;
    const words = pdf.lines.reduce((s, l) => s + l.split(/\s+/).length, 0);
    setTotalEstimate(Math.ceil((words / (150 * rate)) * 60));
  }, [pdf, rate]);

  useEffect(() => {
    if (isPlaying) {
      elapsedInterval.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    }
    return () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current); };
  }, [isPlaying]);

  // ── Speak a line ──────────────────────────────────────────────────────────
  const speakLine = useCallback((idx: number, lines: string[], r: number, v: SpeechSynthesisVoice | null) => {
    if (idx >= lines.length) {
      setIsPlaying(false);
      setCurrentIdx(0);
      setWordIndex(-1);
      return;
    }

    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(lines[idx]);
    utt.rate = r;
    if (v) utt.voice = v;

    utt.onboundary = (e) => {
      if (e.name === "word") {
        const before = lines[idx].slice(0, e.charIndex).split(/\s+/);
        setWordIndex(before.length - 1);
      }
    };

    utt.onend = () => {
      setWordIndex(-1);
      const next = idx + 1;
      setCurrentIdx(next);
      if (isPlayingRef.current && next < lines.length) {
        speakLine(next, lines, r, v);
      } else {
        setIsPlaying(false);
      }
    };

    utt.onerror = () => {
      setIsPlaying(false);
      setWordIndex(-1);
    };

    window.speechSynthesis.speak(utt);
  }, []);

  // Auto-scroll current line into view
  useEffect(() => {
    const el = lineRefs.current[currentIdx];
    if (el && isPlaying) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIdx, isPlaying]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!pdf) return;
    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
      speakLine(currentIdx, pdf.lines, rate, voice);
    }
  };

  const skipBack = () => {
    if (!pdf) return;
    const next = Math.max(0, currentIdx - 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) speakLine(next, pdf.lines, rate, voice);
  };

  const skipForward = () => {
    if (!pdf) return;
    const next = Math.min(pdf.lines.length - 1, currentIdx + 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) speakLine(next, pdf.lines, rate, voice);
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (isPlaying && pdf) speakLine(currentIdx, pdf.lines, r, voice);
  };

  const changeVoice = (v: SpeechSynthesisVoice) => {
    setVoice(v);
    if (isPlaying && pdf) speakLine(currentIdx, pdf.lines, rate, v);
  };

  const restart = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
  };

  const closePdf = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setPdf(null);
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
  };

  // ── PDF loading ───────────────────────────────────────────────────────────
  const processPdfData = (data: { text: string; title: string; author?: string; numPages: number; filename: string }) => {
    const lines = cleanAndSplit(data.text);
    setPdf({ ...data, lines });
    setCurrentIdx(0);
    setWordIndex(-1);
    setElapsed(0);
    setIsPlaying(false);
  };

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
      processPdfData(data);
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
      processPdfData(data);
    } catch (err: any) {
      setFetchError(err.message ?? "Failed to load PDF from URL");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
  if (!user) return null;

  const progress = pdf ? (currentIdx / Math.max(1, pdf.lines.length - 1)) * 100 : 0;

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
              {pdf.author ? `${pdf.author} · ` : ""}{pdf.numPages} pages · {pdf.lines.length} lines
            </p>
          </div>
          <button onClick={restart} className="text-muted-foreground hover:text-foreground transition-colors" title="Restart">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Document reader */}
        <div className="flex-1 overflow-y-auto pb-48 pt-8 px-4">
          <div className="max-w-2xl mx-auto">
            {/* Document-style lines */}
            <div className="font-serif text-[16px] leading-loose space-y-0.5">
              {pdf.lines.map((line, lIdx) => {
                const isCurrent = lIdx === currentIdx;
                const isPast = lIdx < currentIdx;
                const words = line.split(/(\s+)/);
                let wCount = 0;

                return (
                  <div
                    key={lIdx}
                    ref={el => { lineRefs.current[lIdx] = el; }}
                    onClick={() => {
                      setCurrentIdx(lIdx);
                      setWordIndex(-1);
                      if (isPlaying) speakLine(lIdx, pdf.lines, rate, voice);
                    }}
                    className={`relative px-3 py-0.5 rounded-lg cursor-pointer transition-all duration-200 group ${
                      isCurrent
                        ? "bg-primary/12 ring-1 ring-primary/25"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Current line indicator bar */}
                    {isCurrent && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
                    )}

                    <span className={`${isPast ? "text-muted-foreground/40" : isCurrent ? "text-foreground" : "text-muted-foreground/75"}`}>
                      {words.map((chunk, wIdx) => {
                        if (/^\s+$/.test(chunk)) return <span key={wIdx}>{chunk}</span>;
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
                            {chunk}
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
          {/* Progress bar */}
          <div
            className="h-1 bg-muted/60 cursor-pointer"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const next = Math.floor(pct * pdf.lines.length);
              setCurrentIdx(next);
              setWordIndex(-1);
              if (isPlaying) speakLine(next, pdf.lines, rate, voice);
            }}
          >
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="max-w-2xl mx-auto px-4 py-3">
            {/* Time row */}
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{formatTime(elapsed)}</span>
              <span className="text-muted-foreground/60">
                Line {currentIdx + 1} of {pdf.lines.length}
              </span>
              <span>{formatTime(Math.max(0, totalEstimate - elapsed))}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 flex items-center">
                <VoiceSelector value={voice} onChange={changeVoice} />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={skipBack}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all active:scale-95"
                >
                  {isPlaying
                    ? <Pause className="w-6 h-6 text-primary-foreground fill-current" />
                    : <Play className="w-6 h-6 text-primary-foreground fill-current ml-0.5" />
                  }
                </button>

                <button
                  onClick={skipForward}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
                >
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
                <p className="text-sm font-semibold text-foreground mb-1">Extracting text…</p>
                <p className="text-xs text-muted-foreground">This may take a moment for large PDFs</p>
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
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted/40 transition-colors"
                  >
                    <Upload className="w-4 h-4" /> Choose PDF
                  </button>
                  <p className="text-xs text-muted-foreground mt-3">Max 30MB · Text-based PDFs only</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </motion.div>
            ) : (
              <motion.div key="url" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleUrlLoad(); }}
                    placeholder="https://example.com/document.pdf"
                    className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                  />
                  <button
                    onClick={handleUrlLoad}
                    disabled={!urlInput.trim()}
                    className="px-5 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all"
                  >
                    Load
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center">Paste a direct link to a PDF file. The PDF must be publicly accessible.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {fetchError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path strokeLinecap="round" d="M12 8v4m0 4h.01" strokeWidth="2"/></svg>
              {fetchError}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
