import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Plus, LayoutList, KanbanSquare, MessageSquare, Trash2, Calendar, User as UserIcon, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { workspaceApi, type WorkspaceProject, type WorkspaceTask, type TaskStatus, type TaskPriority, type WorkspaceMember, type TaskComment } from "@/lib/workspaceApi";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";

const STATUSES: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
  { id: "review", label: "Review", color: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  { id: "done", label: "Done", color: "bg-green-500/10 text-green-300 border-green-500/20" },
  { id: "cancelled", label: "Cancelled", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-green-500/10 text-green-400 border-green-500/20",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function ProjectDetail({ projectId }: { projectId: number }) {
  const { current } = useWorkspace();
  const [, navigate] = useLocation();
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [view, setView] = useState<"list" | "board">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [openTask, setOpenTask] = useState<WorkspaceTask | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);

  async function load() {
    if (!current) return;
    try {
      const [p, t, m] = await Promise.all([
        workspaceApi.getProject(current.id, projectId),
        workspaceApi.listTasks(current.id, { projectId }),
        workspaceApi.members(current.id),
      ]);
      setProject(p.project); setTasks(t.tasks); setMembers(m.members);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id, projectId]);

  async function quickAdd() {
    if (!current || !quickTitle.trim()) return;
    try {
      await workspaceApi.createTask(current.id, { title: quickTitle.trim(), projectId });
      setQuickTitle("");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function moveTask(taskId: number, status: TaskStatus) {
    if (!current) return;
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status } : t));
    try { await workspaceApi.setTaskStatus(current.id, taskId, status); }
    catch (e) { toast.error((e as Error).message); load(); }
  }

  async function deleteTask(t: WorkspaceTask) {
    if (!current) return;
    if (!confirm(`Delete task "${t.title}"?`)) return;
    await workspaceApi.deleteTask(current.id, t.id);
    setOpenTask(null);
    load();
  }

  if (!current || !project) return <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/tools/project-management")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Projects
        </Button>
      </div>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${project.color}22` }}>
            <KanbanSquare className="w-5 h-5" style={{ color: project.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          </div>
        </div>
        <div className="flex gap-1 bg-muted/40 rounded-lg p-0.5">
          <Button variant={view === "list" ? "default" : "ghost"} size="sm" onClick={() => setView("list")}><LayoutList className="w-4 h-4 mr-1" /> List</Button>
          <Button variant={view === "board" ? "default" : "ghost"} size="sm" onClick={() => setView("board")}><KanbanSquare className="w-4 h-4 mr-1" /> Board</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Input placeholder="Quick add task — press Enter" value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") quickAdd(); }} />
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Detailed</Button>
      </div>

      {view === "list" ? (
        <ListView tasks={tasks} onOpen={setOpenTask} onMove={moveTask} />
      ) : (
        <BoardView tasks={tasks} onOpen={setOpenTask} onMove={moveTask}
          draggingId={draggingId} setDraggingId={setDraggingId} />
      )}

      {createOpen && (
        <CreateTaskDialog
          members={members}
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
      {openTask && (
        <TaskDetailDialog
          task={openTask}
          members={members}
          onClose={() => setOpenTask(null)}
          onUpdated={() => { load(); }}
          onDelete={() => deleteTask(openTask)}
        />
      )}
    </div>
  );
}

/* ── LIST VIEW ──────────────────────────────────────────────────────── */
function ListView({ tasks, onOpen, onMove }: { tasks: WorkspaceTask[]; onOpen: (t: WorkspaceTask) => void; onMove: (id: number, s: TaskStatus) => void }) {
  return (
    <div className="space-y-1.5">
      {tasks.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No tasks yet.</Card>}
      {tasks.map(t => {
        const status = STATUSES.find(s => s.id === t.status)!;
        return (
          <Card key={t.id} className="p-3 hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-3">
              <Select value={t.status} onValueChange={(v) => onMove(t.id, v as TaskStatus)}>
                <SelectTrigger className={`w-32 h-7 text-xs border ${status.color}`}><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
              <button className="flex-1 text-left text-sm font-medium hover:text-primary truncate" onClick={() => onOpen(t)}>{t.title}</button>
              <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</Badge>
              {t.assigned_to_name && <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1"><UserIcon className="w-3 h-3" /> {t.assigned_to_name}</span>}
              {t.due_date && <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(t.due_date).toLocaleDateString()}</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── BOARD VIEW (HTML5 drag-and-drop) ─────────────────────────────── */
function BoardView({ tasks, onOpen, onMove, draggingId, setDraggingId }: {
  tasks: WorkspaceTask[]; onOpen: (t: WorkspaceTask) => void;
  onMove: (id: number, s: TaskStatus) => void;
  draggingId: number | null; setDraggingId: (id: number | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {STATUSES.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        return (
          <div key={col.id}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (draggingId != null) { onMove(draggingId, col.id); setDraggingId(null); } }}
            className="bg-muted/20 rounded-lg p-2 min-h-[200px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <Badge variant="outline" className={`text-[10px] ${col.color}`}>{col.label}</Badge>
              <span className="text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="space-y-1.5">
              {colTasks.map(t => (
                <Card key={t.id}
                  draggable
                  onDragStart={() => setDraggingId(t.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => onOpen(t)}
                  className="p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors">
                  <div className="text-sm font-medium leading-snug mb-1.5 line-clamp-3">{t.title}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] py-0 px-1.5 ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</Badge>
                    {t.assigned_to_name && <span className="text-[10px] text-muted-foreground truncate">{t.assigned_to_name}</span>}
                    {t.due_date && <span className="text-[10px] text-muted-foreground ml-auto">{new Date(t.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── CREATE TASK DIALOG ─────────────────────────────────────────── */
function CreateTaskDialog({ members, projectId, onClose, onCreated }: {
  members: WorkspaceMember[]; projectId: number;
  onClose: () => void; onCreated: () => void;
}) {
  const { current } = useWorkspace();
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as TaskPriority,
    assignedToToolUserId: "" as string, dueDate: "",
  });

  async function save() {
    if (!current || !form.title.trim()) return;
    try {
      await workspaceApi.createTask(current.id, {
        title: form.title.trim(),
        description: form.description || undefined,
        priority: form.priority,
        projectId,
        assignedToToolUserId: form.assignedToToolUserId ? parseInt(form.assignedToToolUserId, 10) : null,
        dueDate: form.dueDate || null,
      });
      toast.success("Task created");
      onCreated();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={form.assignedToToolUserId} onValueChange={(v) => setForm({ ...form, assignedToToolUserId: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.tool_user_id} value={String(m.tool_user_id)}>{m.name ?? m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.title.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── TASK DETAIL + COMMENTS DIALOG ──────────────────────────────── */
function TaskDetailDialog({ task, members, onClose, onUpdated, onDelete }: {
  task: WorkspaceTask; members: WorkspaceMember[];
  onClose: () => void; onUpdated: () => void; onDelete: () => void;
}) {
  const { current } = useWorkspace();
  const [edited, setEdited] = useState({
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    status: task.status,
    assignedToToolUserId: task.assigned_to_tool_user_id != null ? String(task.assigned_to_tool_user_id) : "",
    dueDate: task.due_date ? task.due_date.slice(0, 10) : "",
  });
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const dirty = useMemo(() => JSON.stringify(edited) !== JSON.stringify({
    title: task.title, description: task.description ?? "",
    priority: task.priority, status: task.status,
    assignedToToolUserId: task.assigned_to_tool_user_id != null ? String(task.assigned_to_tool_user_id) : "",
    dueDate: task.due_date ? task.due_date.slice(0, 10) : "",
  }), [edited, task]);

  async function loadComments() {
    if (!current) return;
    try {
      const r = await workspaceApi.listComments(current.id, task.id);
      setComments(r.comments);
    } catch (e) { console.error(e); }
  }
  useEffect(() => { loadComments(); /* eslint-disable-next-line */ }, [task.id]);

  async function save() {
    if (!current) return;
    try {
      await workspaceApi.updateTask(current.id, task.id, {
        title: edited.title.trim(),
        description: edited.description,
        priority: edited.priority,
        status: edited.status,
        assignedToToolUserId: edited.assignedToToolUserId ? parseInt(edited.assignedToToolUserId, 10) : null,
        dueDate: edited.dueDate || null,
      } as never);
      toast.success("Task saved");
      onUpdated();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function postComment() {
    if (!current || !newComment.trim()) return;
    try {
      await workspaceApi.addComment(current.id, task.id, newComment.trim());
      setNewComment("");
      loadComments();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex-1">Task</DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={onDelete}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={edited.title} onChange={e => setEdited({ ...edited, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={edited.description} onChange={e => setEdited({ ...edited, description: e.target.value })} rows={4} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={edited.status} onValueChange={(v) => setEdited({ ...edited, status: v as TaskStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={edited.priority} onValueChange={(v) => setEdited({ ...edited, priority: v as TaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={edited.assignedToToolUserId || "__none__"} onValueChange={(v) => setEdited({ ...edited, assignedToToolUserId: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {members.map(m => <SelectItem key={m.tool_user_id} value={String(m.tool_user_id)}>{m.name ?? m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Due date</Label><Input type="date" value={edited.dueDate} onChange={e => setEdited({ ...edited, dueDate: e.target.value })} /></div>
          </div>
          {dirty && <div className="flex justify-end"><Button onClick={save} size="sm">Save changes</Button></div>}

          <div className="pt-4 border-t">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4" /> Comments ({comments.length})</h4>
            <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
              {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
              {comments.map(c => (
                <div key={c.id} className="bg-muted/30 rounded p-2.5 text-sm">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-semibold text-xs">{c.author_name ?? c.author_email}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{c.content}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} placeholder="Write a comment…" />
              <Button onClick={postComment} disabled={!newComment.trim()}>Post</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
