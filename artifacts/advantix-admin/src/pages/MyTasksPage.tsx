import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search, Flag, MessageSquare, Loader2, CheckSquare,
  List, LayoutGrid, Calendar, Table2, GanttChartSquare,
  ChevronDown, ChevronRight, ChevronLeft, Repeat2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  clientName: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  tags: string | null;
  createdBy: string | null;
  projectId: number | null;
  projectName: string | null;
  commentCount: number;
  createdAt: string;
  isRecurring: boolean;
  recurrenceType: string | null;
  recurrenceTime: string | null;
};

const STATUSES = [
  { id: "todo", label: "To Do", dot: "#94a3b8", bg: "bg-slate-500/10", text: "text-slate-400" },
  { id: "in_progress", label: "In Progress", dot: "#3b82f6", bg: "bg-blue-500/10", text: "text-blue-400" },
  { id: "review", label: "In Review", dot: "#f59e0b", bg: "bg-amber-500/10", text: "text-amber-400" },
  { id: "done", label: "Done", dot: "#22c55e", bg: "bg-green-500/10", text: "text-green-400" },
  { id: "cancelled", label: "Cancelled", dot: "#ef4444", bg: "bg-red-500/10", text: "text-red-400" },
];

const PRIORITIES: Record<string, { color: string; fill: boolean }> = {
  low: { color: "#94a3b8", fill: false },
  medium: { color: "#3b82f6", fill: false },
  high: { color: "#f97316", fill: true },
  urgent: { color: "#ef4444", fill: true },
};

type ViewMode = "list" | "board" | "calendar" | "table" | "gantt";

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "list", label: "List", icon: <List className="w-3.5 h-3.5" /> },
  { id: "board", label: "Board", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="w-3.5 h-3.5" /> },
  { id: "gantt", label: "Gantt", icon: <GanttChartSquare className="w-3.5 h-3.5" /> },
  { id: "table", label: "Table", icon: <Table2 className="w-3.5 h-3.5" /> },
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function AssigneeAvatar({ name }: { name: string | null }) {
  if (!name) return null;
  const palette = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f97316", "#14b8a6"];
  const bg = palette[name.charCodeAt(0) % palette.length];
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: bg }}>
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

/* ─── BOARD VIEW ─────────────────────────────────────────────── */
function BoardView({ grouped, onMoveTask, navigate }: {
  grouped: Record<string, Task[]>;
  onMoveTask: (taskId: number, newStatus: string) => void;
  navigate: (path: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, taskId: number) { setDraggingId(taskId); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("taskId", String(taskId)); }
  function handleDragEnd() { setDraggingId(null); setDragOver(null); }
  function handleDragOver(e: React.DragEvent, statusId: string) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(statusId); }
  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    if (taskId && draggingId !== null) {
      const task = Object.values(grouped).flat().find(t => t.id === taskId);
      if (task && task.status !== statusId) onMoveTask(taskId, statusId);
    }
    setDraggingId(null); setDragOver(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
      {STATUSES.map(status => {
        const items = grouped[status.id] ?? [];
        const isOver = dragOver === status.id;
        return (
          <div key={status.id}
            className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 bg-card overflow-hidden transition-colors duration-150 ${isOver ? "border-primary/60 bg-primary/5" : "border-border"}`}
            onDragOver={e => handleDragOver(e, status.id)}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
            onDrop={e => handleDrop(e, status.id)}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-secondary/20">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.dot }} />
              <span className="text-sm font-semibold text-foreground">{status.label}</span>
              <span className="text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
            </div>
            {isOver && <div className="mx-2 mt-2 h-1.5 rounded-full bg-primary/40 animate-pulse" />}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map(task => {
                const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
                const isDragging = draggingId === task.id;
                return (
                  <div key={task.id} draggable
                    onDragStart={e => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !isDragging && navigate(`/tasks/${task.id}`)}
                    className={`bg-background border rounded-lg p-3 transition-all select-none ${isDragging ? "opacity-40 border-primary scale-95 cursor-grabbing shadow-lg" : "border-border cursor-grab hover:border-primary/40 hover:shadow-sm active:cursor-grabbing"}`}
                  >
                    <p className={`text-sm font-medium leading-snug mb-2 ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                    {task.clientName && <p className="text-xs text-muted-foreground mb-2 truncate">{task.clientName}</p>}
                    {task.isRecurring && (
                      <div className="flex items-center gap-1 mb-2">
                        <Repeat2 className="w-3 h-3 text-primary/70" />
                        <span className="text-[10px] text-primary/70 font-medium">Daily{task.recurrenceTime ? ` · ${task.recurrenceTime}` : ""}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3 shrink-0" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} />
                        {task.dueDate && <DueDateCell date={task.dueDate} done={task.status === "done"} />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(task.commentCount ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-muted-foreground">
                            <MessageSquare className="w-3 h-3" />
                            <span className="text-xs">{task.commentCount}</span>
                          </span>
                        )}
                        <AssigneeAvatar name={task.assignedTo} />
                      </div>
                    </div>
                    {task.tags && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {task.tags.split(",").slice(0, 2).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{tag.trim()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50">No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── LIST VIEW ──────────────────────────────────────────────── */
function ListView({ grouped, navigate }: { grouped: Record<string, Task[]>; navigate: (path: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="grid px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border bg-secondary/20"
        style={{ gridTemplateColumns: "1fr 72px 108px 100px 56px" }}>
        <span className="pl-10">Name</span>
        <span className="text-center">Assignee</span>
        <span>Due Date</span>
        <span>Priority</span>
        <span></span>
      </div>
      {STATUSES.map(status => {
        const items = grouped[status.id] ?? [];
        const isCollapsed = collapsed.has(status.id);
        return (
          <div key={status.id} className="border-b border-border/40 last:border-b-0">
            <button onClick={() => toggle(status.id)} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.dot }} />
              <span className="text-sm font-semibold text-foreground">{status.label}</span>
              <span className="text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
            </button>
            {!isCollapsed && items.map(task => {
              const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
              return (
                <div key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}
                  className="grid items-center px-4 py-2.5 border-t border-border/25 hover:bg-secondary/20 cursor-pointer transition-colors"
                  style={{ gridTemplateColumns: "1fr 72px 108px 100px 56px" }}>
                  <div className="flex items-center gap-2 pl-10 min-w-0">
                    <span className={`text-sm truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</span>
                    {task.isRecurring && (
                      <span className="flex items-center gap-0.5 text-primary/70 shrink-0">
                        <Repeat2 className="w-3 h-3" />
                        {task.recurrenceTime && <span className="text-[10px]">{task.recurrenceTime}</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center"><AssigneeAvatar name={task.assignedTo} /></div>
                  <DueDateCell date={task.dueDate} done={task.status === "done"} />
                  <div className="flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} />
                    <span className="text-xs text-muted-foreground capitalize">{task.priority}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {(task.commentCount ?? 0) > 0 && (<><MessageSquare className="w-3.5 h-3.5" /><span className="text-xs">{task.commentCount}</span></>)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─── CALENDAR VIEW ──────────────────────────────────────────── */
function CalendarView({ tasks, navigate }: { tasks: Task[]; navigate: (path: string) => void }) {
  const [offset, setOffset] = useState(0);
  const base = new Date(); base.setMonth(base.getMonth() + offset); base.setDate(1);
  const year = base.getFullYear(); const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const byDate: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (t.dueDate) { const k = new Date(t.dueDate).toISOString().slice(0, 10); (byDate[k] = byDate[k] ?? []).push(t); }
  }
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={() => setOffset(o => o - 1)} className="p-1 rounded hover:bg-secondary/40"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-semibold">{monthName}</span>
        <button onClick={() => setOffset(o => o + 1)} className="p-1 rounded hover:bg-secondary/40"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const key = day ? `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : "";
          const dayTasks = key ? (byDate[key] ?? []) : [];
          const isToday = day !== null && new Date().toISOString().slice(0,10) === key;
          return (
            <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-border/30 ${!day ? "bg-secondary/5" : ""}`}>
              {day && <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{day}</span>}
              {dayTasks.slice(0, 2).map(t => (
                <div key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}
                  className="text-[10px] truncate px-1 py-0.5 rounded mb-0.5 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: (PRIORITIES[t.priority] ?? PRIORITIES.medium).color + "22", color: (PRIORITIES[t.priority] ?? PRIORITIES.medium).color }}>
                  {t.title}
                </div>
              ))}
              {dayTasks.length > 2 && <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 2}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── GANTT VIEW ─────────────────────────────────────────────── */
function GanttView({ tasks, navigate }: { tasks: Task[]; navigate: (path: string) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d; });
  const cellW = 36;
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="flex">
        <div className="w-52 shrink-0 border-r border-border bg-secondary/10 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</div>
        <div className="flex overflow-x-auto">
          {days.map((d, i) => (
            <div key={i} className={`shrink-0 text-center text-[10px] py-2.5 border-r border-border/30 font-medium ${d.toDateString() === today.toDateString() ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
              style={{ width: cellW }}>{d.getDate()}</div>
          ))}
        </div>
      </div>
      {tasks.map(task => {
        const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
        const start = task.dueDate ? Math.max(0, Math.floor((new Date(task.dueDate).getTime() - today.getTime()) / 86400000)) : -1;
        const width = cellW * 3;
        return (
          <div key={task.id} className="flex border-t border-border/20 hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
            <div className="w-52 shrink-0 border-r border-border/30 px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUSES.find(s => s.id === task.status)?.dot ?? "#94a3b8" }} />
              <span className="text-xs truncate text-foreground">{task.title}</span>
            </div>
            <div className="flex relative" style={{ width: cellW * 30 }}>
              {days.map((_, i) => <div key={i} className="shrink-0 border-r border-border/10" style={{ width: cellW }} />)}
              {start >= 0 && start < 30 && (
                <div style={{ position: "absolute", left: start * cellW + 2, width: width - 4, top: "50%", transform: "translateY(-50%)", height: 24, backgroundColor: p.color + "33", borderLeft: `3px solid ${p.color}`, borderRadius: 4 }}
                  className="flex items-center px-1.5 cursor-pointer hover:opacity-80 z-10 relative">
                  <span className="text-[10px] truncate font-medium" style={{ color: p.color }}>{task.title}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── TABLE VIEW ─────────────────────────────────────────────── */
function TableView({ tasks, navigate }: { tasks: Task[]; navigate: (path: string) => void }) {
  const [sortKey, setSortKey] = useState<keyof Task>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sorted = [...tasks].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const Col = ({ k, label }: { k: keyof Task; label: string }) => (
    <th onClick={() => { setSortKey(k); setSortDir(d => k === sortKey ? (d === "asc" ? "desc" : "asc") : "asc"); }}
      className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap">
      {label}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/20">
            <tr>
              <Col k="title" label="Title" />
              <Col k="status" label="Status" />
              <Col k="priority" label="Priority" />
              <Col k="assignedTo" label="Assignee" />
              <Col k="dueDate" label="Due" />
              <Col k="clientName" label="Client" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(task => {
              const s = STATUSES.find(x => x.id === task.status) ?? STATUSES[0];
              const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
              return (
                <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}
                  className="border-t border-border/25 hover:bg-secondary/20 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium truncate max-w-xs ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</span>
                      {task.isRecurring && <Repeat2 className="w-3 h-3 text-primary/70 shrink-0" />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text} font-medium`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />{s.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1">
                      <Flag className="w-3 h-3" style={{ color: p.color, fill: p.fill ? p.color : "none" }} />
                      <span className="text-xs capitalize" style={{ color: p.color }}>{task.priority}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><AssigneeAvatar name={task.assignedTo} /></td>
                  <td className="px-4 py-2.5"><DueDateCell date={task.dueDate} done={task.status === "done"} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.clientName ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────────── */
export default function MyTasksPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("my-tasks-view") as ViewMode) ?? "board");
  const [search, setSearch] = useState("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["pm-my-tasks"],
    queryFn: () => apiFetch(`/api/admin/pm/my-tasks`),
    staleTime: 15_000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiFetch(`/api/admin/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-my-tasks"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.assignedTo?.toLowerCase().includes(q) ||
      t.tags?.toLowerCase().includes(q)
    ) : tasks;
  }, [tasks, search]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s.id] = [];
    for (const t of filteredTasks) { (map[t.status] ?? map.todo).push(t); }
    return map;
  }, [filteredTasks]);

  function changeView(v: ViewMode) { setView(v); localStorage.setItem("my-tasks-view", v); }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (tasks.length === 0) return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">All tasks you are involved in</p>
      </div>
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CheckSquare className="w-7 h-7 text-primary" />
        </div>
        <p className="text-muted-foreground">No tasks assigned to you yet.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} task{tasks.length !== 1 ? "s" : ""} you're involved in</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks…"
            className="pl-9 w-56 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => changeView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              view === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {v.icon}{v.label}
          </button>
        ))}
      </div>

      {/* Views */}
      {view === "list" && <ListView grouped={grouped} navigate={navigate} />}
      {view === "board" && (
        <BoardView
          grouped={grouped}
          onMoveTask={(taskId, status) => moveMutation.mutate({ taskId, status })}
          navigate={navigate}
        />
      )}
      {view === "calendar" && <CalendarView tasks={filteredTasks} navigate={navigate} />}
      {view === "gantt" && <GanttView tasks={filteredTasks} navigate={navigate} />}
      {view === "table" && <TableView tasks={filteredTasks} navigate={navigate} />}
    </div>
  );
}
