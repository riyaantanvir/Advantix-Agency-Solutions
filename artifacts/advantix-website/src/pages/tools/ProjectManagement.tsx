import { useEffect, useState } from "react";
import { Route, Switch, useLocation, useRoute, Link } from "wouter";
import { Plus, ChevronDown, FolderKanban, Users, Settings as SettingsIcon, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace, WorkspaceProvider } from "@/context/WorkspaceContext";
import { useToolsUser } from "@/context/ToolsUserContext";
import { workspaceApi } from "@/lib/workspaceApi";
import { toast } from "sonner";
import { AllProjects } from "./projectManagement/AllProjects";
import { ProjectDetail } from "./projectManagement/ProjectDetail";
import { MembersPage } from "./projectManagement/MembersPage";
import { TelegramSettings } from "./projectManagement/TelegramSettings";

function WorkspaceSwitcher({ onCreateClick }: { onCreateClick: () => void }) {
  const { workspaces, current, switchTo } = useWorkspace();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const { refresh } = useWorkspace();
  const isOwner = current?.role === "owner";

  async function doRename() {
    if (!current || !renameValue.trim()) return;
    try {
      await workspaceApi.rename(current.id, renameValue.trim());
      toast.success("Renamed");
      setRenameOpen(false);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doDelete() {
    if (!current) return;
    if (!confirm(`Delete workspace "${current.name}"? All projects, tasks and members will be lost.`)) return;
    try { await workspaceApi.remove(current.id); toast.success("Workspace deleted"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 max-w-xs">
            <FolderKanban className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate font-semibold">{current?.name ?? "Select workspace"}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Your workspaces</div>
          {workspaces.map(w => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)} className={w.id === current?.id ? "bg-primary/10" : ""}>
              <div className="flex flex-col min-w-0">
                <span className="truncate font-medium">{w.name}</span>
                <span className="text-[10px] text-muted-foreground">{w.role} · {w.member_count} member{Number(w.member_count) === 1 ? "" : "s"}</span>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreateClick}><Plus className="w-3.5 h-3.5 mr-2" /> New workspace</DropdownMenuItem>
          {isOwner && current && (
            <>
              <DropdownMenuItem onClick={() => { setRenameValue(current.name); setRenameOpen(true); }}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Rename current
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-500" onClick={doDelete}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete current
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename workspace</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={doRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!name.trim()) return;
    setBusy(true);
    try { await createWorkspace(name.trim()); toast.success("Workspace created"); setName(""); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Workspace</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Workspace name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Team"
            onKeyDown={e => { if (e.key === "Enter") go(); }} autoFocus />
          <p className="text-xs text-muted-foreground">A workspace groups projects, tasks and members. You can have multiple workspaces.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy || !name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectManagementInner() {
  const { user, loading: userLoading } = useToolsUser();
  const { workspaces, current, loading } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [, navigate] = useLocation();
  const [, projectMatch] = useRoute("/tools/project-management/projects/:id");
  const [, membersMatch] = useRoute("/tools/project-management/members");
  const [, telegramMatch] = useRoute("/tools/project-management/telegram");

  /* Auto-open create dialog if user has no workspaces */
  useEffect(() => {
    if (!loading && !userLoading && user && workspaces.length === 0) {
      setCreateOpen(true);
    }
  }, [loading, userLoading, user, workspaces.length]);

  if (userLoading || loading) {
    return <div className="pt-28 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) {
    return (
      <div className="pt-28 pb-20 min-h-screen container mx-auto px-4 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Sign in required</h1>
        <p className="text-sm text-muted-foreground mb-6">Please sign in to your Advantix Tools account to manage projects.</p>
        <Link href="/login"><Button>Sign in</Button></Link>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="pt-28 pb-20 min-h-screen container mx-auto px-4 max-w-md">
        <Card className="p-8 text-center">
          <FolderKanban className="w-12 h-12 mx-auto text-primary/60 mb-4" />
          <h1 className="text-xl font-bold mb-2">Welcome to Project Manager</h1>
          <p className="text-sm text-muted-foreground mb-5">Create your first workspace to organise projects, tasks and team members.</p>
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create workspace</Button>
        </Card>
        <CreateWorkspaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    );
  }

  const activeTab = projectMatch ? "projects" : membersMatch ? "members" : telegramMatch ? "telegram" : "projects";

  return (
    <div className="pt-24 pb-20 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-display font-bold">Manage Your Project</h1>
          </div>
          <WorkspaceSwitcher onCreateClick={() => setCreateOpen(true)} />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => {
          if (v === "projects") navigate("/tools/project-management");
          else navigate(`/tools/project-management/${v}`);
        }}>
          <TabsList className="mb-5">
            <TabsTrigger value="projects"><FolderKanban className="w-4 h-4 mr-1.5" /> Projects</TabsTrigger>
            <TabsTrigger value="members"><Users className="w-4 h-4 mr-1.5" /> Members</TabsTrigger>
            <TabsTrigger value="telegram"><SettingsIcon className="w-4 h-4 mr-1.5" /> Alerts</TabsTrigger>
          </TabsList>
        </Tabs>

        {!current ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Select a workspace to continue.</div>
        ) : (
          <Switch>
            <Route path="/tools/project-management/projects/:id">
              {(params) => <ProjectDetail projectId={parseInt(params.id, 10)} />}
            </Route>
            <Route path="/tools/project-management/members"><MembersPage /></Route>
            <Route path="/tools/project-management/telegram"><TelegramSettings /></Route>
            <Route><AllProjects /></Route>
          </Switch>
        )}

        <CreateWorkspaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </div>
  );
}

export default function ProjectManagement() {
  return (
    <WorkspaceProvider>
      <ProjectManagementInner />
    </WorkspaceProvider>
  );
}
