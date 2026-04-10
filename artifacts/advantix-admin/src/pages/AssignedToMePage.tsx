import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { UserCheck, Loader2, Calendar, FolderKanban, CheckSquare, Circle, Clock, AlertCircle } from "lucide-react";
import TaskDetailModal from "@/components/pm/TaskDetailModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: number | null;
  projectName: string | null;
  createdBy: string | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  high: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  urgent: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <CheckSquare className="w-4 h-4 text-green-400" />;
  if (status === "in_progress") return <Clock className="w-4 h-4 text-blue-400" />;
  if (status === "review") return <AlertCircle className="w-4 h-4 text-amber-400" />;
  return <Circle className="w-4 h-4 text-slate-400" />;
}

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) { window.location.href = "/admin/"; return []; }
  if (!res.ok) return [];
  return res.json();
}

export default function AssignedToMePage() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["pm-assigned-to-me"],
    queryFn: () => apiFetch(`${BASE}/api/admin/pm/assigned-to-me`),
  });

  const active = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
  const completed = tasks.filter(t => t.status === "done" || t.status === "cancelled");

  const TaskRow = ({ task }: { task: Task }) => (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4"
      onClick={() => setSelectedTaskId(task.id)}
    >
      <StatusIcon status={task.status} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {task.projectName && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <FolderKanban className="w-3 h-3" /> {task.projectName}
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.createdBy && (
            <span className="text-xs text-muted-foreground">by {task.createdBy}</span>
          )}
        </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
        {task.priority}
      </span>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assigned to me</h1>
        <p className="text-sm text-muted-foreground mt-1">{active.length} active task{active.length !== 1 ? "s" : ""} assigned to you</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <UserCheck className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">No tasks assigned to you.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                Active <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{active.length}</span>
              </h2>
              <div className="space-y-2">{active.map(t => <TaskRow key={t.id} task={t} />)}</div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                Completed <span className="bg-secondary text-xs px-2 py-0.5 rounded-full">{completed.length}</span>
              </h2>
              <div className="space-y-2">{completed.map(t => <TaskRow key={t.id} task={t} />)}</div>
            </div>
          )}
        </div>
      )}

      {selectedTaskId && (
        <TaskDetailModal taskId={selectedTaskId} onClose={() => { setSelectedTaskId(null); refetch(); }} />
      )}
    </div>
  );
}
