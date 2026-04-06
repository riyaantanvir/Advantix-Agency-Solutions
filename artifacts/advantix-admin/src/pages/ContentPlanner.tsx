import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, List,
  Edit2, Trash2, ExternalLink, X, Check, Clock,
  Hash, FileText, Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@workspace/api-client";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface ContentPlan {
  id: number;
  platform: string;
  title: string;
  description: string | null;
  content: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  post_url: string | null;
  tags: string | null;
  notes: string | null;
  created_at: string;
}

/* ─── Platform config ─────────────────────────────────────────────────────── */
const PLATFORMS = [
  { id: "reddit",    label: "Reddit",       color: "#FF4500", bg: "bg-[#FF4500]",  text: "text-[#FF4500]",  border: "border-[#FF4500]" },
  { id: "youtube",   label: "YouTube",      color: "#FF0000", bg: "bg-[#FF0000]",  text: "text-[#FF0000]",  border: "border-[#FF0000]" },
  { id: "pinterest", label: "Pinterest",    color: "#E60023", bg: "bg-[#E60023]",  text: "text-[#E60023]",  border: "border-[#E60023]" },
  { id: "x",         label: "X (Twitter)",  color: "#000000", bg: "bg-black",       text: "text-black dark:text-white", border: "border-black dark:border-white" },
  { id: "linkedin",  label: "LinkedIn",     color: "#0A66C2", bg: "bg-[#0A66C2]",  text: "text-[#0A66C2]",  border: "border-[#0A66C2]" },
  { id: "facebook",  label: "Facebook",     color: "#1877F2", bg: "bg-[#1877F2]",  text: "text-[#1877F2]",  border: "border-[#1877F2]" },
  { id: "blog",      label: "Website Blog", color: "#8B5CF6", bg: "bg-violet-500",  text: "text-violet-600",  border: "border-violet-500" },
];

const STATUSES = [
  { id: "planned",   label: "Planned",    variant: "outline"  as const },
  { id: "draft",     label: "Draft",      variant: "secondary" as const },
  { id: "published", label: "Published",  variant: "default"  as const },
  { id: "cancelled", label: "Cancelled",  variant: "destructive" as const },
];

function getPlatform(id: string) {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

function getStatusColor(status: string) {
  switch (status) {
    case "published":  return "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400";
    case "draft":      return "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "cancelled":  return "bg-red-100 text-red-600 border-red-300 dark:bg-red-900/30 dark:text-red-400";
    default:           return "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400";
  }
}

/* ─── Day names / helpers ─────────────────────────────────────────────────── */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/* ─── API helpers ─────────────────────────────────────────────────────────── */
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  EMPTY FORM                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
function emptyForm(defaultDate = "") {
  return {
    platform: "reddit",
    title: "",
    description: "",
    content: "",
    scheduledDate: defaultDate,
    scheduledTime: "",
    status: "planned",
    postUrl: "",
    tags: "",
    notes: "",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ADD / EDIT DIALOG                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PlanDialog({
  open,
  onClose,
  editing,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  editing: ContentPlan | null;
  defaultDate: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(() =>
    editing
      ? {
          platform: editing.platform,
          title: editing.title,
          description: editing.description ?? "",
          content: editing.content ?? "",
          scheduledDate: editing.scheduled_date,
          scheduledTime: editing.scheduled_time ?? "",
          status: editing.status,
          postUrl: editing.post_url ?? "",
          tags: editing.tags ?? "",
          notes: editing.notes ?? "",
        }
      : emptyForm(defaultDate)
  );

  const [origEditing] = useState(editing?.id);
  if (editing?.id !== origEditing) {
    // reset not possible without re-mount — handled by key in parent
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        platform: form.platform,
        title: form.title,
        description: form.description || null,
        content: form.content || null,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime || null,
        status: form.status,
        postUrl: form.postUrl || null,
        tags: form.tags || null,
        notes: form.notes || null,
      };
      if (editing) {
        return apiFetch(`/admin/content-plans/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch("/admin/content-plans", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-plans"] });
      toast({ title: editing ? "Post updated" : "Post added" });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Content Plan" : "Add Content Plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Platform + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input placeholder="Post title or topic…" value={form.title} onChange={set("title")} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Short Description</Label>
            <Input placeholder="Brief summary…" value={form.description} onChange={set("description")} />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Content / Caption</Label>
            <Textarea
              placeholder="Write your content here…"
              value={form.content}
              onChange={set("content")}
              className="min-h-[100px] resize-y"
            />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.scheduledDate} onChange={set("scheduledDate")} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time (optional)</Label>
              <Input type="time" value={form.scheduledTime} onChange={set("scheduledTime")} />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Tags</Label>
            <Input placeholder="marketing, seo, promotion (comma separated)…" value={form.tags} onChange={set("tags")} />
          </div>

          {/* Post URL */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Published Post URL</Label>
            <Input placeholder="https://…" value={form.postUrl} onChange={set("postUrl")} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea placeholder="Notes for your team…" value={form.notes} onChange={set("notes")} className="min-h-[60px] resize-y" />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.scheduledDate}>
              {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PLATFORM DOT / PILL (used in calendar cells)                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PostChip({ post, onClick }: { post: ContentPlan; onClick: () => void }) {
  const p = getPlatform(post.platform);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate w-full hover:opacity-80 transition-opacity"
      style={{ backgroundColor: p.color }}
      title={`${p.label}: ${post.title}`}
    >
      <span className="truncate">{post.title}</span>
      {post.status === "published" && <Check className="w-2.5 h-2.5 shrink-0" />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CALENDAR VIEW                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
function CalendarView({
  year,
  month,
  posts,
  onAddDay,
  onEdit,
}: {
  year: number;
  month: number;
  posts: ContentPlan[];
  onAddDay: (date: string) => void;
  onEdit: (p: ContentPlan) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const postsByDate = useMemo(() => {
    const map: Record<string, ContentPlan[]> = {};
    posts.forEach((p) => {
      if (!map[p.scheduled_date]) map[p.scheduled_date] = [];
      map[p.scheduled_date].push(p);
    });
    return map;
  }, [posts]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-muted/50">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-border">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`e-${idx}`} className="min-h-[90px] bg-muted/20" />;
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayPosts = postsByDate[dateStr] ?? [];
          const isToday = dateStr === today;

          return (
            <div
              key={dateStr}
              onClick={() => onAddDay(dateStr)}
              className="min-h-[90px] p-1 cursor-pointer hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}>
                  {day}
                </span>
                <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, 3).map((post) => (
                  <PostChip key={post.id} post={post} onClick={() => onEdit(post)} />
                ))}
                {dayPosts.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">
                    +{dayPosts.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LIST VIEW                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ListView({
  posts,
  onEdit,
  onDelete,
}: {
  posts: ContentPlan[];
  onEdit: (p: ContentPlan) => void;
  onDelete: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, ContentPlan[]> = {};
    posts.forEach((p) => {
      if (!map[p.scheduled_date]) map[p.scheduled_date] = [];
      map[p.scheduled_date].push(p);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [posts]);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No content planned</p>
        <p className="text-sm mt-1">Click "Add Post" to schedule your first piece of content.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([date, items]) => {
        const d = new Date(`${date}T00:00:00`);
        const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const today = todayStr();
        const isPast = date < today;
        const isToday = date === today;

        return (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`text-sm font-semibold px-3 py-1 rounded-full ${
                isToday ? "bg-primary text-primary-foreground" :
                isPast ? "bg-muted text-muted-foreground" :
                "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {isToday ? "Today" : label}
              </div>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{items.length} post{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2">
              {items.map((post) => {
                const platform = getPlatform(post.platform);
                return (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors group"
                  >
                    {/* Platform dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: platform.color }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold" style={{ color: platform.color }}>
                          {platform.label}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${getStatusColor(post.status)}`}>
                          {post.status}
                        </span>
                        {post.scheduled_time && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" /> {post.scheduled_time}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                      {post.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{post.description}</p>
                      )}
                      {post.tags && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {post.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                            <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {post.post_url && (
                        <a
                          href={post.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                          title="View live post"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => onEdit(post)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(post.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ContentPlanner() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editingPost, setEditingPost] = useState<ContentPlan | null>(null);
  const [defaultDate, setDefaultDate] = useState(todayStr());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  /* ── Fetch posts for current month ─── */
  const mk = monthKey(year, month);
  const { data: posts = [], isLoading } = useQuery<ContentPlan[]>({
    queryKey: ["content-plans", mk, filterPlatform, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams({ month: mk });
      if (filterPlatform !== "all") params.set("platform", filterPlatform);
      if (filterStatus !== "all") params.set("status", filterStatus);
      return apiFetch(`/admin/content-plans?${params}`);
    },
  });

  /* ── Delete mutation ─── */
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/content-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-plans"] });
      toast({ title: "Post deleted" });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  /* ── Helpers ─── */
  const openAdd = (date?: string) => {
    setEditingPost(null);
    setDefaultDate(date ?? todayStr());
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };
  const openEdit = (post: ContentPlan) => {
    setEditingPost(post);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  /* ── Stats ─── */
  const statsTotal = posts.length;
  const statsPublished = posts.filter((p) => p.status === "published").length;
  const statsPlanned = posts.filter((p) => p.status === "planned").length;
  const statsDraft = posts.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Content Planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan and track posts across all platforms
          </p>
        </div>
        <Button onClick={() => openAdd()} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Add Post
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: statsTotal, color: "text-foreground" },
          { label: "Planned", value: statsPlanned, color: "text-blue-600" },
          { label: "Published", value: statsPublished, color: "text-green-600" },
          { label: "Draft", value: statsDraft, color: "text-yellow-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold w-36 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-8 px-2" onClick={goToday}>
            Today
          </Button>
        </div>

        <div className="flex-1" />

        {/* Platform filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterPlatform("all")}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
              filterPlatform === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            All Platforms
          </button>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterPlatform(filterPlatform === p.id ? "all" : p.id)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium"
              style={{
                borderColor: filterPlatform === p.id ? p.color : undefined,
                backgroundColor: filterPlatform === p.id ? p.color : undefined,
                color: filterPlatform === p.id ? "#fff" : undefined,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: filterPlatform === p.id ? "#fff" : p.color }}
              />
              {p.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-1.5 transition-colors ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            title="Calendar view"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Platform legend */}
      <div className="flex flex-wrap gap-3">
        {PLATFORMS.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            {p.label}
          </div>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Calendar or List */}
      {!isLoading && viewMode === "calendar" && (
        <CalendarView
          year={year}
          month={month}
          posts={posts}
          onAddDay={openAdd}
          onEdit={openEdit}
        />
      )}

      {!isLoading && viewMode === "list" && (
        <ListView posts={posts} onEdit={openEdit} onDelete={setDeleteId} />
      )}

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <PlanDialog
          key={dialogKey}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingPost(null); }}
          editing={editingPost}
          defaultDate={defaultDate}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this content plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
