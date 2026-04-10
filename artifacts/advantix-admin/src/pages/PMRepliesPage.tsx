import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Reply, Loader2, Send, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import TaskDetailModal from "@/components/pm/TaskDetailModal";

type Comment = {
  id: number;
  taskId: number;
  taskTitle: string;
  authorName: string;
  content: string;
  createdAt: string;
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
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

function AuthorAvatar({ name }: { name: string }) {
  const palette = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f97316", "#14b8a6"];
  const bg = palette[name.charCodeAt(0) % palette.length];
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ backgroundColor: bg }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function CommentCard({ comment, onOpenTask }: { comment: Comment; onOpenTask: (id: number) => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/admin/tasks/${comment.taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-replies"] });
      qc.invalidateQueries({ queryKey: ["task-comments", comment.taskId] });
      setReplyText("");
      setReplyOpen(false);
      toast({ title: "Reply sent" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      {/* Comment row */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AuthorAvatar name={comment.authorName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
              <span className="text-xs text-muted-foreground">commented on</span>
              <button
                onClick={() => onOpenTask(comment.taskId)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline truncate max-w-[220px]"
              >
                {comment.taskTitle}
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </button>
              <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(comment.createdAt)}</span>
            </div>
            <div className="mt-2 bg-secondary/30 rounded-lg px-3 py-2">
              <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3 mt-3 pl-11">
          <button
            onClick={() => setReplyOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
            Reply
            {replyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button
            onClick={() => onOpenTask(comment.taskId)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open task
          </button>
        </div>
      </div>

      {/* Inline reply box */}
      <AnimatePresence>
        {replyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50 overflow-hidden"
          >
            <div className="p-4 pl-14 flex gap-2">
              <textarea
                autoFocus
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={`Reply to ${comment.authorName}…`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && replyText.trim()) {
                    replyMutation.mutate(replyText.trim());
                  }
                  if (e.key === "Escape") setReplyOpen(false);
                }}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => replyText.trim() && replyMutation.mutate(replyText.trim())}
                  disabled={!replyText.trim() || replyMutation.isPending}
                >
                  {replyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
                <button
                  onClick={() => { setReplyOpen(false); setReplyText(""); }}
                  className="h-8 w-8 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground px-4 pb-3 pl-14">Ctrl+Enter to send · Esc to cancel</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PMRepliesPage() {
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["pm-replies"],
    queryFn: () => apiFetch(`/api/admin/pm/replies`),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Replies</h1>
        <p className="text-sm text-muted-foreground mt-1">Comments on tasks assigned to you</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Reply className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">No replies yet on your assigned tasks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <CommentCard key={c.id} comment={c} onOpenTask={setOpenTaskId} />
          ))}
        </div>
      )}

      {openTaskId !== null && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => {
            setOpenTaskId(null);
            qc.invalidateQueries({ queryKey: ["pm-replies"] });
          }}
        />
      )}
    </div>
  );
}
