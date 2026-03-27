import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Shield, Plus, Trash2, Loader2, Search,
  UserCheck, UserCog, AlertTriangle, Mail, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = "/api";

interface ToolUser {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

interface AdminUser {
  id: number;
  username: string;
  createdAt: string;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <p className="text-3xl font-display font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ConfirmDialog({
  open, onOpenChange, title, description, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UsersTabProps {
  users: ToolUser[];
  isLoading: boolean;
}

function UsersTab({ users, isLoading }: UsersTabProps) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ToolUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [formError, setFormError] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      apiFetch(`${BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "" });
      setFormError("");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${BASE}/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50"
          />
        </div>
        <Button onClick={() => { setCreateOpen(true); setForm({ name: "", email: "", password: "" }); setFormError(""); }}
          className="bg-primary text-primary-foreground font-semibold rounded-xl px-5 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Create User
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{search ? "No users match your search." : "No users yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/20">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Joined</th>
                  <th className="px-5 py-3.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <tr key={user.id} className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm text-foreground">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {formatDate(user.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(user)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" /> Create New User
            </DialogTitle>
            <DialogDescription className="sr-only">Fill in the details to create a new portal user account.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Full Name</label>
              <Input placeholder="Jane Doe" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-secondary/50" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Email Address</label>
              <Input type="email" placeholder="jane@example.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="bg-secondary/50" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input type="password" placeholder="Min. 6 characters" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="bg-secondary/50" required minLength={6} />
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-xl">{formError}</p>
            )}
            <DialogFooter className="pt-3 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-primary text-primary-foreground">
                {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete User"
        description={`Are you sure you want to delete "${deleteTarget?.name}" (${deleteTarget?.email})? This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

interface AdminsTabProps {
  admins: AdminUser[];
  isLoading: boolean;
  meUsername: string | undefined;
}

function AdminsTab({ admins, isLoading, meUsername }: AdminsTabProps) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [formError, setFormError] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiFetch(`${BASE}/admin/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Admin created successfully" });
      setCreateOpen(false);
      setForm({ username: "", password: "", confirm: "" });
      setFormError("");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${BASE}/admin/admins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Admin deleted" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const filtered = admins.filter((a) =>
    a.username.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (form.password !== form.confirm) {
      setFormError("Passwords do not match");
      return;
    }
    createMutation.mutate({ username: form.username, password: form.password });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search admins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50"
          />
        </div>
        <Button onClick={() => { setCreateOpen(true); setForm({ username: "", password: "", confirm: "" }); setFormError(""); }}
          className="bg-primary text-primary-foreground font-semibold rounded-xl px-5 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Create Admin
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{search ? "No admins match your search." : "No admins found."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/20">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Created</th>
                  <th className="px-5 py-3.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((admin, i) => {
                  const isSelf = admin.username === meUsername;
                  return (
                    <tr key={admin.id} className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center text-sm font-bold shrink-0">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{admin.username}</span>
                            {isSelf && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">You</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          {formatDate(admin.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                          onClick={() => setDeleteTarget(admin)}
                          disabled={isSelf}
                          title={isSelf ? "Cannot delete your own account" : "Delete admin"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Admin Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <UserCog className="w-5 h-5 text-primary" /> Create New Admin
            </DialogTitle>
            <DialogDescription className="sr-only">Fill in the details to create a new administrator account.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <Input placeholder="e.g. john_admin" value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="bg-secondary/50" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input type="password" placeholder="Min. 6 characters" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="bg-secondary/50" required minLength={6} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Confirm Password</label>
              <Input type="password" placeholder="Repeat password" value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                className="bg-secondary/50" required />
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-xl">{formError}</p>
            )}
            <DialogFooter className="pt-3 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-primary text-primary-foreground">
                {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create Admin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete Admin"
        description={`Are you sure you want to delete admin "${deleteTarget?.username}"? This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

export default function UserManagement() {
  const [tab, setTab] = useState<"users" | "admins">("users");

  const { data: me } = useQuery<{ authenticated: boolean; username: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => apiFetch(`${BASE}/auth/me`),
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<ToolUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiFetch(`${BASE}/admin/users`),
  });

  const { data: admins = [], isLoading: adminsLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/admins"],
    queryFn: () => apiFetch(`${BASE}/admin/admins`),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">User Management</h1>
        <p className="text-muted-foreground mt-1">Manage portal users and administrator accounts.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Users" value={users.length} icon={Users} color="bg-blue-500/10 text-blue-400" />
        <StatCard label="Total Admins" value={admins.length} icon={Shield} color="bg-violet-500/10 text-violet-400" />
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-secondary/40 p-1 rounded-xl w-fit">
        {(["users", "admins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? <Users className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            {t === "users" ? "Users" : "Admins"}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === t ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {t === "users" ? users.length : admins.length}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content — data passed from parent to avoid duplicate fetches */}
      {tab === "users" ? (
        <UsersTab users={users} isLoading={usersLoading} />
      ) : (
        <AdminsTab admins={admins} isLoading={adminsLoading} meUsername={me?.username} />
      )}
    </div>
  );
}
