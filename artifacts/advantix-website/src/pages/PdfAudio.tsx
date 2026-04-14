import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Upload, Link2, Loader2, ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Volume2, ChevronDown, FileText, BookOpen, RotateCcw, X, AlertCircle, Headphones
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function cleanPdfText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")        // dehyphenate
    .replace(/(?<!\n)\n(?!\n)/g, " ")              // single newlines → space
    .replace(/\n{3,}/g, "\n\n")                    // collapse 3+ newlines
    .replace(/[ \t]+/g, " ")                       // collapse spaces
    .trim();
}

function toParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(p => p.length > 20);                   // drop tiny chunks
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
  paragraphs: string[];
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
            className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-2xl py-1 z-50 w-60 max-h-64 overflow-y-auto"
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

// ── Main Component ─────────────────────────────────────────────────────────
export default function PdfAudio() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();

  // Upload/load state
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

  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);
  const currentIdxRef = useRef(0);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading]);

  // Estimate total reading time
  useEffect(() => {
    if (!pdf) return;
    const words = pdf.paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0);
    setTotalEstimate(Math.ceil((words / (150 * rate)) * 60));
  }, [pdf, rate]);

  // Elapsed timer
  useEffect(() => {
    if (isPlaying) {
      elapsedInterval.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    }
    return () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current); };
  }, [isPlaying]);

  // ── Speak a paragraph ─────────────────────────────────────────────────────
  const speakParagraph = useCallback((idx: number, paragraphs: string[], r: number, v: SpeechSynthesisVoice | null) => {
    if (idx >= paragraphs.length) {
      setIsPlaying(false);
      setCurrentIdx(0);
      setWordIndex(-1);
      return;
    }

    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(paragraphs[idx]);
    utt.rate = r;
    if (v) utt.voice = v;

    utt.onboundary = (e) => {
      if (e.name === "word") {
        const charIdx = e.charIndex;
        const text = paragraphs[idx];
        const before = text.slice(0, charIdx).split(/\s+/);
        setWordIndex(before.length - 1);
      }
    };

    utt.onend = () => {
      setWordIndex(-1);
      const next = idx + 1;
      setCurrentIdx(next);
      if (isPlayingRef.current && next < paragraphs.length) {
        speakParagraph(next, paragraphs, r, v);
      } else {
        setIsPlaying(false);
      }
    };

    utt.onerror = () => {
      setIsPlaying(false);
      setWordIndex(-1);
    };

    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, []);

  // Auto-scroll to current paragraph
  useEffect(() => {
    const el = paragraphRefs.current[currentIdx];
    if (el && isPlaying) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIdx, isPlaying]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const play = () => {
    if (!pdf) return;
    setIsPlaying(true);
    speakParagraph(currentIdx, pdf.paragraphs, rate, voice);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    setIsPlaying(false);
  };

  const resume = () => {
    window.speechSynthesis.resume();
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!pdf) return;
    if (isPlaying) {
      pause();
    } else if (window.speechSynthesis.paused) {
      resume();
    } else {
      play();
    }
  };

  const skipBack = () => {
    if (!pdf) return;
    const next = Math.max(0, currentIdx - 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) {
      window.speechSynthesis.cancel();
      speakParagraph(next, pdf.paragraphs, rate, voice);
    }
  };

  const skipForward = () => {
    if (!pdf) return;
    const next = Math.min(pdf.paragraphs.length - 1, currentIdx + 1);
    setCurrentIdx(next);
    setWordIndex(-1);
    if (isPlaying) {
      window.speechSynthesis.cancel();
      speakParagraph(next, pdf.paragraphs, rate, voice);
    }
  };

  const changeRate = (newRate: number) => {
    setRate(newRate);
    if (isPlaying && pdf) {
      window.speechSynthesis.cancel();
      speakParagraph(currentIdx, pdf.paragraphs, newRate, voice);
    }
  };

  const changeVoice = (v: SpeechSynthesisVoice) => {
    setVoice(v);
    if (isPlaying && pdf) {
      window.speechSynthesis.cancel();
      speakParagraph(currentIdx, pdf.paragraphs, rate, v);
    }
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

  // ── PDF loading ────────────────────────────────────────────────────────────
  const processPdfData = (data: { text: string; title: string; author?: string; numPages: number; filename: string }) => {
    const cleaned = cleanPdfText(data.text);
    const paragraphs = toParagraphs(cleaned);
    setPdf({ ...data, paragraphs });
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

  // Cleanup on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
  if (!user) return null;

  const progress = pdf ? (currentIdx / Math.max(1, pdf.paragraphs.length - 1)) * 100 : 0;

  // ── PDF Player View ────────────────────────────────────────────────────────
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
              {pdf.author ? `${pdf.author} · ` : ""}{pdf.numPages} pages · {pdf.paragraphs.length} sections
            </p>
          </div>
          <button onClick={restart} className="text-muted-foreground hover:text-foreground transition-colors" title="Restart">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Text view */}
        <div className="flex-1 overflow-y-auto pb-48 pt-6 px-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {pdf.paragraphs.map((para, pIdx) => {
              const isCurrent = pIdx === currentIdx;
              const words = para.split(/(\s+)/);
              let wordCount = 0;
              return (
                <motion.p
                  key={pIdx}
                  ref={el => { paragraphRefs.current[pIdx] = el; }}
                  onClick={() => {
                    setCurrentIdx(pIdx);
                    setWordIndex(-1);
                    if (isPlaying) {
                      window.speechSynthesis.cancel();
                      speakParagraph(pIdx, pdf.paragraphs, rate, voice);
                    }
                  }}
                  className={`leading-relaxed text-[15px] cursor-pointer rounded-xl px-3 py-2 transition-all duration-300 ${
                    isCurrent
                      ? "bg-primary/10 ring-1 ring-primary/30 text-foreground"
                      : pIdx < currentIdx
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground/80 hover:bg-muted/30"
                  }`}
                >
                  {words.map((chunk, wIdx) => {
                    if (/^\s+$/.test(chunk)) return chunk;
                    const wi = wordCount++;
                    return (
                      <span
                        key={wIdx}
                        className={
                          isCurrent && isPlaying && wi === wordIndex
                            ? "bg-primary text-primary-foreground rounded px-0.5 transition-colors"
                            : ""
                        }
                      >
                        {chunk}
                      </span>
                    );
                  })}
                </motion.p>
              );
            })}

            <div className="h-4" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground/50">— End of document —</p>
            </div>
          </div>
        </div>

        {/* ── Fixed Player Bar ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/60 shadow-2xl z-40">
          {/* Progress bar */}
          <div className="h-1 bg-muted/60 cursor-pointer group" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const nextIdx = Math.floor(pct * pdf.paragraphs.length);
            setCurrentIdx(nextIdx);
            setWordIndex(-1);
            if (isPlaying) {
              window.speechSynthesis.cancel();
              speakParagraph(nextIdx, pdf.paragraphs, rate, voice);
            }
          }}>
            <div
              className="h-full bg-primary transition-all duration-500 group-hover:opacity-90"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="max-w-2xl mx-auto px-4 py-3">
            {/* Time */}
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{formatTime(elapsed)}</span>
              <span className="text-center text-muted-foreground/60 text-xs">
                Section {currentIdx + 1} of {pdf.paragraphs.length}
              </span>
              <span>{formatTime(Math.max(0, totalEstimate - elapsed))}</span>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-4">
              {/* Left: voice */}
              <div className="flex-1 flex items-center">
                <VoiceSelector value={voice} onChange={changeVoice} />
              </div>

              {/* Center: transport */}
              <div className="flex items-center gap-3">
                <button
                  onClick={skipBack}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/40"
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
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/40"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Right: speed */}
              <div className="flex-1 flex items-center justify-end">
                <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
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

  // ── Upload / URL View ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-28 pb-24 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: expo }}
        >
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
            <p className="text-muted-foreground">Upload a PDF or paste a link — listen to any document like a podcast.</p>
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
                    dragOver
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border/50 bg-card hover:border-primary/50 hover:bg-primary/3"
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="font-semibold mb-1">Drop your PDF here</p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <Button variant="outline" size="sm" className="gap-2" type="button">
                    <Upload className="w-4 h-4" /> Choose PDF
                  </Button>
                  <p className="text-xs text-muted-foreground/60 mt-3">Max 30MB · Text-based PDFs only</p>
                </div>
                <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              </motion.div>
            ) : (
              <motion.div key="url" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="bg-card border border-border/50 rounded-2xl p-6 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary" /> PDF URL
                  </p>
                  <Input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    className="h-11"
                    onKeyDown={e => { if (e.key === "Enter") handleUrlLoad(); }}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Must be a direct link to a PDF file</p>
                </div>
                <Button onClick={handleUrlLoad} className="w-full gap-2" disabled={!urlInput.trim()}>
                  <BookOpen className="w-4 h-4" /> Load PDF
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {fetchError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-4 py-3"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{fetchError}</p>
            </motion.div>
          )}

          {/* Feature hints */}
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: "🎧", label: "Listen naturally", desc: "Natural voices, word-by-word highlight" },
              { icon: "⚡", label: "Speed control", desc: "0.5× to 2× playback speed" },
              { icon: "📖", label: "Any document", desc: "Reports, books, articles, papers" },
            ].map(f => (
              <div key={f.label} className="bg-card/60 border border-border/40 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{f.icon}</div>
                <p className="text-xs font-semibold">{f.label}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
