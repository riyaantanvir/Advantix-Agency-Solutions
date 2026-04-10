import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, Search, ChevronDown, ChevronRight, Flag, MessageSquare, Loader2,
  List, LayoutGrid, Calendar, Table2, GanttChartSquare, ChevronLeft,
  UserCircle2, CalendarDays, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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
  if (!name) return <span className="text-muted-foreground text-xs">—</span>;
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

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES[priority] ?? PRIORITIES.medium;
  return (
    <span className="flex items-center gap-1">
      <Flag className="w-3 h-3" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} />
      <span className="text-xs capitalize" style={{ color: p.color }}>{priority}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.id === status) ?? STATUSES[0];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text} font-medium`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}

/* ─── LIST VIEW ──────────────────────────────────────────────── */
function ListView({
  grouped, collapsed, toggle, addingTo, newTitle, setNewTitle, addInputRef, startAdd, commit, navigate,
}: {
  grouped: Record<string, Task[]>;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  addingTo: string | null;
  newTitle: string;
  setNewTitle: (v: string) => void;
  addInputRef: React.RefObject<HTMLInputElement>;
  startAdd: (s: string) => void;
  commit: (s: string) => void;
  navigate: (path: string) => void;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
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
      {STATUSES.map(status => {
        const items = grouped[status.id] ?? [];
        const isCollapsed = collapsed.has(status.id);
        return (
          <div key={status.id} className="border-b border-border/40 last:border-b-0">
            <button
              onClick={() => toggle(status.id)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/30 transition-colors"
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
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
                      <div className="flex justify-center"><AssigneeAvatar name={task.assignedTo} /></div>
                      <DueDateCell date={task.dueDate} done={task.status === "done"} />
                      <div className="flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} />
                        <span className="text-xs text-muted-foreground capitalize">{task.priority}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {(task.commentCount ?? 0) > 0 && (
                          <><MessageSquare className="w-3.5 h-3.5" /><span className="text-xs">{task.commentCount}</span></>
                        )}
                      </div>
                    </div>
                  );
                })}
                {addingTo === status.id ? (
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-border/25 bg-secondary/10">
                    <div className="pl-10 flex-1">
                      <Input
                        ref={addInputRef}
                        className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 p-0"
                        placeholder="Task title… Enter to save"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commit(status.id); if (e.key === "Escape") startAdd(""); }}
                      />
                    </div>
                    <button onClick={() => commit(status.id)} className="text-xs text-primary font-medium hover:underline">Save</button>
                    <button onClick={() => startAdd("")} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => startAdd(status.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 border-t border-border/25 text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 ml-10" /><span className="text-xs">Add Task</span>
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── QUICK CREATE CARD (Board) ──────────────────────────────── */
function QuickCreateCard({
  statusId,
  onSave,
  onCancel,
}: {
  statusId: string;
  onSave: (data: { title: string; assignedTo?: string; dueDate?: string; priority?: string }) => void;
  onCancel: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [openPicker, setOpenPicker] = useState<"assignee" | "date" | "priority" | null>(null);

  const { data: admins = [] } = useQuery<{ id: number; username: string }[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch(`/api/admin/admins`),
    staleTime: 60_000,
  });

  function save() {
    if (!title.trim()) return;
    onSave({ title: title.trim(), assignedTo: assignedTo || undefined, dueDate: dueDate || undefined, priority: priority || undefined });
  }

  const togglePicker = (p: "assignee" | "date" | "priority") =>
    setOpenPicker(prev => (prev === p ? null : p));

  const selectedPriority = priority ? PRIORITIES[priority] : null;

  return (
    <div className="bg-background border border-primary/50 rounded-xl shadow-md overflow-visible">
      {/* Title row */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <input
          ref={titleRef}
          autoFocus
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          placeholder="Task Name…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        />
        <button
          onClick={save}
          disabled={!title.trim()}
          className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-lg font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
        >
          <Send className="w-3 h-3" /> Save
        </button>
      </div>

      {/* Field buttons */}
      <div className="px-3 pb-2 space-y-0.5 relative">
        {/* Assignee */}
        <div className="relative">
          <button
            onClick={() => togglePicker("assignee")}
            className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-secondary/30 transition-colors text-left"
          >
            <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={`text-xs ${assignedTo ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {assignedTo || "Add assignee"}
            </span>
          </button>
          {openPicker === "assignee" && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-36 py-1 max-h-40 overflow-y-auto">
              <button
                onClick={() => { setAssignedTo(""); setOpenPicker(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40"
              >
                None
              </button>
              {admins.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setAssignedTo(a.username); setOpenPicker(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/40 flex items-center gap-2 ${assignedTo === a.username ? "text-primary font-medium" : "text-foreground"}`}
                >
                  <AssigneeAvatar name={a.username} />
                  {a.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date */}
        <div className="relative">
          <button
            onClick={() => togglePicker("date")}
            className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-secondary/30 transition-colors text-left"
          >
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={`text-xs ${dueDate ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {dueDate ? new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Add dates"}
            </span>
          </button>
          {openPicker === "date" && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2">
              <input
                type="date"
                autoFocus
                className="bg-transparent text-xs text-foreground outline-none border border-border rounded px-2 py-1"
                value={dueDate}
                onChange={e => { setDueDate(e.target.value); setOpenPicker(null); }}
              />
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="relative">
          <button
            onClick={() => togglePicker("priority")}
            className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-secondary/30 transition-colors text-left"
          >
            <Flag
              className="w-3.5 h-3.5 shrink-0"
              style={selectedPriority
                ? { color: selectedPriority.color, fill: selectedPriority.fill ? selectedPriority.color : "none", strokeWidth: 2 }
                : { color: "var(--muted-foreground)" }}
            />
            <span className={`text-xs capitalize ${priority ? "font-medium" : "text-muted-foreground"}`}
              style={selectedPriority ? { color: selectedPriority.color } : undefined}>
              {priority || "Add priority"}
            </span>
          </button>
          {openPicker === "priority" && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-32 py-1">
              {["low", "medium", "high", "urgent"].map(pr => {
                const pc = PRIORITIES[pr];
                return (
                  <button
                    key={pr}
                    onClick={() => { setPriority(pr); setOpenPicker(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/40 flex items-center gap-2 capitalize ${priority === pr ? "font-semibold" : ""}`}
                  >
                    <Flag className="w-3 h-3" style={{ color: pc.color, fill: pc.fill ? pc.color : "none", strokeWidth: 2 }} />
                    <span style={{ color: pc.color }}>{pr}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── BOARD VIEW ─────────────────────────────────────────────── */
function BoardView({
  grouped,
  onCreateTask,
  navigate,
}: {
  grouped: Record<string, Task[]>;
  onCreateTask: (status: string, data: { title: string; assignedTo?: string; dueDate?: string; priority?: string }) => void;
  navigate: (path: string) => void;
}) {
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
      {STATUSES.map(status => {
        const items = grouped[status.id] ?? [];
        return (
          <div key={status.id} className="flex-shrink-0 w-72 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-secondary/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.dot }} />
                <span className="text-sm font-semibold text-foreground">{status.label}</span>
                <span className="text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">{items.length}</span>
              </div>
              <button
                onClick={() => setAddingTo(status.id)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map(task => {
                const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;
                return (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="bg-background border border-border rounded-lg p-3 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group"
                  >
                    <p className={`text-sm font-medium leading-snug mb-2 ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {task.title}
                    </p>
                    {task.clientName && (
                      <p className="text-xs text-muted-foreground mb-2 truncate">{task.clientName}</p>
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
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Quick create card */}
              {addingTo === status.id ? (
                <QuickCreateCard
                  statusId={status.id}
                  onSave={data => { onCreateTask(status.id, data); setAddingTo(null); }}
                  onCancel={() => setAddingTo(null)}
                />
              ) : (
                <button
                  onClick={() => setAddingTo(status.id)}
                  className="w-full flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/30 px-2 py-1.5 rounded-lg transition-colors text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Task
                </button>
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

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [tasks, sortKey, sortDir]);

  function handleSort(key: keyof Task) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const cols: { key: keyof Task; label: string; w: string }[] = [
    { key: "title", label: "Name", w: "flex-1 min-w-48" },
    { key: "status", label: "Status", w: "w-32" },
    { key: "assignedTo", label: "Assignee", w: "w-28" },
    { key: "dueDate", label: "Due Date", w: "w-28" },
    { key: "priority", label: "Priority", w: "w-24" },
    { key: "type", label: "Type", w: "w-24" },
    { key: "clientName", label: "Client", w: "w-36" },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-stretch border-b border-border bg-secondary/20 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {cols.map(col => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className={`${col.w} px-3 py-2.5 text-left flex items-center gap-1 hover:text-foreground hover:bg-secondary/30 transition-colors border-r border-border/40 last:border-r-0`}
          >
            {col.label}
            {sortKey === col.key && <span className="text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>}
          </button>
        ))}
        <div className="w-16 px-3 py-2.5 shrink-0"></div>
      </div>

      {/* Rows */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No tasks found</div>
      ) : (
        sorted.map(task => (
          <div
            key={task.id}
            onClick={() => navigate(`/tasks/${task.id}`)}
            className="flex items-center border-b border-border/30 last:border-b-0 hover:bg-secondary/20 cursor-pointer transition-colors group"
          >
            <div className="flex-1 min-w-48 px-3 py-2.5 border-r border-border/20">
              <span className={`text-sm truncate block ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </span>
            </div>
            <div className="w-32 px-3 py-2.5 border-r border-border/20">
              <StatusBadge status={task.status} />
            </div>
            <div className="w-28 px-3 py-2.5 border-r border-border/20">
              <div className="flex items-center gap-1.5">
                <AssigneeAvatar name={task.assignedTo} />
                <span className="text-xs text-muted-foreground truncate">{task.assignedTo ?? "—"}</span>
              </div>
            </div>
            <div className="w-28 px-3 py-2.5 border-r border-border/20">
              <DueDateCell date={task.dueDate} done={task.status === "done"} />
            </div>
            <div className="w-24 px-3 py-2.5 border-r border-border/20">
              <PriorityBadge priority={task.priority} />
            </div>
            <div className="w-24 px-3 py-2.5 border-r border-border/20">
              <span className="text-xs text-muted-foreground capitalize">{task.type ?? "—"}</span>
            </div>
            <div className="w-36 px-3 py-2.5 border-r border-border/20">
              <span className="text-xs text-muted-foreground truncate block">{task.clientName ?? "—"}</span>
            </div>
            <div className="w-16 px-3 py-2.5 flex items-center gap-1 text-muted-foreground shrink-0">
              {(task.commentCount ?? 0) > 0 && (
                <><MessageSquare className="w-3.5 h-3.5" /><span className="text-xs">{task.commentCount}</span></>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── CALENDAR VIEW ──────────────────────────────────────────── */
function CalendarView({ tasks, navigate }: { tasks: Task[]; navigate: (path: string) => void }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = t.dueDate.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
        <button
          onClick={() => setMonth(new Date(year, mon - 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">{monthName}</span>
        <button
          onClick={() => setMonth(new Date(year, mon + 1, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/40 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="min-h-24 border-r border-b border-border/30 last:border-r-0 bg-secondary/5" />;
          }
          const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayTasks = tasksByDate[dateStr] ?? [];
          const isToday = new Date(year, mon, day).toDateString() === today.toDateString();
          return (
            <div key={day} className={`min-h-24 border-r border-b border-border/30 last:border-r-0 p-1.5 ${isToday ? "bg-primary/5" : ""}`}>
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(task => {
                  const s = STATUSES.find(x => x.id === task.status) ?? STATUSES[0];
                  return (
                    <div
                      key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="text-[10px] truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
                      style={{ backgroundColor: s.dot + "22", color: s.dot }}
                    >
                      {task.title}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</div>
                )}
              </div>
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

  const [startDate] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d;
  });

  const totalDays = 42;
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  }), [startDate]);

  const tasksWithDates = tasks.filter(t => t.createdAt && t.dueDate);

  function dayOffset(date: Date) {
    return Math.floor((date.getTime() - startDate.getTime()) / 86400000);
  }

  const cellW = 36;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 300 + totalDays * cellW }}>
          {/* Header: task name col + date columns */}
          <div className="flex border-b border-border bg-secondary/20 sticky top-0 z-10">
            <div className="w-64 shrink-0 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-r border-border">
              Task
            </div>
            {days.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              const showLabel = d.getDate() === 1 || i === 0 || d.getDay() === 1;
              return (
                <div
                  key={i}
                  style={{ width: cellW }}
                  className={`shrink-0 text-center border-r border-border/30 last:border-r-0 py-2.5 ${isToday ? "bg-primary/10" : ""}`}
                >
                  {showLabel && (
                    <div className="text-[9px] text-muted-foreground font-medium">
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  )}
                  {!showLabel && (
                    <div className={`text-[10px] ${isToday ? "text-primary font-bold" : "text-muted-foreground/50"}`}>
                      {d.getDate()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Today line + task rows */}
          {tasksWithDates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No tasks with due dates to display
            </div>
          ) : (
            tasksWithDates.map(task => {
              const created = new Date(task.createdAt);
              const due = new Date(task.dueDate!);
              const start = Math.max(0, dayOffset(created));
              const end = Math.min(totalDays - 1, dayOffset(due));
              const width = Math.max(1, end - start + 1) * cellW;
              const left = 264 + start * cellW;
              const s = STATUSES.find(x => x.id === task.status) ?? STATUSES[0];
              const p = PRIORITIES[task.priority] ?? PRIORITIES.medium;

              return (
                <div key={task.id} className="flex items-center border-b border-border/30 last:border-b-0 relative group hover:bg-secondary/10 transition-colors" style={{ height: 44 }}>
                  {/* Task name */}
                  <div
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="w-64 shrink-0 px-3 py-2 border-r border-border/40 cursor-pointer flex items-center gap-2 min-w-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                    <span className="text-xs text-foreground truncate">{task.title}</span>
                  </div>

                  {/* Timeline cells */}
                  <div className="relative flex-1" style={{ height: 44 }}>
                    {days.map((d, i) => {
                      const isToday = d.toDateString() === today.toDateString();
                      return (
                        <div
                          key={i}
                          style={{ width: cellW, left: i * cellW, top: 0, bottom: 0 }}
                          className={`absolute border-r border-border/15 ${isToday ? "bg-primary/5" : ""}`}
                        />
                      );
                    })}

                    {/* Bar */}
                    {end >= 0 && start < totalDays && (
                      <div
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        style={{
                          position: "absolute",
                          left: start * cellW + 2,
                          width: width - 4,
                          top: "50%",
                          transform: "translateY(-50%)",
                          height: 24,
                          backgroundColor: p.color + "33",
                          borderLeft: `3px solid ${p.color}`,
                          borderRadius: 4,
                        }}
                        className="flex items-center px-1.5 cursor-pointer hover:opacity-80 transition-opacity z-10 relative"
                        title={task.title}
                      >
                        <span className="text-[10px] truncate font-medium" style={{ color: p.color }}>
                          {task.title}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */
export default function Tasks() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const addInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["admin-tasks"],
    queryFn: () => apiFetch(`/api/admin/tasks`),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (d: { title: string; status: string; assignedTo?: string; dueDate?: string; priority?: string }) =>
      apiFetch(`/api/admin/tasks`, {
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

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.assignedTo?.toLowerCase().includes(q) ||
      t.tags?.toLowerCase().includes(q)
    ) : tasks;
  }, [tasks, search]);

  function toggle(id: string) {
    setCollapsed(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function startAdd(statusId: string) {
    setAddingTo(statusId || null);
    setNewTitle("");
    if (statusId) setTimeout(() => addInputRef.current?.focus(), 60);
  }

  function commit(statusId: string, extras?: { assignedTo?: string; dueDate?: string; priority?: string }) {
    if (newTitle.trim()) createMutation.mutate({ title: newTitle.trim(), status: statusId, ...extras });
    setAddingTo(null);
    setNewTitle("");
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
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

      {/* View switcher */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors relative -mb-px ${
              view === v.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
        <button className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors ml-1">
          <Plus className="w-3.5 h-3.5" /> View
        </button>
      </div>

      {/* View content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {view === "list" && (
            <ListView
              grouped={grouped}
              collapsed={collapsed}
              toggle={toggle}
              addingTo={addingTo}
              newTitle={newTitle}
              setNewTitle={setNewTitle}
              addInputRef={addInputRef}
              startAdd={startAdd}
              commit={commit}
              navigate={navigate}
            />
          )}
          {view === "board" && (
            <BoardView
              grouped={grouped}
              onCreateTask={(status, data) => {
                createMutation.mutate({ title: data.title, status, assignedTo: data.assignedTo, dueDate: data.dueDate, priority: data.priority });
              }}
              navigate={navigate}
            />
          )}
          {view === "calendar" && (
            <CalendarView tasks={filteredTasks} navigate={navigate} />
          )}
          {view === "gantt" && (
            <GanttView tasks={filteredTasks} navigate={navigate} />
          )}
          {view === "table" && (
            <TableView tasks={filteredTasks} navigate={navigate} />
          )}
        </>
      )}
    </div>
  );
}
