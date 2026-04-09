import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Users, Download, Trash2, RefreshCw, Loader2, Search,
  UserX, Plus, BookOpen, PauseCircle, PlayCircle, Send, ChevronDown,
  Rss, Globe,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Subscriber = {
  id: number; email: string; name: string | null; source: string;
  active: boolean; subscribed_at: string;
};

type BlogPost = {
  id: number; title: string; slug: string; published_at: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    blog:    "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    website: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    modal:   "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  };
  const cls = styles[source] ?? "bg-secondary text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      {source}
    </span>
  );
}

export default function EmailSubscribers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "blog">("all");

  // All-subscribers state
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");

  // Blog-subscribers state
  const [blogSearch, setBlogSearch] = useState("");
  const [blogFilter, setBlogFilter] = useState<"active" | "all">("active");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [selectedBlogId, setSelectedBlogId] = useState<number | "">("");
  const [sending, setSending] = useState(false);

  /* ── Queries ──────────────────────────────────────────── */

  const { data: allSubs = [], isLoading: allLoading } = useQuery<Subscriber[]>({
    queryKey: ["email-subscribers", filter],
    queryFn: () =>
      fetch(`/api/admin/subscribers?active=${filter === "all" ? "all" : "true"}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const { data: blogSubs = [], isLoading: blogLoading } = useQuery<Subscriber[]>({
    queryKey: ["blog-subscribers", blogFilter],
    queryFn: () =>
      fetch(`/api/admin/subscribers?source=blog&active=${blogFilter === "all" ? "all" : "true"}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const { data: blogPosts = [] } = useQuery<BlogPost[]>({
    queryKey: ["blog-notify-posts"],
    queryFn: () =>
      fetch("/api/admin/blog-notify/posts", { credentials: "include" })
        .then(r => r.json()),
    enabled: tab === "blog",
  });

  /* ── Mutations ─────────────────────────────────────────── */

  const toggleMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/subscribers/${id}/toggle`, { method: "PATCH", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-subscribers"] });
      qc.invalidateQueries({ queryKey: ["blog-subscribers"] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Error updating status" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/subscribers/${id}/hard`, { method: "DELETE", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-subscribers"] });
      qc.invalidateQueries({ queryKey: ["blog-subscribers"] });
      toast({ title: "Deleted permanently" });
    },
    onError: () => toast({ variant: "destructive", title: "Error deleting" }),
  });

  const addMutation = useMutation({
    mutationFn: (body: { email: string; name?: string; source: string }) =>
      fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog-subscribers"] });
      toast({ title: "Subscriber added!" });
      setShowAddModal(false);
      setAddEmail(""); setAddName("");
    },
    onError: () => toast({ variant: "destructive", title: "Failed to add subscriber" }),
  });

  /* ── Helpers ───────────────────────────────────────────── */

  const exportCSV = (data: Subscriber[], label: string) => {
    const rows = [["Email", "Name", "Source", "Status", "Subscribed At"]];
    data.forEach(s => rows.push([s.email, s.name ?? "", s.source, s.active ? "Active" : "Paused", formatDate(s.subscribed_at)]));
    const csv = rows.map(r => r.map(f => `"${f}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleForceSend = async () => {
    if (!selectedBlogId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/blog-notify/${selectedBlogId}`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: `Sent to ${d.sent} subscriber${d.sent !== 1 ? "s" : ""}`, description: d.failed ? `${d.failed} failed` : undefined });
      } else {
        toast({ variant: "destructive", title: "Send failed", description: d.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSending(false);
    }
  };

  const filteredAll = allSubs.filter(s =>
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredBlog = blogSubs.filter(s =>
    s.email.toLowerCase().includes(blogSearch.toLowerCase()) ||
    (s.name ?? "").toLowerCase().includes(blogSearch.toLowerCase())
  );

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
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
          onClick={() => exportCSV(tab === "blog" ? blogSubs : allSubs, tab === "blog" ? "blog-subscribers" : "all-subscribers")}
          className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/30 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Globe className="w-4 h-4" /> All Subscribers
        </button>
        <button
          onClick={() => setTab("blog")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "blog" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BookOpen className="w-4 h-4" /> Blog Subscribers
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === "blog" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {blogSubs.filter(s => s.active).length}
          </span>
        </button>
      </div>

      {/* ── ALL SUBSCRIBERS TAB ─────────────────────────────── */}
      {tab === "all" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard icon={<Users className="w-4 h-4 text-primary" />} color="primary" label="Active" value={allSubs.filter(s => s.active).length} />
            <StatCard icon={<Mail className="w-4 h-4 text-amber-400" />} color="amber" label="Total (ever)" value={allSubs.length} />
            <StatCard icon={<Mail className="w-4 h-4 text-green-400" />} color="green" label="This month"
              value={allSubs.filter(s => new Date(s.subscribed_at) > new Date(Date.now() - 30 * 24 * 3600e3)).length} />
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search email or name…"
                  className="w-full pl-8 pr-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <FilterToggle value={filter} onChange={setFilter} />
              <button onClick={() => qc.invalidateQueries({ queryKey: ["email-subscribers"] })} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <SubscriberTable
              loading={allLoading}
              items={filteredAll}
              showSource
              onToggle={id => toggleMutation.mutate(id)}
              onDelete={id => { if (confirm("Permanently delete?")) deleteMutation.mutate(id); }}
            />
          </Card>
        </>
      )}

      {/* ── BLOG SUBSCRIBERS TAB ─────────────────────────────── */}
      {tab === "blog" && (
        <>
          {/* Blog Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard icon={<Rss className="w-4 h-4 text-violet-400" />} color="violet" label="Active Blog Subs" value={blogSubs.filter(s => s.active).length} />
            <StatCard icon={<Users className="w-4 h-4 text-amber-400" />} color="amber" label="Total (ever)" value={blogSubs.length} />
            <StatCard icon={<PauseCircle className="w-4 h-4 text-red-400" />} color="red" label="Paused" value={blogSubs.filter(s => !s.active).length} />
          </div>

          {/* Force Send Blog Email */}
          <Card className="p-5 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Send className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground mb-1">Force Send Blog Notification</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Send a blog post notification to all active blog subscribers right now.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-56">
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <select
                      value={selectedBlogId}
                      onChange={e => setSelectedBlogId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full appearance-none pl-3 pr-8 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">— Select a blog post —</option>
                      {blogPosts.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleForceSend}
                    disabled={!selectedBlogId || sending || blogSubs.filter(s => s.active).length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Now
                  </button>
                </div>
                {blogSubs.filter(s => s.active).length === 0 && (
                  <p className="text-xs text-amber-400 mt-2">No active blog subscribers to send to.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Blog Subscribers List */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input type="text" value={blogSearch} onChange={e => setBlogSearch(e.target.value)}
                    placeholder="Search email or name…"
                    className="w-full pl-8 pr-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <FilterToggle value={blogFilter} onChange={setBlogFilter} />
                <button onClick={() => qc.invalidateQueries({ queryKey: ["blog-subscribers"] })} className="text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Subscriber
              </button>
            </div>
            <SubscriberTable
              loading={blogLoading}
              items={filteredBlog}
              showSource={false}
              onToggle={id => toggleMutation.mutate(id)}
              onDelete={id => { if (confirm("Permanently delete subscriber?")) deleteMutation.mutate(id); }}
            />
          </Card>
        </>
      )}

      {/* ── Add Subscriber Modal ──────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-display font-bold text-foreground mb-1">Add Blog Subscriber</h2>
            <p className="text-sm text-muted-foreground mb-5">Manually add an email to the blog notification list.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
                <input
                  type="email" required
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name (optional)</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2.5 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowAddModal(false); setAddEmail(""); setAddName(""); }}
                className="flex-1 px-4 py-2.5 bg-secondary text-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate({ email: addEmail, name: addName || undefined, source: "blog" })}
                disabled={!addEmail || addMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Subscriber
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function StatCard({ icon, color, label, value }: {
  icon: React.ReactNode; color: string; label: string; value: number;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10",
    amber: "bg-amber-500/10",
    green: "bg-green-500/10",
    violet: "bg-violet-500/10",
    red: "bg-red-500/10",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${colorMap[color] ?? "bg-primary/10"} flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function FilterToggle({ value, onChange }: {
  value: "active" | "all"; onChange: (v: "active" | "all") => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-border/50">
      {(["active", "all"] as const).map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-2 text-xs font-medium transition-colors ${value === f ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:text-foreground"}`}
        >
          {f === "active" ? "Active" : "All"}
        </button>
      ))}
    </div>
  );
}

function SubscriberTable({ loading, items, showSource, onToggle, onDelete }: {
  loading: boolean;
  items: Subscriber[];
  showSource: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">No subscribers found</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Email</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Name</th>
            {showSource && (
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Source</th>
            )}
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Subscribed</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {items.map(s => (
            <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
              <td className="py-2.5 px-3 font-mono text-xs text-foreground">{s.email}</td>
              <td className="py-2.5 px-3 text-muted-foreground hidden sm:table-cell">{s.name ?? "—"}</td>
              {showSource && (
                <td className="py-2.5 px-3 hidden md:table-cell">
                  <SourceBadge source={s.source} />
                </td>
              )}
              <td className="py-2.5 px-3 text-muted-foreground text-xs hidden lg:table-cell">{formatDate(s.subscribed_at)}</td>
              <td className="py-2.5 px-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {s.active ? "Active" : "Paused"}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => onToggle(s.id)}
                    className={`p-1.5 transition-colors ${s.active ? "text-muted-foreground hover:text-amber-400" : "text-muted-foreground hover:text-green-400"}`}
                    title={s.active ? "Pause" : "Unpause"}
                  >
                    {s.active ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
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
  );
}
