import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Users, Search, Save, Loader2, ChevronDown, ChevronRight,
  Link2, Video, Headphones, Sparkles, Check, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ──────────────────────────────────────────────── */
type Tool = { slug: string; name: string; description: string };
type ToolUser = {
  id: number; name: string; email: string; created_at: string;
  tools: Record<string, boolean>;
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "url-shortener":   Link2,
  "screen-recorder": Video,
  "pdf-audio":       Headphones,
  "advantix-ai":     Sparkles,
};

const TOOL_COLORS: Record<string, string> = {
  "url-shortener":   "text-blue-400 bg-blue-500/10",
  "screen-recorder": "text-purple-400 bg-purple-500/10",
  "pdf-audio":       "text-orange-400 bg-orange-500/10",
  "advantix-ai":     "text-violet-400 bg-violet-500/10",
};

function ToolToggle({ slug, name, enabled, onChange }: { slug: string; name: string; enabled: boolean; onChange: (v: boolean) => void }) {
  const Icon = TOOL_ICONS[slug] ?? ShieldCheck;
  const color = TOOL_COLORS[slug] ?? "text-primary bg-primary/10";
  const [iconCls, bgCls] = color.split(" ");
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${enabled ? "border-green-500/30 bg-green-500/5" : "border-border/40 bg-secondary/20"}`}>
      <div className={`w-8 h-8 rounded-lg ${bgCls} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${iconCls}`} />
      </div>
      <span className="flex-1 text-sm font-medium text-foreground truncate">{name}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${enabled ? "bg-green-500" : "bg-secondary border border-border/50"}`}
      >
        <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transform transition-transform ${enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function UserPermission() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [userTools, setUserTools] = useState<Record<number, Record<string, boolean>>>({});
  const [savingUser, setSavingUser] = useState<number | null>(null);

  /* ── Defaults ── */
  const { data: defData, isLoading: defLoading } = useQuery<{ tools: Tool[]; defaults: string[] }>({
    queryKey: ["tool-permission-defaults"],
    queryFn: () => fetch("/api/settings/tool-permissions/defaults", { credentials: "include" }).then(r => r.json()),
  });
  const [defaults, setDefaults] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (defData) {
      const map: Record<string, boolean> = {};
      defData.tools.forEach(t => { map[t.slug] = defData.defaults.includes(t.slug); });
      setDefaults(map);
    }
  }, [defData]);

  const defaultsSave = useMutation({
    mutationFn: () => fetch("/api/admin/settings/tool-permissions/defaults", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults: Object.keys(defaults).filter(k => defaults[k]) }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tool-permission-defaults"] }); toast({ title: "Default permissions saved" }); },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  /* ── Users ── */
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: ToolUser[]; allTools: Tool[] }>({
    queryKey: ["tool-permission-users"],
    queryFn: () => fetch("/api/admin/tool-permissions/users", { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (usersData) {
      const map: Record<number, Record<string, boolean>> = {};
      usersData.users.forEach(u => { map[u.id] = { ...u.tools }; });
      setUserTools(map);
    }
  }, [usersData]);

  const saveUserPerms = async (userId: number) => {
    setSavingUser(userId);
    try {
      await fetch(`/api/admin/tool-permissions/users/${userId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: userTools[userId] }),
      });
      qc.invalidateQueries({ queryKey: ["tool-permission-users"] });
      toast({ title: "User permissions updated" });
    } catch {
      toast({ variant: "destructive", title: "Save failed" });
    } finally {
      setSavingUser(null);
    }
  };

  const allTools = defData?.tools ?? usersData?.allTools ?? [];
  const filteredUsers = (usersData?.users ?? []).filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = (tools: Record<string, boolean>) =>
    Object.values(tools).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">User Permission</h1>
          <p className="text-sm text-muted-foreground">Set default tools for new users and manage individual access</p>
        </div>
      </div>

      {/* ── Default Tools ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Default Tools for New Users</h2>
            <p className="text-xs text-muted-foreground mt-0.5">These tools are assigned automatically when someone creates a new account</p>
          </div>
          <button
            onClick={() => defaultsSave.mutate()}
            disabled={defaultsSave.isPending || defLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {defaultsSave.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Defaults
          </button>
        </div>

        {defLoading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allTools.map(tool => (
              <ToolToggle
                key={tool.slug}
                slug={tool.slug}
                name={tool.name}
                enabled={defaults[tool.slug] ?? true}
                onChange={v => setDefaults(d => ({ ...d, [tool.slug]: v }))}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Enabled for new users</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary border border-border/50 inline-block" /> Disabled for new users</span>
        </div>
      </Card>

      {/* ── Per-User Permissions ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> User Tool Access
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Override tool access for individual users</p>
          </div>
          <span className="text-xs text-muted-foreground">{usersData?.users?.length ?? 0} users</span>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {usersLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading users…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {search ? "No users match your search" : "No users registered yet"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map(user => {
              const isOpen = expanded === user.id;
              const tools = userTools[user.id] ?? user.tools;
              const count = enabledCount(tools);
              const total = allTools.length;
              return (
                <div key={user.id} className="border border-border/50 rounded-xl overflow-hidden">
                  {/* Row header */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : user.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{user.name[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    {/* Tool count badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${count === total ? "bg-green-500/10 text-green-400" : count === 0 ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {count === total ? <Check className="w-3 h-3" /> : count === 0 ? <X className="w-3 h-3" /> : null}
                        {count}/{total} tools
                      </span>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded tool toggles */}
                  {isOpen && (
                    <div className="border-t border-border/50 p-4 bg-secondary/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {allTools.map(tool => (
                          <ToolToggle
                            key={tool.slug}
                            slug={tool.slug}
                            name={tool.name}
                            enabled={tools[tool.slug] ?? true}
                            onChange={v => setUserTools(prev => ({
                              ...prev,
                              [user.id]: { ...(prev[user.id] ?? tools), [tool.slug]: v },
                            }))}
                          />
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => saveUserPerms(user.id)}
                          disabled={savingUser === user.id}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          {savingUser === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {savingUser === user.id ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
