import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Send, Trash2, MessageSquare, Calendar, User, Tag, FolderKanban,
  CheckSquare, Circle, Clock, AlertCircle,
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
  assignedTo: string | null;
  dueDate: string | null;
  tags: string | null;
  projectId: number | null;
  createdBy: string | null;
  createdAt: string;
};

type Comment = {
  id: number;
  authorName: string;
  content: string;
  createdAt: string;
};

const STATUSES = [
  { id: "todo", label: "To Do", icon: Circle, color: "text-slate-400" },
  { id: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-400" },
  { id: "review", label: "In Review", icon: AlertCircle, color: "text-amber-400" },
  { id: "done", label: "Done", icon: CheckSquare, color: "text-green-400" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  high: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  urgent: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  taskId: number;
  onClose: () => void;
}

export default function TaskDetailModal({ taskId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [statusDropdown, setStatusDropdown] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const { data: task, isLoading: taskLoading } = useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => apiFetch(`/api/admin/tasks/${taskId}`),
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["task-comments", taskId],
    queryFn: () => apiFetch(`/api/admin/tasks/${taskId}/comments`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/api/admin/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["pm-my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["pm-assigned-to-me"] });
      queryClient.invalidateQueries({ queryKey: ["pm-today-overdue"] });
      setStatusDropdown(false);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/admin/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["pm-replies"] });
      queryClient.invalidateQueries({ queryKey: ["pm-assigned-comments"] });
      setComment("");
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) =>
      apiFetch(`/api/admin/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] }),
  });

  const handleComment = () => {
    if (!comment.trim()) return;
    commentMutation.mutate(comment.trim());
  };

  const statusInfo = STATUSES.find(s => s.id === task?.status) ?? STATUSES[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-end p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-card border border-border rounded-2xl w-full max-w-lg h-full max-h-[90vh] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {taskLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : task ? (
            <>
              <div className="p-5 border-b border-border/50 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground leading-tight">{task.title}</h2>
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <div className="relative">
                    <button
                      onClick={() => setStatusDropdown(!statusDropdown)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border hover:bg-secondary/50 transition-colors"
                    >
                      <statusInfo.icon className={`w-3 h-3 ${statusInfo.color}`} />
                      <span className="text-foreground">{statusInfo.label}</span>
                    </button>
                    <AnimatePresence>
                      {statusDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 overflow-hidden"
                        >
                          {STATUSES.map(s => (
                            <button
                              key={s.id}
                              onClick={() => statusMutation.mutate(s.id)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/50 text-foreground"
                            >
                              <s.icon className={`w-3 h-3 ${s.color}`} />
                              {s.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                    {task.priority}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  {task.assignedTo && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      <span>{task.assignedTo}</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {task.tags && (
                    <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{task.tags}</span>
                    </div>
                  )}
                </div>
              </div>

              {task.description && (
                <div className="px-5 py-4 border-b border-border/50 shrink-0">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Comments ({comments.length})</span>
                </div>

                {commentsLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No comments yet. Be the first!</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5 group">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-primary">{c.authorName[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                          <button
                            onClick={() => deleteCommentMutation.mutate(c.id)}
                            className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="mt-1 bg-secondary/30 rounded-lg px-3 py-2">
                          <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              <div className="p-4 border-t border-border/50 shrink-0">
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Add a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleComment();
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-20 w-10 shrink-0"
                    onClick={handleComment}
                    disabled={!comment.trim() || commentMutation.isPending}
                  >
                    {commentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Ctrl+Enter to submit</p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1">
              <p className="text-muted-foreground">Task not found</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
