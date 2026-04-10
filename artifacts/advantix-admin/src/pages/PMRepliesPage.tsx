import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Reply, Loader2, MessageSquare } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Comment = {
  id: number;
  taskId: number;
  taskTitle: string;
  authorName: string;
  content: string;
  createdAt: string;
};

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) { window.location.href = "/admin/"; return []; }
  if (!res.ok) return [];
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

export default function PMRepliesPage() {
  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["pm-replies"],
    queryFn: () => apiFetch(`${BASE}/api/admin/pm/replies`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Replies</h1>
        <p className="text-sm text-muted-foreground mt-1">Comments on tasks assigned to you</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Reply className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">No replies yet on your assigned tasks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">{c.authorName[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{c.authorName}</span>
                    <span className="text-xs text-muted-foreground">commented on</span>
                    <span className="text-xs font-medium text-primary truncate max-w-[200px]">{c.taskTitle}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{timeAgo(c.createdAt)}</span>
                  </div>
                  <div className="mt-2 bg-secondary/30 rounded-lg px-3 py-2">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
