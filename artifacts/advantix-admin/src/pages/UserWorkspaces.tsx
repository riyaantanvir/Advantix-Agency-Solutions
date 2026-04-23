import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderKanban, Users, ListTodo, Trash2, Eye, Search, Crown } from "lucide-react";
import { toast } from "sonner";

interface AdminWorkspace {
  id: number; name: string; slug: string; invite_code: string;
  owner_tool_user_id: number;
  owner_name: string | null; owner_email: string | null;
  created_at: string; updated_at: string;
  member_count: string | number;
  project_count: string | number;
  task_count: string | number;
  open_task_count: string | number;
}
interface DetailMember { id: number; role: string; joined_at: string; tool_user_id: number; name: string | null; email: string | null; }
interface DetailProject { id: number; name: string; description: string | null; color: string; status: string; task_count: string | number; created_at: string; }
interface DetailTask { id: number; title: string; status: string; priority: string; due_date: string | null; project_id: number | null; created_at: string; assigned_name: string | null; project_name: string | null; }
interface Detail { workspace: AdminWorkspace; members: DetailMember[]; projects: DetailProject[]; tasks: DetailTask[]; }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${r.status}`); }
  return r.json();
}

export default function UserWorkspaces() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await call<{ workspaces: AdminWorkspace[] }>("/api/admin/user-workspaces"); setWorkspaces(r.workspaces); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function openDetail(id: number) {
    setDetailLoading(true);
    try { const d = await call<Detail>(`/api/admin/user-workspaces/${id}`); setDetail(d); }
    catch (e) { toast.error((e as Error).message); }
    finally { setDetailLoading(false); }
  }
  async function remove(w: AdminWorkspace) {
    if (!confirm(`Force-delete "${w.name}"? Owner: ${w.owner_email}. All projects and tasks will be lost.`)) return;
    try { await call(`/api/admin/user-workspaces/${w.id}`, { method: "DELETE" }); toast.success("Deleted"); load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? workspaces.filter(w =>
        w.name.toLowerCase().includes(ql)
        || (w.owner_email ?? "").toLowerCase().includes(ql)
        || (w.owner_name ?? "").toLowerCase().includes(ql))
    : workspaces;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FolderKanban className="w-6 h-6 text-primary" /> User Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">All user-created workspaces from "Manage Your Project" tool. Super-power oversight.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or owner email…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No workspaces match.</Card>
      ) : (
        <Card className="divide-y divide-border/40">
          {filtered.map(w => (
            <div key={w.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderKanban className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Owner: <span className="text-foreground">{w.owner_name ?? "?"}</span> · {w.owner_email ?? "—"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <span><Users className="w-3 h-3 inline mr-1" />{Number(w.member_count)} members</span>
                    <span><FolderKanban className="w-3 h-3 inline mr-1" />{Number(w.project_count)} projects</span>
                    <span><ListTodo className="w-3 h-3 inline mr-1" />{Number(w.task_count)} tasks ({Number(w.open_task_count)} open)</span>
                    <span>· created {new Date(w.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" onClick={() => openDetail(w.id)}><Eye className="w-3.5 h-3.5 mr-1" /> Inspect</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => remove(w)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.workspace.name ?? "Loading…"}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="text-xs text-muted-foreground">
                Owner: <span className="text-foreground font-medium">{detail.workspace.owner_name}</span> ({detail.workspace.owner_email}) · invite code: <code>{detail.workspace.invite_code}</code>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Members ({detail.members.length})</h4>
                <Card className="divide-y divide-border/30">
                  {detail.members.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 text-sm">
                      <span className="flex items-center gap-2">{m.name ?? m.email}
                        {m.role === "owner" && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400"><Crown className="w-2.5 h-2.5 mr-0.5" /> owner</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{m.email}</span>
                    </div>
                  ))}
                </Card>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Projects ({detail.projects.length})</h4>
                <Card className="divide-y divide-border/30">
                  {detail.projects.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{Number(p.task_count)} tasks · {p.status}</span>
                    </div>
                  ))}
                  {detail.projects.length === 0 && <div className="p-3 text-xs text-muted-foreground">No projects.</div>}
                </Card>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Recent tasks ({detail.tasks.length})</h4>
                <Card className="divide-y divide-border/30 max-h-72 overflow-y-auto">
                  {detail.tasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.project_name ?? "—"} · {t.status} · {t.priority}{t.assigned_name ? ` · ${t.assigned_name}` : ""}
                        </div>
                      </div>
                      {t.due_date && <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{new Date(t.due_date).toLocaleDateString()}</span>}
                    </div>
                  ))}
                  {detail.tasks.length === 0 && <div className="p-3 text-xs text-muted-foreground">No tasks.</div>}
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
