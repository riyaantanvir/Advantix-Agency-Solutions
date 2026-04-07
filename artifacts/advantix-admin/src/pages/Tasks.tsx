import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Pencil, Trash2, X, Calendar, User,
  Building2, CheckCircle2, Circle, Clock, AlertCircle,
  Loader2, Kanban, List, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type TeamMember = { id: number; name: string; role: string; photoUrl: string | null };

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
  createdAt: string;
  updatedAt: string;
};

type TaskForm = {
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  clientName: string;
  assignedTo: string;
  dueDate: string;
  tags: string;
};

const STATUSES = [
  { id: "todo", label: "To Do", color: "bg-slate-500", light: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", colBg: "bg-slate-50/50 dark:bg-slate-900/20" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500", light: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", colBg: "bg-blue-50/50 dark:bg-blue-950/20" },
  { id: "review", label: "In Review", color: "bg-amber-500", light: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", colBg: "bg-amber-50/50 dark:bg-amber-950/20" },
  { id: "done", label: "Done", color: "bg-green-500", light: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", colBg: "bg-green-50/50 dark:bg-green-950/20" },
  { id: "cancelled", label: "Cancelled", color: "bg-red-400", light: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", colBg: "bg-red-50/50 dark:bg-red-950/20" },
];

const PRIORITIES = [
  { id: "low", label: "Low", color: "text-slate-500", bg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", border: "border-l-slate-400" },
  { id: "medium", label: "Medium", color: "text-blue-500", bg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400", border: "border-l-blue-500" },
  { id: "high", label: "High", color: "text-orange-500", bg: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400", border: "border-l-orange-500" },
  { id: "urgent", label: "Urgent", color: "text-red-500", bg: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400", border: "border-l-red-500" },
];

const EMPTY_FORM: TaskForm = {
  title: "", description: "", status: "todo", priority: "medium",
  type: "internal", clientName: "", assignedTo: "", dueDate: "", tags: "",
};

function statusInfo(id: string) {
  return STATUSES.find(s => s.id === id) ?? STATUSES[0];
}
function priorityInfo(id: string) {
  return PRIORITIES.find(p => p.id === id) ?? PRIORITIES[1];
}
function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

export default function Tasks() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["admin-tasks", typeFilter, priorityFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (priorityFilter !== "all") p.set("priority", priorityFilter);
      return apiFetch(`/api/admin/tasks?${p}`);
    },
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => apiFetch("/api/team"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.clientName?.toLowerCase().includes(q) ||
      t.assignedTo?.toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const createMutation = useMutation({
    mutationFn: (data: TaskForm) => apiFetch(`/api/admin/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tasks"] }); closeModal(); toast({ title: "Task created" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TaskForm }) =>
      apiFetch(`/api/admin/tasks/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tasks"] }); closeModal(); toast({ title: "Task updated" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/admin/tasks/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tasks"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tasks"] }); setDetailTask(null); toast({ title: "Task deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title, description: t.description ?? "", status: t.status,
      priority: t.priority, type: t.type, clientName: t.clientName ?? "",
      assignedTo: t.assignedTo ?? "", dueDate: t.dueDate ? t.dueDate.slice(0, 10) : "",
      tags: t.tags ?? "",
    });
    setModalOpen(true);
    setDetailTask(null);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s.id] = [];
    for (const t of filtered) {
      if (map[t.status]) map[t.status].push(t);
      else map["todo"].push(t);
    }
    return map;
  }, [filtered]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Task Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage internal team tasks and client project tasks</p>
        </div>
        <Button onClick={openCreate} className="sm:ml-auto gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: tasks.length, icon: Kanban, color: "text-primary" },
          { label: "In Progress", count: tasks.filter(t => t.status === "in_progress").length, icon: Clock, color: "text-blue-500" },
          { label: "In Review", count: tasks.filter(t => t.status === "review").length, icon: AlertCircle, color: "text-amber-500" },
          { label: "Done", count: tasks.filter(t => t.status === "done").length, icon: CheckCircle2, color: "text-green-500" },
        ].map(({ label, count, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-secondary`}><Icon className={`w-4 h-4 ${color}`} /></div>
            <div>
              <p className="text-xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="pl-9 rounded-xl" />
        </div>

        {/* Type filter */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {[{ id: "all", label: "All" }, { id: "internal", label: "Internal" }, { id: "client", label: "Client" }].map(opt => (
            <button key={opt.id} onClick={() => setTypeFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${typeFilter === opt.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{opt.label}</button>
          ))}
        </div>

        {/* Priority filter */}
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground">
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        {/* View toggle */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          <button onClick={() => setView("kanban")} className={`p-2 rounded-lg transition-all ${view === "kanban" ? "bg-background shadow" : "text-muted-foreground"}`}>
            <Kanban className="w-4 h-4" />
          </button>
          <button onClick={() => setView("list")} className={`p-2 rounded-lg transition-all ${view === "list" ? "bg-background shadow" : "text-muted-foreground"}`}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : view === "kanban" ? (
        <KanbanView tasks={tasksByStatus} onEdit={openEdit} onDelete={id => deleteMutation.mutate(id)} onStatusChange={(id, status) => statusMutation.mutate({ id, status })} onDetail={setDetailTask} />
      ) : (
        <ListView tasks={filtered} onEdit={openEdit} onDelete={id => deleteMutation.mutate(id)} onStatusChange={(id, status) => statusMutation.mutate({ id, status })} onDetail={setDetailTask} />
      )}

      {/* Task Detail Drawer */}
      <AnimatePresence>
        {detailTask && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setDetailTask(null)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border z-50 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-border flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo(detailTask.status).light}`}>{statusInfo(detailTask.status).label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityInfo(detailTask.priority).bg}`}>{priorityInfo(detailTask.priority).label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detailTask.type === "client" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"}`}>
                      {detailTask.type === "client" ? "Client" : "Internal"}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold">{detailTask.title}</h2>
                </div>
                <button onClick={() => setDetailTask(null)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {detailTask.description && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{detailTask.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {detailTask.assignedTo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Assigned To</p>
                      <div className="flex items-center gap-1.5 text-sm"><User className="w-3.5 h-3.5 text-muted-foreground" />{detailTask.assignedTo}</div>
                    </div>
                  )}
                  {detailTask.clientName && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Client</p>
                      <div className="flex items-center gap-1.5 text-sm"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{detailTask.clientName}</div>
                    </div>
                  )}
                  {detailTask.dueDate && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Due Date</p>
                      <div className={`flex items-center gap-1.5 text-sm ${isOverdue(detailTask.dueDate) && detailTask.status !== "done" ? "text-red-500" : ""}`}>
                        <Calendar className="w-3.5 h-3.5" />{new Date(detailTask.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  {detailTask.createdBy && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Created By</p>
                      <p className="text-sm">{detailTask.createdBy}</p>
                    </div>
                  )}
                </div>
                {detailTask.tags && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailTask.tags.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Move to</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.filter(s => s.id !== detailTask.status).map(s => (
                      <button key={s.id} onClick={() => { statusMutation.mutate({ id: detailTask.id, status: s.id }); setDetailTask({ ...detailTask, status: s.id }); }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
                        <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}<ArrowRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-border flex gap-2">
                <Button variant="outline" className="flex-1 gap-2 rounded-xl" onClick={() => openEdit(detailTask)}>
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="destructive" size="icon" className="rounded-xl" onClick={() => { if (confirm("Delete this task?")) deleteMutation.mutate(detailTask.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={closeModal} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-bold">{editing ? "Edit Task" : "New Task"}</h2>
                  <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                  {/* Title */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Title <span className="text-destructive">*</span></label>
                    <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title..." className="rounded-xl" />
                  </div>

                  {/* Type + Priority */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Type</label>
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                        className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm">
                        <option value="internal">Internal Team</option>
                        <option value="client">Client Project</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Priority</label>
                      <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                        className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm">
                        {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm">
                      {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Task description..." rows={3}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>

                  {/* Client name (shown when type=client) */}
                  {form.type === "client" && (
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Client Name</label>
                      <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                        placeholder="e.g. Acme Corp" className="rounded-xl" />
                    </div>
                  )}

                  {/* Assigned To + Due Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Assigned To</label>
                      <select
                        value={form.assignedTo}
                        onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                        className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {form.assignedTo && !teamMembers.some(m => m.name === form.assignedTo) && (
                          <option value={form.assignedTo}>{form.assignedTo} (not on team)</option>
                        )}
                        {teamMembers.map(m => (
                          <option key={m.id} value={m.name}>{m.name} — {m.role}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Due Date</label>
                      <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="rounded-xl" />
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Tags <span className="text-muted-foreground font-normal">(comma separated)</span></label>
                    <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                      placeholder="design, urgent, backend..." className="rounded-xl" />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={closeModal} className="flex-1 rounded-xl">Cancel</Button>
                    <Button type="submit" disabled={isPending} className="flex-1 rounded-xl gap-2">
                      {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {editing ? "Save Changes" : "Create Task"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Kanban View ─────────────────────────────────────────── */
function KanbanView({ tasks, onEdit, onDelete, onStatusChange, onDetail }: {
  tasks: Record<string, Task[]>;
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onDetail: (t: Task) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 pb-4">
      {STATUSES.map(col => (
        <div key={col.id} className={`flex flex-col gap-3 rounded-xl p-2.5 ${col.colBg}`}>
          <div className="flex items-center gap-2 px-1">
            <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
            <span className="text-sm font-semibold text-foreground">{col.label}</span>
            <span className={`ml-auto text-xs font-medium rounded-full px-2 py-0.5 ${col.light}`}>{tasks[col.id]?.length ?? 0}</span>
          </div>
          <div className="flex flex-col gap-2 min-h-20">
            <AnimatePresence>
              {(tasks[col.id] ?? []).map(task => (
                <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onDetail={onDetail} compact />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── List View ───────────────────────────────────────────── */
function ListView({ tasks, onEdit, onDelete, onStatusChange, onDetail }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onDetail: (t: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Circle className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No tasks found</p>
        <p className="text-sm mt-1">Create your first task to get started.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onDetail={onDetail} />
      ))}
    </div>
  );
}

/* ─── Task Card ───────────────────────────────────────────── */
function TaskCard({ task, onEdit, onDelete, onDetail, compact = false }: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: number) => void;
  onDetail: (t: Task) => void;
  compact?: boolean;
}) {
  const si = statusInfo(task.status);
  const pi = priorityInfo(task.priority);
  const overdue = isOverdue(task.dueDate) && task.status !== "done";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => onDetail(task)}
      className={`bg-card border border-border rounded-xl p-3.5 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group border-l-[3px] ${pi.border} ${compact ? "" : "flex items-start gap-3"} ${overdue ? "ring-1 ring-red-500/20" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="font-semibold text-foreground text-sm leading-snug flex-1">{task.title}</p>
          {!compact && (
            <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button onClick={() => onEdit(task)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => { if (confirm("Delete?")) onDelete(task.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>

        {task.description && !compact && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{task.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${pi.bg}`}>{pi.label}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${si.light}`}>{si.label}</span>
          {task.type === "client" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              {task.clientName ? task.clientName : "Client"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 mt-2 items-center">
          {task.assignedTo && (
            <span className="text-[11px] text-primary/80 font-medium flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded-full">
              <User className="w-3 h-3" />{task.assignedTo}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${overdue ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
              <Calendar className="w-3 h-3" />{new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {task.tags && compact && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {task.tags.split(",").map(t => t.trim()).filter(Boolean).slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
