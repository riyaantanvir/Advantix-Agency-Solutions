import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Plus, FolderKanban, Users, CheckSquare, Pencil, Trash2, X, Loader2, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Project = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  status: string;
  memberCount: number;
  taskCount: number;
  createdAt: string;
};

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981",
  "#14b8a6", "#f59e0b", "#ef4444", "#6366f1", "#84cc16",
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

export default function AllProjects() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0] });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => apiFetch(`/api/admin/projects`),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch(`/api/admin/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowModal(false);
      setForm({ name: "", description: "", color: COLORS[0] });
      toast({ title: "Project created" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; description: string; color: string }) =>
      apiFetch(`/api/admin/projects/${data.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditProject(null);
      toast({ title: "Project updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects"] }); toast({ title: "Project deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editProject) {
      updateMutation.mutate({ id: editProject.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setForm({ name: p.name, description: p.description ?? "", color: p.color });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => { setEditProject(null); setForm({ name: "", description: "", color: COLORS[0] }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FolderKanban className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">No projects yet. Create your first one.</p>
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4 mr-2" /> New Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all cursor-pointer group relative"
              onClick={() => navigate(`/pm/projects/${p.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: p.color + "22" }}>
                    <FolderKanban className="w-5 h-5" style={{ color: p.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{p.name}</h3>
                    {p.status === "archived" && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Archive className="w-3 h-3" /> Archived</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button className="p-1.5 rounded-lg hover:bg-secondary/60" onClick={() => openEdit(p)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-destructive/10" onClick={() => {
                    if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id);
                  }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                  </button>
                </div>
              </div>

              {p.description && (
                <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{p.description}</p>
              )}

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckSquare className="w-3.5 h-3.5" /> {p.taskCount} task{p.taskCount !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" /> {p.memberCount} member{p.memberCount !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl" style={{ backgroundColor: p.color }} />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(showModal || editProject) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setShowModal(false); setEditProject(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold">{editProject ? "Edit Project" : "New Project"}</h2>
                <button onClick={() => { setShowModal(false); setEditProject(null); }} className="p-1.5 rounded-lg hover:bg-secondary/60">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Project Name *</label>
                  <Input
                    placeholder="e.g. Website Redesign"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="What is this project about?"
                    value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setForm(f => ({ ...f, color: c }))}
                        className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-offset-card ring-white scale-110" : "hover:scale-105"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => { setShowModal(false); setEditProject(null); }}>Cancel</Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editProject ? "Save Changes" : "Create Project"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
