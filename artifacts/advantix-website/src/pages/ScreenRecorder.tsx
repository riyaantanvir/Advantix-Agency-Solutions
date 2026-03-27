import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Video, Square, Download, Trash2, ArrowLeft, Monitor,
  Mic, MicOff, Play, Clock, AlertCircle, CheckCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToolsUser } from "@/context/ToolsUserContext";

const expo = [0.22, 1, 0.36, 1] as const;
const MAX_SECONDS = 10 * 60; // 10 minutes

/* ── Best codec / mime type ─────────────────────────── */
function getBestMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function getFileExtension(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Floating live indicator ────────────────────────── */
function LiveIndicator({ elapsed, onStop }: { elapsed: number; onStop: () => void }) {
  const remaining = MAX_SECONDS - elapsed;
  const pct = elapsed / MAX_SECONDS;
  const urgent = remaining < 60;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="fixed bottom-24 right-5 z-[200] flex items-center gap-3 bg-card border border-border/60 shadow-2xl rounded-2xl px-4 py-3 cursor-pointer group hover:border-destructive/40 transition-colors"
      onClick={onStop}
      title="Click to stop recording"
    >
      {/* Pulsing red dot */}
      <span className="relative flex w-3 h-3 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${urgent ? "bg-orange-400" : "bg-red-500"}`} />
        <span className={`relative inline-flex rounded-full w-3 h-3 ${urgent ? "bg-orange-500" : "bg-red-500"}`} />
      </span>

      <div className="text-left">
        <p className="text-xs font-bold text-foreground leading-none mb-0.5">Recording</p>
        <p className={`text-xs font-mono tabular-nums leading-none ${urgent ? "text-orange-400" : "text-muted-foreground"}`}>
          {fmtTime(elapsed)} / {fmtTime(MAX_SECONDS)}
        </p>
      </div>

      {/* Progress ring */}
      <div className="relative w-8 h-8 shrink-0">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
          <circle
            cx="16" cy="16" r="12" fill="none"
            stroke={urgent ? "#f97316" : "#ef4444"}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 12}`}
            strokeDashoffset={`${2 * Math.PI * 12 * (1 - pct)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <Square className="absolute inset-0 m-auto w-3 h-3 text-destructive group-hover:text-red-400 transition-colors" />
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════ */
type State = "idle" | "requesting" | "recording" | "stopped";

export default function ScreenRecorder() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();

  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [withAudio, setWithAudio] = useState(true);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Auth guard */
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading]);

  /* Cleanup on unmount */
  useEffect(() => () => {
    stopTimer();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, []);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const stopRecording = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= MAX_SECONDS) {
          stopRecording();
          return MAX_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  }, [stopRecording]);

  const startRecording = async () => {
    setError("");
    setState("requesting");
    setBlob(null);
    setBlobUrl(null);
    setElapsed(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } } as MediaTrackConstraints,
        audio: true,
      });

      if (withAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) displayStream.addTrack(audioTrack);
        } catch { /* audio permission denied - continue without */ }
      }

      stream = displayStream;
    } catch (err: any) {
      setState("idle");
      if (err?.name === "NotAllowedError") {
        setError("Screen sharing permission was denied. Please allow it and try again.");
      } else {
        setError("Could not start screen capture. Make sure you are on a supported browser (Chrome, Edge, Firefox).");
      }
      return;
    }

    streamRef.current = stream;

    const mime = getBestMimeType();
    setMimeType(mime);

    const recorder = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 2_500_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      setState("stopped");
      const recorded = new Blob(chunksRef.current, { type: mime || "video/webm" });
      setBlob(recorded);
      setBlobUrl(URL.createObjectURL(recorded));
    };

    /* Stop if user ends share via browser UI */
    stream.getVideoTracks()[0].onended = () => {
      if (recorder.state !== "inactive") stopRecording();
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setState("recording");
    startTimer();
  };

  const handleStop = () => stopRecording();

  const handleDownload = () => {
    if (!blobUrl || !blob) return;
    const ext = getFileExtension(mimeType);
    const name = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${ext}`;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    a.click();
  };

  const handleDiscard = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setElapsed(0);
    setError("");
    setState("idle");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">

        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <Link href="/tools">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Advantix Tools
            </button>
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: expo }}
          className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Video className="w-7 h-7 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">Screen Recorder</h1>
            <p className="text-muted-foreground mt-0.5">Record your screen, no software needed</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ── IDLE / REQUESTING ───────────────────────── */}
          {(state === "idle" || state === "requesting") && (
            <motion.div key="idle" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: expo }}>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { icon: Clock, label: "10 min max", color: "text-purple-400", bg: "bg-purple-500/10" },
                  { icon: Monitor, label: "Screen + Audio", color: "text-blue-400", bg: "bg-blue-500/10" },
                  { icon: Download, label: "Best format", color: "text-green-400", bg: "bg-green-500/10" },
                ].map(({ icon: Icon, label, color, bg }) => (
                  <Card key={label} className="p-4 text-center border-border/40">
                    <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                  </Card>
                ))}
              </div>

              {/* Main recording card */}
              <Card className="p-8 border-border/50 bg-card text-center mb-4">
                <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-6">
                  <motion.div
                    animate={state === "requesting" ? { scale: [1, 1.08, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Video className="w-10 h-10 text-purple-400" />
                  </motion.div>
                </div>

                <h2 className="text-xl font-display font-bold mb-2">Ready to Record</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Click Start and choose which screen, window, or tab to record.
                  Recording stops automatically after 10 minutes.
                </p>

                {/* Audio toggle */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <button
                    onClick={() => setWithAudio(!withAudio)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${withAudio
                      ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                      : "border-border/50 text-muted-foreground hover:border-border"}`}
                  >
                    {withAudio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {withAudio ? "Microphone On" : "Microphone Off"}
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3 mb-5 text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full h-14 text-base font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20 gap-3"
                  onClick={startRecording}
                  disabled={state === "requesting"}
                >
                  {state === "requesting" ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for permission…</>
                  ) : (
                    <><span className="w-3 h-3 rounded-full bg-red-400" /> Start Recording</>
                  )}
                </Button>
              </Card>

              <p className="text-xs text-center text-muted-foreground">
                Works best on Chrome or Edge. Screen sharing uses browser-native APIs — nothing is uploaded to any server.
              </p>
            </motion.div>
          )}

          {/* ── RECORDING ───────────────────────────────── */}
          {state === "recording" && (
            <motion.div key="recording" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: expo }}>
              <Card className="p-8 border-purple-500/30 bg-card text-center">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 relative">
                  <span className="absolute w-full h-full rounded-full bg-red-500/20 animate-ping" />
                  <Video className="w-10 h-10 text-red-400" />
                </div>

                <h2 className="text-xl font-display font-bold mb-1">Recording in Progress</h2>
                <p className="text-4xl font-mono font-bold tabular-nums text-red-400 mt-4 mb-2">{fmtTime(elapsed)}</p>
                <p className="text-sm text-muted-foreground mb-8">{fmtTime(MAX_SECONDS - elapsed)} remaining</p>

                {/* Progress bar */}
                <div className="w-full h-2 bg-secondary rounded-full mb-8 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${elapsed / MAX_SECONDS > 0.8 ? "bg-orange-400" : "bg-red-500"}`}
                    style={{ width: `${(elapsed / MAX_SECONDS) * 100}%` }}
                  />
                </div>

                <Button
                  size="lg"
                  variant="destructive"
                  className="w-full h-14 text-base font-semibold gap-3"
                  onClick={handleStop}
                >
                  <Square className="w-5 h-5 fill-current" /> Stop Recording
                </Button>
              </Card>
            </motion.div>
          )}

          {/* ── STOPPED / PREVIEW ───────────────────────── */}
          {state === "stopped" && blobUrl && blob && (
            <motion.div key="stopped" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: expo }}>

              <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-400">Recording Complete</p>
                  <p className="text-xs text-muted-foreground">{fmtTime(elapsed)} recorded · {fmtBytes(blob.size)} · {getFileExtension(mimeType).toUpperCase()}</p>
                </div>
              </div>

              {/* Video preview */}
              <Card className="overflow-hidden border-border/50 mb-6">
                <video
                  src={blobUrl}
                  controls
                  className="w-full max-h-80 bg-black"
                  playsInline
                />
              </Card>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="flex-1 h-12 font-semibold bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20 gap-2"
                  onClick={handleDownload}
                >
                  <Download className="w-5 h-5" />
                  Download {getFileExtension(mimeType).toUpperCase()}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-5 gap-2"
                  onClick={handleDiscard}
                >
                  <Trash2 className="w-4 h-4" />
                  Discard
                </Button>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Privacy:</strong> Your recording is stored only in your browser memory and is never uploaded to any server.
                  It is deleted when you close this tab or click Discard.
                </p>
              </div>

              <div className="mt-4 text-center">
                <button onClick={handleDiscard} className="text-sm text-primary hover:underline">
                  Record again →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating live indicator (shown while recording) */}
      <AnimatePresence>
        {state === "recording" && (
          <LiveIndicator elapsed={elapsed} onStop={handleStop} />
        )}
      </AnimatePresence>
    </div>
  );
}
