import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus, FolderKanban, Archive, Trash2, MoreVertical, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { workspaceApi, type WorkspaceProject } from "@/lib/workspaceApi";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";

const COLORS = ["#3b82f6","#8b5cf6","#ec4899","#ef4444","#f59e0b","#10b981","#14b8a6","#0ea5e9"];

export function AllProjects() {
  const { current } = useWorkspace();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceProject | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0] });

  async function load() {
    if (!current) return;
    setLoading(true);
    try {
      const r = await workspaceApi.listProjects(current.id);
      setProjects(r.projects);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: COLORS[0] });
    setCreateOpen(true);
  }
  function openEdit(p: WorkspaceProject) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", color: p.color });
    setCreateOpen(true);
  }

  async function save() {
    if (!current || !form.name.trim()) return;
    try {
      if (editing) {
        await workspaceApi.updateProject(current.id, editing.id, {
          name: form.name.trim(), description: form.description, color: form.color,
        });
        toast.success("Project updated");
      } else {
        await workspaceApi.createProject(current.id, {
          name: form.name.trim(), description: form.description, color: form.color,
        });
        toast.success("Project created");
      }
      setCreateOpen(false);
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function archive(p: WorkspaceProject) {
    if (!current) return;
    await workspaceApi.updateProject(current.id, p.id, {
      status: p.status === "archived" ? "active" : "archived",
    });
    toast.success(p.status === "archived" ? "Project restored" : "Project archived");
    load();
  }
  async function remove(p: WorkspaceProject) {
    if (!current) return;
    if (!confirm(`Delete project "${p.name}"? Tasks will be detached but kept.`)) return;
    await workspaceApi.deleteProject(current.id, p.id);
    toast.success("Project deleted");
    load();
  }

  if (!current) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">All Projects</h2>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> New Project</Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <Card className="p-8 text-center">
          <FolderKanban className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No projects yet. Create your first one to organise tasks.</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Create project</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(p => (
            <Card key={p.id} className={`p-4 transition-all hover:border-primary/40 ${p.status === "archived" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <Link href={`/tools/project-management/projects/${p.id}`} className="flex items-start gap-3 min-w-0 flex-1 group">
                  <div className="w-9 h-9 rounded-lg shrink-0" style={{ backgroundColor: `${p.color}22`, color: p.color }}>
                    <FolderKanban className="w-5 h-5 m-2" style={{ color: p.color }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm leading-tight truncate group-hover:text-primary">{p.name}</h3>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5 mr-2" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => archive(p)}>
                      <Archive className="w-3.5 h-3.5 mr-2" /> {p.status === "archived" ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-500" onClick={() => remove(p)}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
                <span>{Number(p.open_task_count ?? 0)} open</span>
                <span>·</span>
                <span>{Number(p.task_count ?? 0)} total</span>
                {p.status === "archived" && <span className="ml-auto text-amber-500">Archived</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Website redesign" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim()}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
