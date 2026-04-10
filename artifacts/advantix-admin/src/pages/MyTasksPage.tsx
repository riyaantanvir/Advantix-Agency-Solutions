import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckSquare, Circle, Clock, AlertCircle, Loader2, Calendar, FolderKanban } from "lucide-react";
import TaskDetailModal from "@/components/pm/TaskDetailModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  dueDate: string | null;
  projectId: number | null;
  projectName: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  todo: "text-slate-400",
  in_progress: "text-blue-400",
  review: "text-amber-400",
  done: "text-green-400",
  cancelled: "text-red-400",
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

export default function MyTasksPage() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["pm-my-tasks"],
    queryFn: () => apiFetch(`/api/admin/pm/my-tasks`),
  });

  const grouped: Record<string, Task[]> = {};
  for (const t of tasks) {
    const key = t.projectName ?? "No Project";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">All tasks you are involved in</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CheckSquare className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">No tasks assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([project, items]) => (
            <div key={project}>
              <div className="flex items-center gap-2 mb-3">
                <FolderKanban className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">{project}</h2>
                <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4"
                    onClick={() => setSelectedTask(task)}
                  >
                    <StatusIcon status={task.status} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      {task.dueDate && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                      {task.priority}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask.id}
          onClose={() => { setSelectedTask(null); refetch(); }}
        />
      )}
    </div>
  );
}
