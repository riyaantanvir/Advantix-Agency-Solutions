import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Share2, Instagram, Facebook, Twitter, Youtube, Linkedin,
  Heart, MessageCircle, Eye, Users, Globe, Settings2, CalendarDays,
  Loader2, WifiOff, TrendingUp, Pin, BarChart2, ArrowUpRight,
  ExternalLink, ChevronLeft, ChevronRight, Plus, X, Send, Trash2,
  Clock, CheckCircle2, XCircle, ImageIcon, Type, AlertCircle,
  Upload, Link2, LayoutList, LogIn, Save, Eye as EyeIcon, EyeOff, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useToolsUser } from "@/context/ToolsUserContext";
import { cn } from "@/lib/utils";
import { SEO } from "@/components/SEO";

const API = "/api";

// ── platform config ───────────────────────────────────────────────────────────

const PLATFORMS = [
  { key: "instagram", label: "Instagram",   Icon: Instagram, color: "from-pink-500 to-rose-500",   textColor: "text-pink-400",  dot: "bg-pink-500",   btn: "border-pink-500/40 data-[on=true]:bg-pink-500/15 data-[on=true]:border-pink-500 data-[on=true]:text-pink-400" },
  { key: "facebook",  label: "Facebook",    Icon: Facebook,  color: "from-blue-600 to-blue-500",   textColor: "text-blue-400",  dot: "bg-blue-500",   btn: "border-blue-500/40 data-[on=true]:bg-blue-500/15 data-[on=true]:border-blue-500 data-[on=true]:text-blue-400" },
  { key: "twitter",   label: "X / Twitter", Icon: Twitter,   color: "from-sky-400 to-sky-500",     textColor: "text-sky-400",   dot: "bg-sky-400",    btn: "border-sky-400/40 data-[on=true]:bg-sky-400/15 data-[on=true]:border-sky-400 data-[on=true]:text-sky-400" },
  { key: "linkedin",  label: "LinkedIn",    Icon: Linkedin,  color: "from-blue-700 to-blue-600",   textColor: "text-blue-500",  dot: "bg-blue-700",   btn: "border-blue-700/40 data-[on=true]:bg-blue-700/15 data-[on=true]:border-blue-700 data-[on=true]:text-blue-400" },
  { key: "youtube",   label: "YouTube",     Icon: Youtube,   color: "from-red-500 to-red-600",     textColor: "text-red-400",   dot: "bg-red-500",    btn: "border-red-500/40 data-[on=true]:bg-red-500/15 data-[on=true]:border-red-500 data-[on=true]:text-red-400" },
  { key: "pinterest", label: "Pinterest",   Icon: Pin,       color: "from-rose-500 to-pink-600",   textColor: "text-rose-400",  dot: "bg-rose-500",   btn: "border-rose-500/40 data-[on=true]:bg-rose-500/15 data-[on=true]:border-rose-500 data-[on=true]:text-rose-400" },
] as const;
type PlatformKey = typeof PLATFORMS[number]["key"];

// ── types ─────────────────────────────────────────────────────────────────────

type RecentPost = {
  id: string; content: string; imageUrl?: string;
  likes: number; comments: number; views: number;
  date: string; url?: string;
};
type PlatformData =
  | { connected: false }
  | { connected: true; username?: string; displayName?: string; followers: number; totalPosts: number; recentPosts: RecentPost[] };
type PlatformsResponse = { facebook: PlatformData; instagram: PlatformData; twitter: PlatformData; linkedin: PlatformData; youtube: PlatformData; pinterest: PlatformData };
type TrafficResponse = { platforms: Record<string, number>; total: number };
type ScheduledPost = { id: number; platforms: string; content: string; imageUrl: string | null; scheduledAt: string; status: string; publishedAt: string | null; errorMessage: string | null; createdBy: string | null; createdAt: string };

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined | null): string {
  const num = Number(n ?? 0);
  if (!isFinite(num)) return "0";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

// ── sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  if (status === "pending") return <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400"><Clock className="w-3 h-3" />Scheduled</span>;
  if (status === "published") return <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400"><CheckCircle2 className="w-3 h-3" />Published</span>;
  if (status === "failed") return <span className="flex items-center gap-1 text-[10px] font-medium text-red-400"><XCircle className="w-3 h-3" />Failed</span>;
  if (status === "cancelled") return <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><XCircle className="w-3 h-3" />Cancelled</span>;
  return <span className="text-[10px] text-muted-foreground">{status}</span>;
}

function PlatformCard({ cfg, data, traffic, onGoToSettings }: { cfg: typeof PLATFORMS[number]; data: PlatformData; traffic: number; onGoToSettings?: () => void }) {
  const { Icon, label, color, textColor } = cfg;
  if (!data.connected) {
    return (
      <Card className="p-5 flex flex-col gap-3 border-dashed opacity-70 hover:opacity-90 transition-opacity">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center opacity-40`}>
            <Icon className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Add your API keys in the{" "}
          <button onClick={onGoToSettings} className="text-primary hover:underline font-medium">Settings tab</button>
          {" "}to connect {label}.
        </p>
      </Card>
    );
  }
  const handle = data.username ?? data.displayName ?? label;
  return (
    <Card className="p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
          <Icon className="w-[18px] h-[18px] text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{label}</p>
          <p className={`text-xs font-medium ${textColor} truncate`}>{handle}</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10">Live</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[["Followers", data.followers], ["Posts", data.totalPosts], ["Referrals", traffic]].map(([l, v]) => (
          <div key={l as string} className="bg-muted/40 rounded-lg px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{l}</p>
            <p className="text-base font-bold text-foreground mt-0.5">{fmtNum(v as number)}</p>
          </div>
        ))}
      </div>
      {data.recentPosts[0] && (
        <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/80">Last post: </span>
          {data.recentPosts[0].content || "(no caption)"}
        </div>
      )}
    </Card>
  );
}

function PostCard({ post, onCancel, onDelete }: { post: ScheduledPost; onCancel: (id: number) => void; onDelete: (id: number) => void }) {
  const platformKeys = post.platforms.split(",").map(s => s.trim()) as PlatformKey[];
  const dt = new Date(post.scheduledAt);
  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="group rounded-xl border border-border/50 bg-card/40 p-3.5 hover:border-border transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {platformKeys.map(key => { const cfg = PLATFORMS.find(p => p.key === key); return cfg ? (
            <div key={key} className={cn("w-5 h-5 rounded-md flex items-center justify-center", cfg.dot)}>
              <cfg.Icon className="w-3 h-3 text-white" />
            </div>) : null; })}
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
      {post.createdBy && <p className="text-[10px] text-muted-foreground/50 mt-1">by {post.createdBy}</p>}
      <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {post.status === "pending" && (
          <button onClick={() => onCancel(post.id)} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-lg hover:bg-muted/40 transition-colors">Cancel</button>
        )}
        <button onClick={() => onDelete(post.id)} className="ml-auto flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400 px-2 py-0.5 rounded-lg hover:bg-red-400/10 transition-colors">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── Compose Form ──────────────────────────────────────────────────────────────

function ComposeForm({ selectedDay, onClose, onSuccess }: { selectedDay?: string | null; onClose?: () => void; onSuccess?: () => void }) {
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
    if (!file.type.startsWith("image/")) { toast({ title: "Only image files are allowed", variant: "destructive" }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ title: "Image must be under 15 MB", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/tools/smm/upload`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setImageUrl(url);
    } catch { toast({ title: "Image upload failed", variant: "destructive" }); }
    finally { setUploading(false); }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }, [handleFile]);

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      fetch(`${API}/tools/smm/scheduled`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools-smm-scheduled"] });
      setContent(""); setImageUrl(""); setSelPlatforms([]); setScheduledAt(defaultScheduledAt(selectedDay));
      toast({ title: "Post scheduled!" }); onSuccess?.();
    },
    onError: () => toast({ title: "Failed to schedule", variant: "destructive" }),
  });

  function togglePlatform(key: PlatformKey) { setSelPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]); }

  function handleSubmit() {
    if (!selPlatforms.length) { toast({ title: "Select at least one platform", variant: "destructive" }); return; }
    if (!content.trim()) { toast({ title: "Add some content", variant: "destructive" }); return; }
    createMutation.mutate({ platforms: selPlatforms, content, imageUrl: imageUrl.trim() || undefined, scheduledAt: new Date(scheduledAt).toISOString() });
  }

  return (
    <div className="flex flex-col h-full">
      {onClose && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <p className="text-sm font-semibold text-foreground">
            New Post
            {selectedDay && <span className="ml-2 text-xs font-normal text-muted-foreground">{parseLocalDate(selectedDay).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 block">Platforms</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {PLATFORMS.map(({ key, label, Icon, btn }) => {
              const on = selPlatforms.includes(key);
              return (
                <button key={key} data-on={on} onClick={() => togglePlatform(key)}
                  className={cn("flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-medium transition-all text-muted-foreground border-border/50 hover:border-border", btn)}>
                  <Icon className="w-4 h-4" /> {label.split(" /")[0].split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 flex items-center gap-1.5">
            <Type className="w-3 h-3" /> Content
          </Label>
          <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write your post content here… #hashtags @mentions" rows={5} className="resize-none text-sm bg-muted/20 border-border/50 focus:border-primary/50" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-muted-foreground/50">Twitter/X limit: 280 chars</span>
            <span className={cn("text-[11px] font-medium", content.length > 280 ? "text-red-400" : "text-muted-foreground/60")}>{content.length} / 280</span>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" /> Image <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">(optional)</span>
            </Label>
            <button onClick={() => setUrlMode(v => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors">
              <Link2 className="w-3 h-3" /> {urlMode ? "Use upload" : "Paste URL"}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          {urlMode ? (
            <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="text-sm bg-muted/20 border-border/50 focus:border-primary/50" />
          ) : imageUrl && !uploading ? (
            <div className="relative group rounded-xl overflow-hidden border border-border/50 bg-muted/20 h-36">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors">Change</button>
                <button onClick={() => setImageUrl("")} className="px-3 py-1.5 rounded-lg bg-red-500/60 text-white text-xs font-medium hover:bg-red-500/80 transition-colors">Remove</button>
              </div>
            </div>
          ) : (
            <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={cn("flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                dragOver ? "border-primary bg-primary/8 scale-[1.01]" : "border-border/40 bg-muted/10 hover:border-border hover:bg-muted/20",
                uploading && "pointer-events-none")}>
              {uploading ? (
                <><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Uploading…</span></>
              ) : (
                <><div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", dragOver ? "bg-primary/20" : "bg-muted/40")}>
                    <Upload className={cn("w-4 h-4", dragOver ? "text-primary" : "text-muted-foreground/60")} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-foreground/70">{dragOver ? "Drop to upload" : "Drag & drop or click to browse"}</p>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">PNG, JPG, GIF, WebP — max 15 MB</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-semibold mb-2.5 block">Schedule Date & Time</Label>
          <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="text-sm bg-muted/20 border-border/50 focus:border-primary/50" />
        </div>
        <div className="flex gap-2 p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-400/70 leading-relaxed">
            Scheduled posts are saved and will be auto-published when the platform API is connected and the time arrives.
          </p>
        </div>
      </div>
      <div className="p-4 border-t border-border/50 shrink-0">
        <Button className="w-full gap-2 h-9 text-sm" onClick={handleSubmit} disabled={createMutation.isPending || !selPlatforms.length || !content.trim()}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Schedule Post
        </Button>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ onGoToSettings }: { onGoToSettings?: () => void }) {
  const { data: platforms, isLoading } = useQuery<PlatformsResponse>({
    queryKey: ["tools-smm-platforms"],
    queryFn: async () => {
      const r = await fetch(`${API}/tools/smm/platforms`, { credentials: "include" });
      if (!r.ok) return { facebook: { connected: false }, instagram: { connected: false }, twitter: { connected: false }, linkedin: { connected: false }, youtube: { connected: false }, pinterest: { connected: false } } as PlatformsResponse;
      return r.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: traffic } = useQuery<TrafficResponse>({
    queryKey: ["tools-smm-traffic"],
    queryFn: async () => {
      const r = await fetch(`${API}/tools/smm/traffic`, { credentials: "include" });
      if (!r.ok) return { platforms: {}, total: 0 };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const connectedCount = platforms ? Object.values(platforms).filter(p => p.connected).length : 0;
  const totalFollowers = platforms ? Object.values(platforms).reduce((s, p) => s + (p.connected ? p.followers : 0), 0) : 0;

  const allPosts: (RecentPost & { platform: string })[] = [];
  if (platforms) {
    for (const [key, data] of Object.entries(platforms)) {
      if (data.connected) for (const post of data.recentPosts) allPosts.push({ ...post, platform: key });
    }
    allPosts.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Followers", icon: Users, value: isLoading ? null : fmtNum(totalFollowers) },
          { label: "Social Traffic", icon: TrendingUp, value: traffic ? fmtNum(traffic.total) : "—" },
          { label: "Platforms Connected", icon: Share2, value: `${connectedCount} / 6` },
          { label: "Recent Posts", icon: BarChart2, value: fmtNum(allPosts.length) },
        ].map(({ label, icon: Icon, value }) => (
          <Card key={label} className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <Icon className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <span className="text-2xl font-bold text-foreground">
              {value === null ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
            </span>
          </Card>
        ))}
      </div>

      {/* Platform cards */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" /> Platform Overview
        </h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {PLATFORMS.map(cfg => (
              <PlatformCard key={cfg.key} cfg={cfg} data={platforms?.[cfg.key] ?? { connected: false }} traffic={traffic?.platforms[cfg.key] ?? 0} onGoToSettings={onGoToSettings} />
            ))}
          </div>
        )}
      </div>

      {/* Traffic breakdown */}
      {traffic && traffic.total > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Website Traffic from Social (last 30 days)
          </h2>
          <Card className="p-5">
            <div className="space-y-3">
              {PLATFORMS.filter(p => (traffic.platforms[p.key] ?? 0) > 0)
                .sort((a, b) => (traffic.platforms[b.key] ?? 0) - (traffic.platforms[a.key] ?? 0))
                .map(p => {
                  const count = traffic.platforms[p.key] ?? 0;
                  const pct = traffic.total > 0 ? (count / traffic.total) * 100 : 0;
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center shrink-0`}>
                        <p.Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm text-foreground w-24 shrink-0">{p.label}</span>
                      <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${p.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-foreground w-14 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}

      {/* Recent posts */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" /> Recent Posts
        </h2>
        {allPosts.length === 0 ? (
          <Card className="p-10 text-center">
            <WifiOff className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No posts loaded yet. Platforms need to be connected by admin.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border/60">
            {allPosts.slice(0, 20).map((post, i) => {
              const cfg = PLATFORMS.find(p => p.key === post.platform);
              return (
                <div key={`${post.id}-${i}`} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : cfg ? (
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center shrink-0`}>
                      <cfg.Icon className="w-5 h-5 text-white" />
                    </div>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{post.content || <span className="italic text-muted-foreground">(no caption)</span>}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {cfg && <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.label}</span>}
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{post.date}</span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-pink-400" />{fmtNum(post.likes)}</span>
                    <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-sky-400" />{fmtNum(post.comments)}</span>
                    {post.views > 0 && <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-emerald-400" />{fmtNum(post.views)}</span>}
                    {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 hover:text-primary transition-colors" /></a>}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────

function ScheduleTab() {
  const qc = useQueryClient();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(toYMD(today));
  const [composing, setComposing] = useState(false);

  const { data: posts = [], isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["tools-smm-scheduled"],
    queryFn: async () => {
      const r = await fetch(`${API}/tools/smm/scheduled`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`${API}/tools/smm/scheduled/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools-smm-scheduled"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => fetch(`${API}/tools/smm/scheduled/${id}/cancel`, { method: "PATCH", credentials: "include" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools-smm-scheduled"] }),
  });

  const postsByDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      const ymd = toYMD(new Date(p.scheduledAt));
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd)!.push(p);
    }
    return map;
  }, [posts]);

  const cells = useMemo(() => monthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedPosts = selectedDay ? (postsByDay.get(selectedDay) ?? []) : [];
  const pendingCount = posts.filter(p => p.status === "pending").length;

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">
      {/* Calendar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-foreground w-36 text-center">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <span className="text-xs text-muted-foreground"><span className="text-foreground font-semibold">{pendingCount}</span> pending</span>
        </div>

        <div className="grid grid-cols-7 gap-px mb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border/20 rounded-xl overflow-hidden border border-border/20">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="aspect-square bg-card/30" />;
            const ymd = toYMD(day);
            const dayPosts = postsByDay.get(ymd) ?? [];
            const isToday = sameDay(day, today);
            const isSelected = selectedDay === ymd;
            return (
              <button key={i} onClick={() => { setSelectedDay(ymd); setComposing(false); }}
                className={cn("aspect-square flex flex-col items-center justify-start p-1.5 transition-colors text-left bg-card/30 hover:bg-muted/30",
                  isSelected && "bg-primary/10 hover:bg-primary/15",
                  day.getMonth() !== viewMonth && "opacity-30")}>
                <span className={cn("text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full",
                  isToday ? "bg-primary text-primary-foreground" : isSelected ? "text-primary" : "text-foreground")}>
                  {day.getDate()}
                </span>
                {dayPosts.length > 0 && (
                  <div className="flex flex-wrap gap-px mt-0.5">
                    {dayPosts.slice(0, 3).map((p, j) => {
                      const pKeys = p.platforms.split(",") as PlatformKey[];
                      const cfg = PLATFORMS.find(pl => pl.key === pKeys[0]);
                      return <div key={j} className={cn("w-1.5 h-1.5 rounded-full", cfg?.dot ?? "bg-primary")} />;
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="lg:w-80 flex flex-col border border-border/50 rounded-2xl overflow-hidden bg-card/30">
        {composing ? (
          <ComposeForm selectedDay={selectedDay} onClose={() => setComposing(false)} onSuccess={() => setComposing(false)} />
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
              <p className="text-sm font-semibold text-foreground">
                {selectedDay ? parseLocalDate(selectedDay).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Posts"}
              </p>
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setComposing(true)}>
                <Plus className="w-3.5 h-3.5" /> New Post
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : selectedPosts.length === 0 ? (
                <div className="text-center py-10">
                  <CalendarDays className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No posts for this day</p>
                  <button onClick={() => setComposing(true)} className="mt-3 text-xs text-primary hover:underline">+ Schedule a post</button>
                </div>
              ) : (
                selectedPosts.map(post => (
                  <PostCard key={post.id} post={post} onCancel={id => cancelMutation.mutate(id)} onDelete={id => deleteMutation.mutate(id)} />
                ))
              )}
            </div>
            {/* All posts list */}
            {posts.length > 0 && selectedPosts.length === 0 && (
              <div className="border-t border-border/50 p-3 space-y-2 max-h-64 overflow-y-auto">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide font-semibold px-1 pb-1">All Upcoming</p>
                {posts.filter(p => p.status === "pending").slice(0, 10).map(post => (
                  <PostCard key={post.id} post={post} onCancel={id => cancelMutation.mutate(id)} onDelete={id => deleteMutation.mutate(id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

type PlatformConfig = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string; helpText?: string }>;
};

const PLATFORM_SETTINGS: PlatformConfig[] = [
  {
    label: "Meta (Facebook & Instagram)",
    Icon: Facebook,
    color: "from-blue-600 to-blue-500",
    description: "One access token covers both Facebook Pages and Instagram Business accounts.",
    fields: [
      { key: "SMM_META_ACCESS_TOKEN", label: "Page Access Token", placeholder: "EAAxxxxx…", helpText: "From Meta Business Suite → Settings → Advanced" },
      { key: "SMM_META_PAGE_ID", label: "Facebook Page ID", placeholder: "123456789", helpText: "Found in your Facebook Page settings" },
      { key: "SMM_META_IG_USER_ID", label: "Instagram User ID", placeholder: "987654321", helpText: "From the Instagram Graph API explorer" },
    ],
  },
  {
    label: "X / Twitter",
    Icon: Twitter,
    color: "from-sky-400 to-sky-500",
    description: "Use Bearer Token for reading data. For posting you'll need OAuth 2.0 credentials.",
    fields: [
      { key: "SMM_TWITTER_BEARER_TOKEN", label: "Bearer Token", placeholder: "AAAA…", helpText: "From developer.twitter.com → Project → Keys" },
      { key: "SMM_TWITTER_USER_ID", label: "Twitter User ID (numeric)", placeholder: "1234567890", helpText: "Not your @handle — the numeric ID" },
    ],
  },
  {
    label: "LinkedIn",
    Icon: Linkedin,
    color: "from-blue-700 to-blue-600",
    description: "LinkedIn API requires an app with Marketing Developer Platform access.",
    fields: [
      { key: "SMM_LINKEDIN_ACCESS_TOKEN", label: "Access Token", placeholder: "AQV…", helpText: "OAuth 2.0 access token from LinkedIn Developer" },
      { key: "SMM_LINKEDIN_ORG_ID", label: "Organization ID (optional)", placeholder: "12345", helpText: "Leave blank for personal profile" },
    ],
  },
  {
    label: "YouTube",
    Icon: Youtube,
    color: "from-red-500 to-red-600",
    description: "YouTube Data API v3. Create an API key in Google Cloud Console.",
    fields: [
      { key: "SMM_YOUTUBE_API_KEY", label: "API Key", placeholder: "AIzaSy…", helpText: "Google Cloud Console → APIs → YouTube Data API v3" },
      { key: "SMM_YOUTUBE_CHANNEL_ID", label: "Channel ID", placeholder: "UCxxxxxx", helpText: "From your YouTube channel settings" },
    ],
  },
  {
    label: "Pinterest",
    Icon: Pin,
    color: "from-rose-500 to-pink-600",
    description: "Pinterest API v5. Create an app at developers.pinterest.com.",
    fields: [
      { key: "SMM_PINTEREST_ACCESS_TOKEN", label: "Access Token", placeholder: "pina_xxxxx", helpText: "From Pinterest Developer portal → Apps" },
    ],
  },
];

function SettingsField({ fieldKey, label, placeholder, helpText, initialValue, onSave }: {
  fieldKey: string; label: string; placeholder: string; helpText?: string;
  initialValue: string; onSave: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [show, setShow] = useState(false);
  const isMasked = value.startsWith("••••");
  const hasValue = initialValue !== "";
  const isDirty = value !== initialValue;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-foreground/80">{label}</label>
        {hasValue && !isDirty && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Connected
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show || !isMasked ? "text" : "password"}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-9 text-sm bg-muted/20 border-border/50 focus:border-primary/50 font-mono"
          />
          {value && (
            <button type="button" onClick={() => setShow(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {isDirty && (
          <Button size="sm" className="h-9 px-3 shrink-0" onClick={() => onSave(fieldKey, value)}>
            <Save className="w-3.5 h-3.5" />
          </Button>
        )}
        {hasValue && !isDirty && (
          <Button size="sm" variant="outline" className="h-9 px-3 shrink-0 text-red-400 border-red-400/30 hover:bg-red-400/10 hover:border-red-400/60"
            onClick={() => { setValue(""); onSave(fieldKey, ""); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      {helpText && (
        <p className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/60">
          <Info className="w-3 h-3 shrink-0" />{helpText}
        </p>
      )}
    </div>
  );
}

type TestResult = { ok: boolean; message: string };

function SettingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, TestResult | "loading">>({});

  const { data, isLoading } = useQuery<{ settings: Record<string, string>; connected: string[] }>({
    queryKey: ["tools-smm-settings"],
    queryFn: async () => {
      const r = await fetch(`${API}/tools/smm/settings`, { credentials: "include" });
      if (!r.ok) return { settings: {}, connected: [] };
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      fetch(`${API}/tools/smm/settings`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools-smm-settings"] });
      qc.invalidateQueries({ queryKey: ["tools-smm-platforms"] });
      toast({ title: "Settings saved!" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  async function handleTest(platformKey: string) {
    setTestResults(prev => ({ ...prev, [platformKey]: "loading" }));
    try {
      const r = await fetch(`${API}/tools/smm/test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformKey }),
      });
      const result: TestResult = await r.json();
      setTestResults(prev => ({ ...prev, [platformKey]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [platformKey]: { ok: false, message: "Network error" } }));
    }
  }

  function handleSave(key: string, value: string) {
    saveMutation.mutate({ [key]: value });
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  const settings = data?.settings ?? {};
  const connectedCount = data?.connected?.length ?? 0;

  // Map PLATFORM_SETTINGS label → test platform key
  const platformKeyMap: Record<string, string> = {
    "Meta (Facebook & Instagram)": "facebook",
    "X / Twitter": "twitter",
    "LinkedIn": "linkedin",
    "YouTube": "youtube",
    "Pinterest": "pinterest",
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your credentials are private.</span>{" "}
          Keys are stored securely and only used to fetch data for your account. Other users cannot see your tokens.
          {connectedCount > 0 && <span className="ml-1 text-emerald-400 font-medium">{connectedCount} platform{connectedCount !== 1 ? "s" : ""} connected.</span>}
        </div>
      </div>

      {/* Platform sections */}
      {PLATFORM_SETTINGS.map(({ label, Icon, color, description, fields }) => {
        const platKey = platformKeyMap[label] ?? label.toLowerCase();
        const testResult = testResults[platKey];
        const hasAnyKey = fields.some(f => !!(settings[f.key]));

        return (
          <Card key={label} className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md shrink-0 mt-0.5`}>
                <Icon className="w-[18px] h-[18px] text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  {hasAnyKey && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs gap-1.5 border-border/50"
                      disabled={testResult === "loading"}
                      onClick={() => handleTest(platKey)}
                    >
                      {testResult === "loading" ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</>
                      ) : (
                        <><CheckCircle2 className="w-3 h-3" /> Test Connection</>
                      )}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>

                {/* Test result */}
                {testResult && testResult !== "loading" && (
                  <div className={cn(
                    "flex items-start gap-2 mt-2.5 p-2.5 rounded-lg text-xs font-medium",
                    testResult.ok
                      ? "bg-emerald-400/10 border border-emerald-400/20 text-emerald-400"
                      : "bg-red-400/10 border border-red-400/20 text-red-400"
                  )}>
                    {testResult.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 pt-1 border-t border-border/30">
              {fields.map(({ key, label: fieldLabel, placeholder, helpText }) => (
                <SettingsField
                  key={key}
                  fieldKey={key}
                  label={fieldLabel}
                  placeholder={placeholder}
                  helpText={helpText}
                  initialValue={settings[key] ?? ""}
                  onSave={handleSave}
                />
              ))}
            </div>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground/50 pb-6">
        After saving keys, click "Test Connection" to verify they work. Then check the Overview tab for live data.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "schedule" | "settings";

export default function SocialMediaTool() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Share2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Social Media Manager</h1>
          <p className="text-muted-foreground mb-8">Sign in to schedule posts, view analytics, and manage your social media presence.</p>
          <Link href="/login">
            <Button className="gap-2"><LogIn className="w-4 h-4" /> Sign In to Continue</Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-16">
      <SEO
        title="Social Media Manager — Advantix Tools"
        description="Schedule and manage your social media posts across Instagram, Facebook, Twitter, LinkedIn, YouTube, and Pinterest."
        canonical="/tools/social-media"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Share2 className="w-6 h-6 text-primary" />
              Social Media Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Schedule posts and view your social media performance.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-1 border border-border/30 w-fit mb-8">
          {([
            { id: "overview",  label: "Overview",      icon: BarChart2 },
            { id: "schedule",  label: "Schedule Post", icon: CalendarDays },
            { id: "settings",  label: "Settings",      icon: Settings2 },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview" ? <OverviewTab onGoToSettings={() => setTab("settings")} /> : tab === "schedule" ? <ScheduleTab /> : <SettingsTab />}
      </div>
    </div>
  );
}
