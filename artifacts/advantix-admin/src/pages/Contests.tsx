import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, X, Calendar, Users, Trophy, Clock,
  Loader2, Eye, FileImage, Award, ChevronLeft, Download, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Contest = {
  id: number;
  title: string;
  description: string;
  type: string;
  instructions: string | null;
  rules: string | null;
  prize: string | null;
  coverImageUrl: string | null;
  deadline: string;
  status: string;
  winnerSubmissionId: string | null;
  isActive: boolean;
  participantCount: number;
  submissionCount: number;
  createdAt: string;
};

type Submission = {
  id: number;
  contestId: number;
  participantId: number;
  fileUrl: string;
  fileName: string | null;
  description: string | null;
  submittedAt: string;
  participantName: string;
  participantEmail: string;
};

type Participant = {
  id: number;
  contestId: number;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
};

type ContestDetail = Contest & {
  participants: Participant[];
  submissions: Submission[];
};

type ContestForm = {
  title: string;
  description: string;
  type: string;
  instructions: string;
  rules: string;
  prize: string;
  deadline: string;
  coverImageUrl: string;
  isActive: boolean;
};

const EMPTY_FORM: ContestForm = {
  title: "", description: "", type: "logo", instructions: "", rules: "",
  prize: "", deadline: "", coverImageUrl: "", isActive: false,
};

const CONTEST_TYPES = [
  { value: "logo", label: "Logo Design" },
  { value: "banner", label: "Banner Design" },
  { value: "poster", label: "Poster Design" },
  { value: "ui", label: "UI/UX Design" },
  { value: "illustration", label: "Illustration" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    judging: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };
  return map[status] || map.draft;
}

export default function Contests() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "form" | "detail">("list");
  const [editing, setEditing] = useState<Contest | null>(null);
  const [form, setForm] = useState<ContestForm>(EMPTY_FORM);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: contests = [], isLoading } = useQuery<Contest[]>({
    queryKey: ["admin-contests"],
    queryFn: () => apiFetch("/api/admin/contests"),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<ContestDetail>({
    queryKey: ["admin-contest-detail", detailId],
    queryFn: () => apiFetch(`/api/admin/contests/${detailId}`),
    enabled: !!detailId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: ContestForm) => {
      if (editing) {
        return apiFetch(`/api/admin/contests/${editing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
      }
      return apiFetch("/api/admin/contests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contests"] });
      toast({ title: editing ? "Contest updated" : "Contest created" });
      setView("list");
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/contests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contests"] });
      toast({ title: "Contest deleted" });
    },
  });

  const winnerMutation = useMutation({
    mutationFn: ({ contestId, submissionId }: { contestId: number; submissionId: number }) =>
      apiFetch(`/api/admin/contests/${contestId}/winner`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contests"] });
      qc.invalidateQueries({ queryKey: ["admin-contest-detail"] });
      toast({ title: "Winner selected!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setView("form");
  }

  function openEdit(c: Contest) {
    setEditing(c);
    setForm({
      title: c.title,
      description: c.description,
      type: c.type,
      instructions: c.instructions || "",
      rules: c.rules || "",
      prize: c.prize || "",
      deadline: c.deadline ? new Date(c.deadline).toISOString().slice(0, 16) : "",
      coverImageUrl: c.coverImageUrl || "",
      isActive: c.isActive,
    });
    setView("form");
  }

  function openDetail(c: Contest) {
    setDetailId(c.id);
    setView("detail");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description || !form.deadline) {
      toast({ title: "Please fill title, description, and deadline", variant: "destructive" });
      return;
    }
    saveMutation.mutate(form);
  }

  if (view === "detail" && detail) {
    return <ContestDetailView
      contest={detail}
      loading={detailLoading}
      onBack={() => { setView("list"); setDetailId(null); }}
      onSelectWinner={(subId) => {
        if (confirm("Are you sure you want to select this submission as the winner?")) {
          winnerMutation.mutate({ contestId: detail.id, submissionId: subId });
        }
      }}
    />;
  }

  if (view === "form") {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setView("list")}><ChevronLeft className="w-5 h-5" /></Button>
          <h1 className="text-2xl font-bold">{editing ? "Edit Contest" : "Create Contest"}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card border border-border rounded-2xl p-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Title *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Logo Design Competition" className="rounded-xl" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what this competition is about..."
              className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm appearance-none cursor-pointer">
                {CONTEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Deadline *</label>
              <Input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className="rounded-xl" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Prize</label>
            <Input value={form.prize} onChange={e => setForm(f => ({ ...f, prize: e.target.value }))}
              placeholder="e.g. $500 + Featured on website" className="rounded-xl" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Instructions</label>
            <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="Detailed instructions for participants..."
              className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Rules</label>
            <textarea value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))}
              placeholder="Contest rules and guidelines..."
              className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y" />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Cover Image URL</label>
            <Input value={form.coverImageUrl} onChange={e => setForm(f => ({ ...f, coverImageUrl: e.target.value }))}
              placeholder="https://..." className="rounded-xl" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
              Publish Contest (make visible to public)
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setView("list")} className="flex-1 rounded-xl">Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending} className="flex-1 rounded-xl gap-2">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Contest"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contests</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage competitions and select winners</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> New Contest
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : contests.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">No contests yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first competition to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contests.map(c => (
            <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all group cursor-pointer"
              onClick={() => openDetail(c)}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{c.title}</h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusBadge(c.status)}`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{
                      CONTEST_TYPES.find(t => t.value === c.type)?.label || c.type
                    }</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.participantCount} participants</span>
                    <span className="flex items-center gap-1"><FileImage className="w-3.5 h-3.5" />{c.submissionCount} submissions</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />
                      Deadline: {new Date(c.deadline).toLocaleDateString()} {new Date(c.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {new Date(c.deadline) < new Date() && c.status !== "completed" && (
                      <span className="text-red-500 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Expired</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm("Delete this contest and all submissions?")) deleteMutation.mutate(c.id); }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContestDetailView({ contest, loading, onBack, onSelectWinner }: {
  contest: ContestDetail;
  loading: boolean;
  onBack: () => void;
  onSelectWinner: (subId: number) => void;
}) {
  const [tab, setTab] = useState<"submissions" | "participants">("submissions");
  const isExpired = new Date(contest.deadline) < new Date();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{contest.title}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusBadge(contest.status)}`}>
              {contest.status.charAt(0).toUpperCase() + contest.status.slice(1)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{contest.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold">{contest.participants.length}</p>
          <p className="text-xs text-muted-foreground">Participants</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <FileImage className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold">{contest.submissions.length}</p>
          <p className="text-xs text-muted-foreground">Submissions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Calendar className="w-5 h-5 mx-auto mb-1 text-amber-500" />
          <p className="text-sm font-bold">{new Date(contest.deadline).toLocaleDateString()}</p>
          <p className="text-xs text-muted-foreground">{isExpired ? "Expired" : "Deadline"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Trophy className="w-5 h-5 mx-auto mb-1 text-purple-500" />
          <p className="text-sm font-bold truncate">{contest.prize || "No prize set"}</p>
          <p className="text-xs text-muted-foreground">Prize</p>
        </div>
      </div>

      {contest.winnerSubmissionId && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-amber-800 dark:text-amber-300">Winner Selected</h3>
          </div>
          {(() => {
            const winnerSub = contest.submissions.find(s => s.id === Number(contest.winnerSubmissionId));
            if (!winnerSub) return <p className="text-sm text-muted-foreground">Winner submission not found</p>;
            return (
              <div className="flex items-center gap-4">
                <img src={winnerSub.fileUrl} alt="Winner" className="w-20 h-20 rounded-xl object-cover border-2 border-amber-300" />
                <div>
                  <p className="font-semibold text-lg">{winnerSub.participantName}</p>
                  <p className="text-sm text-muted-foreground">{winnerSub.participantEmail}</p>
                  {winnerSub.description && <p className="text-sm mt-1">{winnerSub.description}</p>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <Button variant={tab === "submissions" ? "default" : "outline"} onClick={() => setTab("submissions")} className="rounded-xl gap-2">
          <FileImage className="w-4 h-4" /> Submissions ({contest.submissions.length})
        </Button>
        <Button variant={tab === "participants" ? "default" : "outline"} onClick={() => setTab("participants")} className="rounded-xl gap-2">
          <Users className="w-4 h-4" /> Participants ({contest.participants.length})
        </Button>
      </div>

      {tab === "submissions" ? (
        contest.submissions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileImage className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No submissions yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contest.submissions.map(s => {
              const isWinner = String(s.id) === contest.winnerSubmissionId;
              return (
                <div key={s.id} className={`bg-card border rounded-2xl overflow-hidden transition-all ${isWinner ? "border-amber-400 ring-2 ring-amber-300/50 shadow-lg" : "border-border hover:border-primary/30"}`}>
                  <div className="relative">
                    <img src={s.fileUrl} alt={s.fileName || "Submission"} className="w-full h-48 object-cover" />
                    {isWinner && (
                      <div className="absolute top-2 right-2 bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                        <Star className="w-3 h-3" /> Winner
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{s.participantName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.participantEmail}</p>
                    {s.description && <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{s.description}</p>}
                    {s.fileName && <p className="text-xs text-muted-foreground mt-1">{s.fileName}</p>}
                    {!isWinner && contest.status !== "completed" && (
                      <Button size="sm" onClick={() => onSelectWinner(s.id)} className="mt-3 w-full rounded-xl gap-2" variant="outline">
                        <Trophy className="w-3.5 h-3.5" /> Select as Winner
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        contest.participants.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No participants yet</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="text-left p-3 font-medium">Signed Up</th>
                </tr>
              </thead>
              <tbody>
                {contest.participants.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.email}</td>
                    <td className="p-3 text-muted-foreground">{p.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
