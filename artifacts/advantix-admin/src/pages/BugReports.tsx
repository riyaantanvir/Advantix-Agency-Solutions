import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bug, Search, Trash2, ChevronDown, ChevronUp, AlertCircle,
  CheckCircle2, Clock, XCircle, ImageIcon, StickyNote, ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface BugReport {
  id: number;
  title: string;
  description: string;
  screenshot: string | null;
  status: string;
  priority: string;
  reporterName: string | null;
  reporterEmail: string | null;
  pageUrl: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: <AlertCircle className="w-3 h-3" /> },
  fixed: { label: "Fixed", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  wont_fix: { label: "Won't Fix", color: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: <XCircle className="w-3 h-3" /> },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  medium: { label: "Medium", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  high: { label: "High", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  critical: { label: "Critical", color: "bg-red-700/20 text-red-300 border-red-700/30" },
};

export default function BugReports() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: number; note: string } | null>(null);
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bugs = [], isLoading } = useQuery<BugReport[]>({
    queryKey: ["bugs"],
    queryFn: async () => {
      const res = await fetch("/api/bugs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; status?: string; priority?: string; adminNote?: string }) => {
      const res = await fetch(`/api/bugs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      toast({ title: "Bug report updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/bugs/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      toast({ title: "Bug report deleted" });
    },
  });

  const filtered = bugs.filter(b => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      (b.reporterName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.reporterEmail ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: bugs.length,
    pending: bugs.filter(b => b.status === "pending").length,
    in_progress: bugs.filter(b => b.status === "in_progress").length,
    fixed: bugs.filter(b => b.status === "fixed").length,
    wont_fix: bugs.filter(b => b.status === "wont_fix").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
          <Bug className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Bug Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track and resolve user-reported bugs</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["all", "pending", "in_progress", "fixed", "wont_fix"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`p-3 rounded-xl border text-left transition-all ${filterStatus === s ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
          >
            <div className="text-xl font-bold text-foreground">{counts[s]}</div>
            <div className="text-xs text-muted-foreground capitalize">{s === "all" ? "Total" : s === "in_progress" ? "In Progress" : s === "wont_fix" ? "Won't Fix" : s}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by title, reporter name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Bug list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bug className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No bug reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(bug => {
            const isExpanded = expandedId === bug.id;
            const statusCfg = STATUS_CONFIG[bug.status] ?? STATUS_CONFIG.pending;
            const priorityCfg = PRIORITY_CONFIG[bug.priority] ?? PRIORITY_CONFIG.medium;
            return (
              <div key={bug.id} className="border border-border rounded-xl bg-card overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : bug.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{bug.title}</span>
                      <Badge className={`text-xs border ${statusCfg.color} flex items-center gap-1`}>
                        {statusCfg.icon}{statusCfg.label}
                      </Badge>
                      <Badge className={`text-xs border ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
                      {bug.screenshot && <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" title="Has screenshot" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{format(new Date(bug.createdAt), "MMM d, yyyy · HH:mm")}</span>
                      {bug.reporterName && <span>· {bug.reporterName}</span>}
                      {bug.reporterEmail && <span>· {bug.reporterEmail}</span>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{bug.description}</p>
                    </div>

                    {/* Page URL */}
                    {bug.pageUrl && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Page URL</p>
                        <a href={bug.pageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                          {bug.pageUrl} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Screenshot */}
                    {bug.screenshot && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Screenshot</p>
                        <img
                          src={bug.screenshot}
                          alt="Bug screenshot"
                          className="max-h-48 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setScreenshotModal(bug.screenshot!)}
                        />
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
                      {/* Status selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Status:</span>
                        <select
                          value={bug.status}
                          onChange={e => updateMutation.mutate({ id: bug.id, status: e.target.value })}
                          className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="fixed">Fixed</option>
                          <option value="wont_fix">Won't Fix</option>
                        </select>
                      </div>

                      {/* Priority selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Priority:</span>
                        <select
                          value={bug.priority}
                          onChange={e => updateMutation.mutate({ id: bug.id, priority: e.target.value })}
                          className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                        onClick={() => { if (confirm("Delete this bug report?")) deleteMutation.mutate(bug.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                    </div>

                    {/* Admin Note */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Note</p>
                      </div>
                      {editingNote?.id === bug.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground resize-none min-h-[80px]"
                            value={editingNote.note}
                            onChange={e => setEditingNote({ id: bug.id, note: e.target.value })}
                            placeholder="Add a note..."
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => { updateMutation.mutate({ id: bug.id, adminNote: editingNote.note }); setEditingNote(null); }}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors min-h-[40px]"
                          onClick={() => setEditingNote({ id: bug.id, note: bug.adminNote ?? "" })}
                        >
                          {bug.adminNote || <span className="text-muted-foreground italic">Click to add a note...</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Screenshot fullscreen modal */}
      {screenshotModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setScreenshotModal(null)}
        >
          <img
            src={screenshotModal}
            alt="Screenshot"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
            onClick={() => setScreenshotModal(null)}
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
