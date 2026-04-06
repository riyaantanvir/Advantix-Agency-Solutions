import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Users, Download, Trash2, RefreshCw, Loader2, Search, UserX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Subscriber = {
  id: number; email: string; name: string | null; source: string;
  active: boolean; subscribed_at: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EmailSubscribers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");

  const { data: subscribers = [], isLoading } = useQuery<Subscriber[]>({
    queryKey: ["email-subscribers", filter],
    queryFn: () =>
      fetch(`/api/admin/subscribers?active=${filter === "all" ? "all" : "true"}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const unsubMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/subscribers/${id}`, { method: "DELETE", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-subscribers"] }); toast({ title: "Unsubscribed" }); },
    onError: () => toast({ variant: "destructive", title: "Error unsubscribing" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/subscribers/${id}/hard`, { method: "DELETE", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-subscribers"] }); toast({ title: "Deleted permanently" }); },
    onError: () => toast({ variant: "destructive", title: "Error deleting subscriber" }),
  });

  const filtered = subscribers.filter(s =>
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const rows = [["Email", "Name", "Source", "Status", "Subscribed At"]];
    subscribers.forEach(s => rows.push([s.email, s.name ?? "", s.source, s.active ? "Active" : "Unsubscribed", formatDate(s.subscribed_at)]));
    const csv = rows.map(r => r.map(f => `"${f}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `subscribers-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Email Subscribers</h1>
            <p className="text-sm text-muted-foreground">Manage newsletter and email capture subscribers</p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          disabled={subscribers.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-foreground">{subscribers.filter(s => s.active).length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total (ever)</p>
              <p className="text-2xl font-bold text-foreground">{subscribers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This month</p>
              <p className="text-2xl font-bold text-foreground">
                {subscribers.filter(s => new Date(s.subscribed_at) > new Date(Date.now() - 30 * 24 * 3600e3)).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Subscribers Table */}
      <Card className="p-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search email or name…"
              className="w-full pl-8 pr-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex rounded-lg overflow-hidden border border-border/50">
            {(["active", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:text-foreground"}`}
              >
                {f === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["email-subscribers"] })} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">{search ? "No results found" : "No subscribers yet"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Source</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Subscribed</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-foreground">{s.email}</td>
                    <td className="py-2.5 px-3 text-muted-foreground hidden sm:table-cell">{s.name ?? "—"}</td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <span className="px-2 py-0.5 bg-secondary text-muted-foreground text-[10px] rounded-full">{s.source}</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs hidden lg:table-cell">{formatDate(s.subscribed_at)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {s.active ? "Active" : "Unsubscribed"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1 justify-end">
                        {s.active && (
                          <button
                            onClick={() => unsubMutation.mutate(s.id)}
                            className="p-1.5 text-muted-foreground hover:text-amber-400 transition-colors"
                            title="Unsubscribe"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm("Permanently delete?")) deleteMutation.mutate(s.id); }}
                          className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
