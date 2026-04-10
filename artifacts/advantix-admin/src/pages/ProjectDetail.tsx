import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, CheckSquare, Plus, Trash2, Loader2, UserPlus, Crown, X,
  Circle, Clock, AlertCircle, FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import TaskDetailModal from "@/components/pm/TaskDetailModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Member = { id: number; adminId: number; role: string; username: string | null; addedAt: string };
type Task = {
  id: number; title: string; status: string; priority: string;
  assignedTo: string | null; dueDate: string | null;
};
type AdminUser = { id: number; username: string };
type Project = {
  id: number; name: string; description: string | null; color: string; status: string;
  members: Member[]; tasks: Task[];
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  high: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  urgent: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    todo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    in_progress: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    review: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    done: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
    cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  };
  const labels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done", cancelled: "Cancelled" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.todo}`}>{labels[status] ?? status}</span>;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return null; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"tasks" | "members">("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<number | "">("");

  const projectId = parseInt(params.id ?? "0", 10);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => apiFetch(`/api/admin/projects/${projectId}`),
  });

  const { data: allAdmins = [] } = useQuery<AdminUser[]>({
    queryKey: ["admins"],
    queryFn: () => apiFetch(`/api/admin/admins`),
  });

  const addMemberMutation = useMutation({
    mutationFn: (adminId: number) =>
      apiFetch(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowAddMember(false);
      setSelectedAdminId("");
      toast({ title: "Member added" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (adminId: number) =>
      apiFetch(`/api/admin/projects/${projectId}/members/${adminId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Member removed" });
    },
  });

  const existingAdminIds = new Set(project?.members.map(m => m.adminId) ?? []);
  const availableAdmins = allAdmins.filter(a => !existingAdminIds.has(a.id));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  );

  if (!project) return (
    <div className="text-center py-20 text-muted-foreground">Project not found.</div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/pm/all-projects")} className="p-2 rounded-lg hover:bg-secondary/60 transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: project.color + "22" }}>
            <FolderKanban className="w-5 h-5" style={{ color: project.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-secondary/30 rounded-xl w-fit">
        <button
          onClick={() => setTab("tasks")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "tasks" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <CheckSquare className="w-4 h-4" /> Tasks ({project.tasks.length})
        </button>
        <button
          onClick={() => setTab("members")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "members" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="w-4 h-4" /> Members ({project.members.length})
        </button>
      </div>

      {tab === "tasks" && (
        <div className="space-y-3">
          {project.tasks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No tasks in this project yet.</p>
              <p className="text-xs mt-1">Create tasks from the Tasks page and assign them to this project.</p>
            </div>
          ) : (
            project.tasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {task.assignedTo && <span className="text-xs text-muted-foreground">{task.assignedTo}</span>}
                    {task.dueDate && <span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={task.status} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                    {task.priority}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{project.members.length} member{project.members.length !== 1 ? "s" : ""}</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddMember(!showAddMember)}>
              <UserPlus className="w-4 h-4 mr-2" /> Add Member
            </Button>
          </div>

          {showAddMember && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-secondary/30 border border-border rounded-xl p-4 flex gap-3"
            >
              <select
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value ? parseInt(e.target.value) : "")}
              >
                <option value="">Select admin user...</option>
                {availableAdmins.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
              </select>
              <Button
                size="sm"
                disabled={!selectedAdminId || addMemberMutation.isPending}
                onClick={() => selectedAdminId && addMemberMutation.mutate(selectedAdminId as number)}
              >
                {addMemberMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddMember(false)}>
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          <div className="space-y-2">
            {project.members.map((member) => (
              <div key={member.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">{member.username?.[0]?.toUpperCase() ?? "?"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{member.username}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {member.role === "owner" && <Crown className="w-3 h-3 text-amber-400" />}
                    <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                  </div>
                </div>
                {member.role !== "owner" && (
                  <button
                    onClick={() => removeMemberMutation.mutate(member.adminId)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => {
            setSelectedTaskId(null);
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          }}
        />
      )}
    </div>
  );
}
