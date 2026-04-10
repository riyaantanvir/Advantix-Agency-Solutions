import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, Loader2, Calendar, FolderKanban, AlertTriangle, Clock } from "lucide-react";
import TaskDetailModal from "@/components/pm/TaskDetailModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignedTo: string | null;
  projectId: number | null;
  projectName: string | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  high: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  urgent: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) { window.location.href = "/admin/"; return []; }
  if (!res.ok) return [];
  return res.json();
}

function isOverdue(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function isDueToday(dueDate: string) {
  const today = new Date();
  const d = new Date(dueDate);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

export default function TodayOverduePage() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["pm-today-overdue"],
    queryFn: () => apiFetch(`/api/admin/pm/today-overdue`),
  });

  const overdue = tasks.filter(t => t.dueDate && isOverdue(t.dueDate));
  const dueToday = tasks.filter(t => t.dueDate && isDueToday(t.dueDate));

  const TaskCard = ({ task }: { task: Task }) => (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4"
      onClick={() => setSelectedTaskId(task.id)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
        <div className="flex items-center gap-3 mt-1">
          {task.dueDate && (
            <span className={`text-xs flex items-center gap-1 ${isOverdue(task.dueDate) ? "text-red-400" : "text-amber-400"}`}>
              <Calendar className="w-3 h-3" />
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.projectName && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <FolderKanban className="w-3 h-3" /> {task.projectName}
            </span>
          )}
          {task.assignedTo && (
            <span className="text-xs text-muted-foreground">{task.assignedTo}</span>
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
        <h1 className="text-2xl font-bold text-foreground">Today & Overdue</h1>
        <p className="text-sm text-muted-foreground mt-1">{tasks.length} pending task{tasks.length !== 1 ? "s" : ""} need attention</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
            <CalendarClock className="w-7 h-7 text-green-500" />
          </div>
          <p className="text-muted-foreground font-medium">All caught up!</p>
          <p className="text-sm text-muted-foreground">No overdue or due-today tasks.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h2 className="text-sm font-semibold text-red-400">Overdue</h2>
                <span className="text-xs text-muted-foreground bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">{overdue.length}</span>
              </div>
              <div className="space-y-2">
                {overdue.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          )}
          {dueToday.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-amber-400">Due Today</h2>
                <span className="text-xs text-muted-foreground bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">{dueToday.length}</span>
              </div>
              <div className="space-y-2">
                {dueToday.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => { setSelectedTaskId(null); refetch(); }}
        />
      )}
    </div>
  );
}
