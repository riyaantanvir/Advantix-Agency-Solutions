import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, CheckSquare, Plus, Trash2, Loader2, UserPlus, Crown, X,
  Circle, Clock, AlertCircle, FolderKanban, BarChart2, TrendingUp,
  AlertTriangle, MessageSquare, Star, Filter, Calendar,
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
type Stats = {
  total: number; open: number; done: number; cancelled: number;
  pending: number; inProgress: number; inReview: number;
  completionRate: number; overdueCount: number; avgCompletionDays: number | null;
  totalComments: number; avgCommentsPerTask: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  assignees: { name: string; total: number; done: number; open: number }[];
  memberUsernames: string[];
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

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function PriorityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-14 shrink-0 capitalize">{label}</span>
      <div className="flex-1 bg-secondary/50 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">{count}</span>
      <span className="text-xs text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}

function ReportsTab({ projectId, memberUsernames }: { projectId: number; memberUsernames: string[] }) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (assignedTo) params.set("assignedTo", assignedTo);
  if (priority) params.set("priority", priority);
  if (filterStatus) params.set("status", filterStatus);

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["project-stats", projectId, from, to, assignedTo, priority, filterStatus],
    queryFn: () => apiFetch(`/api/admin/projects/${projectId}/stats?${params.toString()}`),
    staleTime: 30_000,
  });

  const selectCls = "rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring text-foreground";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className={selectCls}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className={selectCls}
            />
          </div>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={selectCls}>
            <option value="">All Assignees</option>
            {memberUsernames.map(u => <option key={u} value={u ?? ""}>{u}</option>)}
          </select>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
            <option value="">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">In Review</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {(from !== thirtyDaysAgo || to !== today || assignedTo || priority || filterStatus) && (
            <button
              onClick={() => { setFrom(thirtyDaysAgo); setTo(today); setAssignedTo(""); setPriority(""); setFilterStatus(""); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : stats ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Tasks" value={stats.total} icon={CheckSquare} color="bg-primary/10 text-primary" />
            <StatCard label="Open Tasks" value={stats.open} sub={`To Do: ${stats.pending} · In Progress: ${stats.inProgress}`} icon={Circle} color="bg-blue-500/10 text-blue-500" />
            <StatCard label="Done" value={stats.done} icon={TrendingUp} color="bg-green-500/10 text-green-500" />
            <StatCard label="Completion Rate" value={`${stats.completionRate}%`} icon={Star} color="bg-amber-500/10 text-amber-500" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="In Review" value={stats.inReview} icon={Clock} color="bg-orange-500/10 text-orange-500" />
            <StatCard label="Overdue" value={stats.overdueCount} icon={AlertTriangle} color="bg-red-500/10 text-red-500" />
            <StatCard
              label="Avg Completion"
              value={stats.avgCompletionDays !== null ? `${stats.avgCompletionDays}d` : "—"}
              sub="average days to finish"
              icon={Calendar}
              color="bg-violet-500/10 text-violet-500"
            />
            <StatCard label="Total Comments" value={stats.totalComments} sub={`${stats.avgCommentsPerTask} avg/task`} icon={MessageSquare} color="bg-teal-500/10 text-teal-500" />
          </div>

          {/* Priority breakdown */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Priority Breakdown</p>
            <div className="space-y-2.5">
              <PriorityBar label="Urgent" count={stats.byPriority.urgent ?? 0} total={stats.total} color="bg-red-500" />
              <PriorityBar label="High" count={stats.byPriority.high ?? 0} total={stats.total} color="bg-orange-500" />
              <PriorityBar label="Medium" count={stats.byPriority.medium ?? 0} total={stats.total} color="bg-blue-500" />
              <PriorityBar label="Low" count={stats.byPriority.low ?? 0} total={stats.total} color="bg-slate-400" />
            </div>
          </div>

          {/* Status breakdown */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Status Breakdown</p>
            <div className="space-y-2.5">
              <PriorityBar label="To Do" count={stats.byStatus.todo ?? 0} total={stats.total} color="bg-slate-400" />
              <PriorityBar label="In Progress" count={stats.byStatus.in_progress ?? 0} total={stats.total} color="bg-blue-500" />
              <PriorityBar label="In Review" count={stats.byStatus.review ?? 0} total={stats.total} color="bg-amber-500" />
              <PriorityBar label="Done" count={stats.byStatus.done ?? 0} total={stats.total} color="bg-green-500" />
              <PriorityBar label="Cancelled" count={stats.byStatus.cancelled ?? 0} total={stats.total} color="bg-red-400" />
            </div>
          </div>

          {/* Assignee breakdown */}
          {stats.assignees.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Assignee Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">Name</th>
                      <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-4">Total</th>
                      <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-4">Open</th>
                      <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-4">Done</th>
                      <th className="text-left text-xs text-muted-foreground font-medium pb-2 pl-4">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.assignees.map(a => {
                      const pct = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0;
                      return (
                        <tr key={a.name}>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{a.name[0]?.toUpperCase()}</span>
                              </div>
                              <span className="text-foreground font-medium text-xs">{a.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center text-xs font-semibold text-foreground">{a.total}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">{a.open}</span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">{a.done}</span>
                          </td>
                          <td className="py-2.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-secondary/50 rounded-full h-1.5" style={{ minWidth: 80 }}>
                                <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"tasks" | "members" | "reports">("tasks");
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
  const memberUsernames = (project?.members.map(m => m.username).filter(Boolean) ?? []) as string[];

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
        <button
          onClick={() => setTab("reports")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "reports" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BarChart2 className="w-4 h-4" /> Reports
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

      {tab === "reports" && (
        <ReportsTab projectId={projectId} memberUsernames={memberUsernames} />
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
