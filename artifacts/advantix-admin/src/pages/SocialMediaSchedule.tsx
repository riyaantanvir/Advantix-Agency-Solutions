import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, X, Send, Trash2, Clock,
  CheckCircle2, XCircle, Instagram, Facebook, Twitter, Youtube,
  Linkedin, Loader2, Pin, CalendarDays, ImageIcon, Type,
  AlertCircle, LayoutList, Upload, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API = "/api";

// ── platform config ──────────────────────────────────────────────────────────

const PLATFORMS = [
  { key: "instagram", label: "Instagram",   Icon: Instagram, dot: "bg-pink-500",   btn: "border-pink-500/40 data-[on=true]:bg-pink-500/15 data-[on=true]:border-pink-500 data-[on=true]:text-pink-400" },
  { key: "facebook",  label: "Facebook",    Icon: Facebook,  dot: "bg-blue-500",   btn: "border-blue-500/40 data-[on=true]:bg-blue-500/15 data-[on=true]:border-blue-500 data-[on=true]:text-blue-400" },
  { key: "twitter",   label: "X / Twitter", Icon: Twitter,   dot: "bg-sky-400",    btn: "border-sky-400/40 data-[on=true]:bg-sky-400/15 data-[on=true]:border-sky-400 data-[on=true]:text-sky-400" },
  { key: "linkedin",  label: "LinkedIn",    Icon: Linkedin,  dot: "bg-blue-700",   btn: "border-blue-700/40 data-[on=true]:bg-blue-700/15 data-[on=true]:border-blue-700 data-[on=true]:text-blue-400" },
  { key: "youtube",   label: "YouTube",     Icon: Youtube,   dot: "bg-red-500",    btn: "border-red-500/40 data-[on=true]:bg-red-500/15 data-[on=true]:border-red-500 data-[on=true]:text-red-400" },
  { key: "pinterest", label: "Pinterest",   Icon: Pin,       dot: "bg-rose-500",   btn: "border-rose-500/40 data-[on=true]:bg-rose-500/15 data-[on=true]:border-rose-500 data-[on=true]:text-rose-400" },
] as const;

type PlatformKey = typeof PLATFORMS[number]["key"];

type ScheduledPost = {
  id: number;
  platforms: string;
  content: string;
  imageUrl: string | null;
  scheduledAt: string;
  status: string;
  publishedAt: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
};

// ── date helpers ─────────────────────────────────────────────────────────────

function toYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function monthDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function defaultScheduledAt(selectedDay?: string | null) {
  const base = selectedDay ? parseLocalDate(selectedDay) : new Date();
  if (!selectedDay) base.setHours(base.getHours() + 1, 0, 0, 0);
  else base.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toYMD(base)}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  if (status === "pending")
    return <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400"><Clock className="w-3 h-3" />Scheduled</span>;
  if (status === "published")
    return <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400"><CheckCircle2 className="w-3 h-3" />Published</span>;
  if (status === "failed")
    return <span className="flex items-center gap-1 text-[10px] font-medium text-red-400"><XCircle className="w-3 h-3" />Failed</span>;
  return <span className="text-[10px] text-muted-foreground">{status}</span>;
}

// ── compose form (shared between both views) ─────────────────────────────────

function ComposeForm({
  selectedDay,
  onClose,
  onSuccess,
}: {
  selectedDay?: string | null;
  onClose?: () => void;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selPlatforms, setSelPlatforms] = useState<PlatformKey[]>([]);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduledAt(selectedDay));

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "Image must be under 15 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/smm/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setImageUrl(url);
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      fetch(`${API}/smm/scheduled`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smm-scheduled"] });
      setContent(""); setImageUrl(""); setSelPlatforms([]);
      setScheduledAt(defaultScheduledAt(selectedDay));
      toast({ title: "Post scheduled!" });
      onSuccess?.();
    },
    onError: () => toast({ title: "Failed to schedule", variant: "destructive" }),
  });

  function togglePlatform(key: PlatformKey) {
    setSelPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  }

  function handleSubmit() {
    if (!selPlatforms.length) { toast({ title: "Select at least one platform", variant: "destructive" }); return; }
    if (!content.trim()) { toast({ title: "Add some content", variant: "destructive" }); return; }
    createMutation.mutate({
      platforms: selPlatforms,
      content,
      imageUrl: imageUrl.trim() || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
  }

  return (
    <div className="flex flex-col h-full">
      {onClose && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <p className="text-sm font-semibold text-foreground">
            New Post
            {selectedDay && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {parseLocalDate(selectedDay).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Platforms */}
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 block">Platforms</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {PLATFORMS.map(({ key, label, Icon, btn }) => {
              const on = selPlatforms.includes(key);
              return (
                <button
                  key={key}
                  data-on={on}
                  onClick={() => togglePlatform(key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-medium transition-all",
                    "text-muted-foreground border-border/50 hover:border-border",
                    btn,
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label.split(" /")[0].split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 block flex items-center gap-1.5">
            <Type className="w-3 h-3" /> Content
          </Label>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your post content here… #hashtags @mentions"
            rows={5}
            className="resize-none text-sm bg-muted/20 border-border/50 focus:border-primary/50"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-muted-foreground/50">Twitter/X limit: 280 chars</span>
            <span className={cn("text-[11px] font-medium", content.length > 280 ? "text-red-400" : "text-muted-foreground/60")}>
              {content.length} / 280
            </span>
          </div>
        </div>

        {/* Image upload */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" /> Image <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">(optional)</span>
            </Label>
            <button
              onClick={() => setUrlMode(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors"
            >
              <Link2 className="w-3 h-3" />
              {urlMode ? "Use upload" : "Paste URL"}
            </button>
          </div>

          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />

          {urlMode ? (
            <Input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="text-sm bg-muted/20 border-border/50 focus:border-primary/50"
            />
          ) : imageUrl && !uploading ? (
            /* Preview */
            <div className="relative group rounded-xl overflow-hidden border border-border/50 bg-muted/20 h-36">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors"
                >
                  Change
                </button>
                <button
                  onClick={() => setImageUrl("")}
                  className="px-3 py-1.5 rounded-lg bg-red-500/60 text-white text-xs font-medium hover:bg-red-500/80 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            /* Drag & drop zone */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                dragOver
                  ? "border-primary bg-primary/8 scale-[1.01]"
                  : "border-border/40 bg-muted/10 hover:border-border hover:bg-muted/20",
                uploading && "pointer-events-none",
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Uploading…</span>
                </>
              ) : (
                <>
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                    dragOver ? "bg-primary/20" : "bg-muted/40",
                  )}>
                    <Upload className={cn("w-4 h-4 transition-colors", dragOver ? "text-primary" : "text-muted-foreground/60")} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-foreground/70">
                      {dragOver ? "Drop to upload" : "Drag & drop or click to browse"}
                    </p>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">PNG, JPG, GIF, WebP — max 15 MB</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Date & time */}
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 block">Schedule Date & Time</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="text-sm bg-muted/20 border-border/50 focus:border-primary/50"
          />
        </div>

        {/* Note */}
        <div className="flex gap-2 p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400/70 leading-relaxed">
            Note: Scheduled posts are stored here for reference. Auto-publishing requires a background job or webhook setup per platform's API requirements.
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-border/50 shrink-0">
        <Button
          className="w-full gap-2 h-9 text-sm"
          onClick={handleSubmit}
          disabled={createMutation.isPending || !selPlatforms.length || !content.trim()}
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Schedule Post
        </Button>
      </div>
    </div>
  );
}

// ── post card (shared) ────────────────────────────────────────────────────────

function PostCard({
  post,
  onCancel,
  onDelete,
}: {
  post: ScheduledPost;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const platformKeys = post.platforms.split(",").map(s => s.trim()) as PlatformKey[];
  const dt = new Date(post.scheduledAt);
  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="group rounded-xl border border-border/50 bg-card/40 p-3.5 hover:border-border transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {platformKeys.map(key => {
            const cfg = PLATFORMS.find(p => p.key === key);
            return cfg ? (
              <div key={key} className={cn("w-5 h-5 rounded-md flex items-center justify-center", cfg.dot)}>
                <cfg.Icon className="w-3 h-3 text-white" />
              </div>
            ) : null;
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{date} · {time}</span>
          <StatusChip status={post.status} />
        </div>
      </div>
      <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">{post.content}</p>
      {post.imageUrl && (
        <div className="mt-2 w-full h-14 rounded-lg overflow-hidden bg-muted/40">
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {post.status === "pending" && (
          <button
            onClick={() => onCancel(post.id)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-lg hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => onDelete(post.id)}
          className="ml-auto flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400 px-2 py-0.5 rounded-lg hover:bg-red-400/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

type ViewMode = "calendar" | "compose";

export default function SocialMediaSchedule() {
  const qc = useQueryClient();
  const today = new Date();

  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(toYMD(today));
  const [composing, setComposing] = useState(false);

  const { data: posts = [], isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["smm-scheduled"],
    queryFn: () => fetch(`${API}/smm/scheduled`, { credentials: "include" }).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/smm/scheduled/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smm-scheduled"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/smm/scheduled/${id}/cancel`, { method: "PATCH", credentials: "include" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smm-scheduled"] }),
  });

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      const d = new Date(p.scheduledAt);
      const ymd = toYMD(d);
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd)!.push(p);
    }
    return map;
  }, [posts]);

  const cells = useMemo(() => monthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedPosts = selectedDay ? (postsByDay.get(selectedDay) ?? []) : [];
  const pendingCount = posts.filter(p => p.status === "pending").length;
  const thisMonthCount = posts.filter(p => {
    const d = new Date(p.scheduledAt);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  }).length;

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0 -mx-6 -mt-2 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold tracking-tight text-foreground">Schedule Post</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span><span className="text-foreground font-semibold">{pendingCount}</span> pending</span>
            <span className="w-px h-3 bg-border" />
            <span><span className="text-foreground font-semibold">{thisMonthCount}</span> this month</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/50">
            <button
              onClick={() => { setViewMode("calendar"); setComposing(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                viewMode === "calendar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
            <button
              onClick={() => setViewMode("compose")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                viewMode === "compose"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutList className="w-3.5 h-3.5" /> Compose & Queue
            </button>
          </div>

          {viewMode === "calendar" && (
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setComposing(true)}>
              <Plus className="w-3.5 h-3.5" /> New Post
            </Button>
          )}
        </div>
      </div>

      {/* ── Calendar View ────────────────────────────────────────────────────── */}
      {viewMode === "calendar" && (
        <div className="flex flex-1 overflow-hidden">

          {/* Calendar grid */}
          <div className="flex-1 flex flex-col overflow-hidden px-6 py-4">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-base font-semibold text-foreground">
                {MONTHS[viewMonth]} <span className="text-muted-foreground font-normal">{viewYear}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDay(toYMD(today)); }}
                  className="h-7 px-3 text-[11px] font-medium rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Today
                </button>
                <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2 shrink-0">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground/50 pb-2">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 flex-1 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/30">
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="bg-background/30" />;
                const ymd = toYMD(day);
                const dayPosts = postsByDay.get(ymd) ?? [];
                const isToday = sameDay(day, today);
                const isSelected = ymd === selectedDay;
                const isCurrentMonth = day.getMonth() === viewMonth;
                const platformDots = [...new Set(dayPosts.flatMap(p => p.platforms.split(",").map(s => s.trim())))];

                return (
                  <div
                    key={ymd}
                    onClick={() => { setSelectedDay(ymd); setComposing(false); }}
                    className={cn(
                      "relative flex flex-col p-2 cursor-pointer transition-colors group",
                      "bg-background hover:bg-muted/20",
                      isSelected && "bg-primary/8 hover:bg-primary/10 ring-1 ring-inset ring-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium",
                        isToday && "bg-primary text-primary-foreground font-bold",
                        !isToday && isSelected && "text-primary font-semibold",
                        !isToday && !isSelected && isCurrentMonth && "text-foreground/80",
                        !isCurrentMonth && "text-muted-foreground/30",
                      )}>
                        {day.getDate()}
                      </span>
                      {dayPosts.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/50 font-medium">{dayPosts.length}</span>
                      )}
                    </div>

                    {platformDots.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mb-1">
                        {platformDots.slice(0, 5).map(key => {
                          const cfg = PLATFORMS.find(p => p.key === key);
                          return cfg ? <span key={key} className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} /> : null;
                        })}
                      </div>
                    )}

                    {dayPosts.slice(0, 2).map(post => (
                      <div
                        key={post.id}
                        className={cn(
                          "text-[10px] truncate px-1 py-0.5 rounded font-medium leading-tight mb-0.5",
                          post.status === "pending"   && "bg-amber-400/10 text-amber-400",
                          post.status === "published" && "bg-emerald-400/10 text-emerald-400",
                          post.status === "cancelled" && "bg-muted/40 text-muted-foreground",
                          post.status === "failed"    && "bg-red-400/10 text-red-400",
                        )}
                      >
                        {post.content.slice(0, 18)}…
                      </div>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="text-[10px] text-muted-foreground/50 px-1">+{dayPosts.length - 2} more</div>
                    )}

                    {/* Quick add hover btn */}
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedDay(ymd); setComposing(true); }}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md bg-primary/80 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 shrink-0">
              {[
                { color: "bg-amber-400",   label: "Scheduled" },
                { color: "bg-emerald-400", label: "Published" },
                { color: "bg-red-400",     label: "Failed" },
                { color: "bg-muted",       label: "Cancelled" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full", color)} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="w-72 border-l border-border/50 flex flex-col bg-background/50 shrink-0 overflow-hidden">
            {composing ? (
              <ComposeForm
                selectedDay={selectedDay}
                onClose={() => setComposing(false)}
                onSuccess={() => setComposing(false)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
                  <p className="text-sm font-semibold text-foreground">
                    {selectedDay
                      ? parseLocalDate(selectedDay).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      : "Select a day"}
                  </p>
                  {selectedDay && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setComposing(true)}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {isLoading ? (
                    <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : selectedPosts.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                        <CalendarDays className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">No posts for this day</p>
                      <button onClick={() => setComposing(true)} className="text-xs text-primary hover:underline mt-1">
                        + Schedule one
                      </button>
                    </div>
                  ) : (
                    selectedPosts.map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onCancel={id => cancelMutation.mutate(id)}
                        onDelete={id => deleteMutation.mutate(id)}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Compose & Queue View ──────────────────────────────────────────────── */}
      {viewMode === "compose" && (
        <div className="flex flex-1 overflow-hidden gap-0">

          {/* Left: Compose */}
          <div className="flex-1 border-r border-border/50 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border/50 shrink-0">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Compose Post
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Write once, schedule to multiple platforms at once.</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ComposeForm />
            </div>
          </div>

          {/* Right: Scheduled Queue */}
          <div className="w-[420px] shrink-0 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Scheduled Queue</p>
                <span className="text-xs text-muted-foreground">({pendingCount} pending)</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {isLoading ? (
                <div className="flex justify-center pt-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No posts scheduled yet</p>
                </div>
              ) : (
                posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onCancel={id => cancelMutation.mutate(id)}
                    onDelete={id => deleteMutation.mutate(id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
