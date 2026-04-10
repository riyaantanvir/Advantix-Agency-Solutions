import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, Search, ChevronDown, ChevronRight, Flag, MessageSquare, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  clientName: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  tags: string | null;
  createdBy: string | null;
  projectId: number | null;
  commentCount: number;
  createdAt: string;
};

const STATUSES = [
  { id: "todo", label: "To Do", dot: "#94a3b8" },
  { id: "in_progress", label: "In Progress", dot: "#3b82f6" },
  { id: "review", label: "In Review", dot: "#f59e0b" },
  { id: "done", label: "Done", dot: "#22c55e" },
  { id: "cancelled", label: "Cancelled", dot: "#ef4444" },
];

const PRIORITIES: Record<string, { color: string; fill: boolean }> = {
  low: { color: "#94a3b8", fill: false },
  medium: { color: "#3b82f6", fill: false },
  high: { color: "#f97316", fill: true },
  urgent: { color: "#ef4444", fill: true },
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function AssigneeAvatar({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted-foreground text-xs">—</span>;
  const palette = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f97316", "#14b8a6"];
  const bg = palette[name.charCodeAt(0) % palette.length];
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
      {name[0].toUpperCase()}
    </div>
  );
}

function DueDateCell({ date, done }: { date: string | null; done: boolean }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const d = new Date(date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = d < today && !done;
  const isToday = d.toDateString() === today.toDateString();
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-muted-foreground"}`}>
      {label}
    </span>
  );
}

export default function Tasks() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const addInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["admin-tasks"],
    queryFn: () => apiFetch(`${BASE}/api/admin/tasks`),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (d: { title: string; status: string }) =>
      apiFetch(`${BASE}/api/admin/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tasks"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.assignedTo?.toLowerCase().includes(q) ||
      t.tags?.toLowerCase().includes(q)
    ) : tasks;
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s.id] = [];
    for (const t of list) { (map[t.status] ?? map.todo).push(t); }
    return map;
  }, [tasks, search]);

  function toggle(id: string) {
    setCollapsed(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function startAdd(statusId: string) {
    setAddingTo(statusId);
    setNewTitle("");
    setTimeout(() => addInputRef.current?.focus(), 60);
  }

  function commit(statusId: string) {
    if (newTitle.trim()) createMutation.mutate({ title: newTitle.trim(), status: statusId });
    setAddingTo(null);
    setNewTitle("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input className="pl-8 w-48 h-8 text-sm rounded-lg" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => navigate("/tasks/new")}>
            <Plus className="w-4 h-4 mr-1.5" /> New Task
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        {/* Column headers */}
        <div
          className="grid px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border bg-secondary/20"
          style={{ gridTemplateColumns: "1fr 72px 108px 100px 56px" }}
        >
          <span className="pl-10">Name</span>
          <span className="text-center">Assignee</span>
          <span>Due Date</span>
          <span>Priority</span>
          <span></span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          STATUSES.map(status => {
            const items = grouped[status.id] ?? [];
            const isCollapsed = collapsed.has(status.id);
            return (
              <div key={status.id} className="border-b border-border/40 last:border-b-0">
                {/* Group header */}
                <button
                  onClick={() => toggle(status.id)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/30 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.dot }} />
                  <span className="text-sm font-semibold text-foreground">{status.label}</span>
                  <span className="text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
                </button>

                {!isCollapsed && (
                  <>
                    {items.map(task => {
                      const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
                      return (
                        <div
                          key={task.id}
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="grid items-center px-4 py-2.5 border-t border-border/25 hover:bg-secondary/20 cursor-pointer transition-colors group"
                          style={{ gridTemplateColumns: "1fr 72px 108px 100px 56px" }}
                        >
                          <div className="flex items-center gap-2 pl-10 min-w-0">
                            <span className={`text-sm truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {task.title}
                            </span>
                            {task.tags && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0 hidden group-hover:inline">
                                {task.tags.split(",")[0].trim()}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-center">
                            <AssigneeAvatar name={task.assignedTo} />
                          </div>
                          <DueDateCell date={task.dueDate} done={task.status === "done"} />
                          <div className="flex items-center gap-1.5">
                            <Flag className="w-3.5 h-3.5" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} />
                            <span className="text-xs text-muted-foreground capitalize">{task.priority}</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            {(task.commentCount ?? 0) > 0 && (
                              <>
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span className="text-xs">{task.commentCount}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline add */}
                    {addingTo === status.id ? (
                      <div className="flex items-center gap-2 px-4 py-2 border-t border-border/25 bg-secondary/10">
                        <div className="pl-10 flex-1">
                          <Input
                            ref={addInputRef}
                            className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 p-0"
                            placeholder="Task title… Enter to save"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commit(status.id);
                              if (e.key === "Escape") setAddingTo(null);
                            }}
                          />
                        </div>
                        <button onClick={() => commit(status.id)} className="text-xs text-primary font-medium hover:underline">Save</button>
                        <button onClick={() => setAddingTo(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startAdd(status.id)}
                        className="w-full flex items-center gap-2 px-4 py-2 border-t border-border/25 text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 ml-10" />
                        <span className="text-xs">Add Task</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
