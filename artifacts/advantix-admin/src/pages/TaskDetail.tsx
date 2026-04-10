import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Trash2, Loader2, Send, Flag, Calendar, User, Tag,
  Building2, CheckSquare, Circle, Clock, AlertCircle, MessageSquare,
  Pencil, Check, X, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  updatedAt: string;
};

type Comment = { id: number; authorName: string; content: string; createdAt: string };

const STATUSES = [
  { id: "todo", label: "To Do", icon: Circle, color: "#94a3b8" },
  { id: "in_progress", label: "In Progress", icon: Clock, color: "#3b82f6" },
  { id: "review", label: "In Review", icon: AlertCircle, color: "#f59e0b" },
  { id: "done", label: "Done", icon: CheckSquare, color: "#22c55e" },
  { id: "cancelled", label: "Cancelled", icon: X, color: "#ef4444" },
];

const PRIORITIES = [
  { id: "low", label: "Low", color: "#94a3b8", fill: false },
  { id: "medium", label: "Medium", color: "#3b82f6", fill: false },
  { id: "high", label: "High", color: "#f97316", fill: true },
  { id: "urgent", label: "Urgent", color: "#ef4444", fill: true },
];

const TYPES = ["internal", "client"];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Dropdown<T extends string>({
  value, options, onChange, renderOption, renderSelected, className = "",
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderOption: (v: T) => React.ReactNode;
  renderSelected: (v: T) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 hover:bg-secondary/50 px-2 py-1 rounded-lg transition-colors text-left w-full">
        {renderSelected(value)}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-20 min-w-[140px] overflow-hidden">
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors ${opt === value ? "text-primary" : "text-foreground"}`}>
              {renderOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const taskId = parseInt(params.id ?? "0", 10);
  const isNew = params.id === "new";

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["task-detail", taskId],
    queryFn: () => apiFetch(`/api/admin/tasks/${taskId}`),
    enabled: !isNew && !!taskId,
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["task-comments", taskId],
    queryFn: () => apiFetch(`/api/admin/tasks/${taskId}/comments`),
    enabled: !isNew && !!taskId,
  });

  const { data: adminUsers = [] } = useQuery<{ id: number; username: string }[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch(`/api/admin/admins`),
  });

  const [titleEditing, setTitleEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (task) setTitle(task.title);
  }, [task?.title]);

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<Task>) =>
      apiFetch(`/api/admin/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, ...patch }),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["task-detail", taskId], updated);
      qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/admin/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tasks"] }); navigate("/tasks"); toast({ title: "Task deleted" }); },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/admin/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      qc.invalidateQueries({ queryKey: ["task-detail", taskId] });
      qc.invalidateQueries({ queryKey: ["admin-tasks"] });
      qc.invalidateQueries({ queryKey: ["pm-replies"] });
      setCommentText("");
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) =>
      apiFetch(`/api/admin/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", taskId] }),
  });

  function saveTitle() {
    setTitleEditing(false);
    if (task && title.trim() && title.trim() !== task.title) {
      updateMutation.mutate({ title: title.trim() });
    }
  }

  function patch(key: keyof Task, value: string | null) {
    if (!task) return;
    updateMutation.mutate({ [key]: value });
  }

  const statusConfig = (id: string) => STATUSES.find(s => s.id === id) ?? STATUSES[0];
  const priorityConfig = (id: string) => PRIORITIES.find(p => p.id === id) ?? PRIORITIES[1];

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (!task && !isNew) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Task not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/tasks")}>Back to Tasks</Button>
    </div>
  );

  const sc = statusConfig(task?.status ?? "todo");
  const pc = priorityConfig(task?.priority ?? "medium");

  return (
    <div className="flex flex-col gap-0 -mt-2">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate("/tasks")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
        </button>
        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => confirm("Delete this task?") && deleteMutation.mutate()}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
        </Button>
      </div>

      {task && (
        <div className="flex gap-6 min-h-0">
          {/* Left panel */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Title */}
            <div className="flex items-start gap-3">
              <sc.icon className="w-5 h-5 mt-1 shrink-0" style={{ color: sc.color }} />
              {titleEditing ? (
                <div className="flex-1 flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 text-2xl font-bold bg-transparent border-b-2 border-primary outline-none text-foreground"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleEditing(false); setTitle(task.title); } }}
                    onBlur={saveTitle}
                  />
                </div>
              ) : (
                <h1
                  className="text-2xl font-bold text-foreground cursor-text hover:text-primary/80 transition-colors flex-1"
                  onClick={() => setTitleEditing(true)}
                >
                  {task.title}
                </h1>
              )}
            </div>

            {/* Properties grid */}
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {/* Status */}
                  <tr className="border-b border-border/50">
                    <td className="px-4 py-2.5 w-32 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><CheckSquare className="w-3.5 h-3.5" /> Status</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <Dropdown
                        value={task.status}
                        options={STATUSES.map(s => s.id)}
                        onChange={v => patch("status", v)}
                        renderSelected={v => {
                          const s = statusConfig(v);
                          return <><s.icon className="w-4 h-4" style={{ color: s.color }} /><span className="text-sm font-medium">{s.label}</span></>;
                        }}
                        renderOption={v => {
                          const s = statusConfig(v);
                          return <><s.icon className="w-4 h-4" style={{ color: s.color }} /><span>{s.label}</span></>;
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5 w-32 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Assignee</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <Dropdown
                        value={task.assignedTo ?? ""}
                        options={["", ...adminUsers.map(a => a.username)]}
                        onChange={v => patch("assignedTo", v || null)}
                        renderSelected={v => v
                          ? <><span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">{v[0].toUpperCase()}</span><span className="text-sm">{v}</span></>
                          : <><User className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Unassigned</span></>
                        }
                        renderOption={v => v
                          ? <><span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">{v[0].toUpperCase()}</span><span>{v}</span></>
                          : <><User className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Unassigned</span></>
                        }
                      />
                    </td>
                  </tr>

                  {/* Due Date + Priority */}
                  <tr className="border-b border-border/50">
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Due Date</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        type="date"
                        className="text-sm text-foreground bg-transparent border-0 outline-none cursor-pointer hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors"
                        value={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""}
                        onChange={e => patch("dueDate", e.target.value || null)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><Flag className="w-3.5 h-3.5" /> Priority</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <Dropdown
                        value={task.priority}
                        options={PRIORITIES.map(p => p.id)}
                        onChange={v => patch("priority", v)}
                        renderSelected={v => {
                          const p = priorityConfig(v);
                          return <><Flag className="w-4 h-4" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} /><span className="text-sm capitalize">{p.label}</span></>;
                        }}
                        renderOption={v => {
                          const p = priorityConfig(v);
                          return <><Flag className="w-4 h-4" style={{ color: p.color, fill: p.fill ? p.color : "none", strokeWidth: 2 }} /><span className="capitalize">{p.label}</span></>;
                        }}
                      />
                    </td>
                  </tr>

                  {/* Tags + Type */}
                  <tr className="border-b border-border/50">
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> Tags</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        className="text-sm text-foreground bg-transparent border-0 outline-none w-full focus:ring-0 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors"
                        placeholder="design, urgent…"
                        defaultValue={task.tags ?? ""}
                        onBlur={e => patch("tags", e.target.value.trim() || null)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Type</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <Dropdown
                        value={task.type}
                        options={TYPES}
                        onChange={v => patch("type", v)}
                        renderSelected={v => <span className="text-sm capitalize">{v === "internal" ? "Internal Team" : "Client"}</span>}
                        renderOption={v => <span className="capitalize">{v === "internal" ? "Internal Team" : "Client"}</span>}
                      />
                    </td>
                  </tr>

                  {/* Client + Created by */}
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Client</div>
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        className="text-sm text-foreground bg-transparent border-0 outline-none w-full focus:ring-0 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors"
                        placeholder="Client name…"
                        defaultValue={task.clientName ?? ""}
                        onBlur={e => patch("clientName", e.target.value.trim() || null)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary/10">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Created by</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm text-muted-foreground">{task.createdBy ?? "—"}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
              <textarea
                className="w-full bg-secondary/20 border border-border rounded-xl px-4 py-3 text-sm text-foreground resize-none min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring transition-colors hover:bg-secondary/30"
                placeholder="Add a description…"
                defaultValue={task.description ?? ""}
                onBlur={e => patch("description", e.target.value.trim() || null)}
              />
            </div>
          </div>

          {/* Right panel — Activity */}
          <div className="w-80 shrink-0 flex flex-col border border-border rounded-xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Activity</span>
              {comments.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{comments.length}</span>
              )}
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 max-h-[calc(100vh-380px)]">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No activity yet</p>
                </div>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="flex items-start gap-2.5 group">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{c.authorName[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                        <button
                          onClick={() => deleteCommentMutation.mutate(c.id)}
                          className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="mt-1 bg-secondary/40 rounded-lg px-3 py-2">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Comment input */}
            <div className="border-t border-border/50 p-3">
              <textarea
                className="w-full bg-secondary/30 border border-input rounded-xl px-3 py-2 text-sm resize-none min-h-[72px] focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Write a comment… (Ctrl+Enter)"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    if (commentText.trim()) commentMutation.mutate(commentText.trim());
                  }
                }}
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  className="h-8 px-4 rounded-lg"
                  disabled={!commentText.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate(commentText.trim())}
                >
                  {commentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
