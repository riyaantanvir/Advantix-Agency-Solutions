import { useState } from "react";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  Trophy, Users, Calendar, Clock, ArrowLeft, Upload, Star,
  CheckCircle, AlertCircle, Sparkles, FileImage, User, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Submission = {
  id: number;
  fileUrl: string;
  fileName: string | null;
  description: string | null;
  submittedAt: string;
  participantName: string;
};

type ContestDetail = {
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
  submissions: Submission[];
  winner: { participantName: string; fileUrl: string; description: string | null } | null;
};

function timeLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days} days, ${hours} hours`;
  return `${hours} hours, ${mins} minutes`;
}

export default function ContestDetailPage() {
  const [, params] = useRoute("/contests/:id");
  const id = params?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"view" | "signup" | "submit">("view");
  const [signupForm, setSignupForm] = useState({ name: "", email: "", phone: "" });
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [participantEmail, setParticipantEmail] = useState("");
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitDesc, setSubmitDesc] = useState("");

  const { data: contest, isLoading, error } = useQuery<ContestDetail>({
    queryKey: ["public-contest", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/contests/${id}`);
      if (!res.ok) throw new Error("Contest not found");
      return res.json();
    },
    enabled: !!id,
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string }) => {
      const res = await fetch(`${BASE}/api/contests/${id}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Signup failed");
      return json;
    },
    onSuccess: (data) => {
      setParticipantId(data.id);
      setParticipantEmail(signupForm.email);
      setStep("submit");
      toast({ title: "Signed up successfully!", description: "Now you can submit your work." });
      qc.invalidateQueries({ queryKey: ["public-contest", id] });
    },
    onError: async (e: Error & { participantId?: number }) => {
      if (e.message.includes("already signed up")) {
        setParticipantEmail(signupForm.email);
        setStep("submit");
        toast({ title: "Welcome back!", description: "You're already registered. Submit your work now." });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!submitFile) throw new Error("Please select a file");
      const formData = new FormData();
      formData.append("file", submitFile);
      formData.append("email", participantEmail);
      formData.append("description", submitDesc);
      const res = await fetch(`${BASE}/api/contests/${id}/submit`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Submitted successfully!", description: "Your work has been submitted." });
      setStep("view");
      setSubmitFile(null);
      setSubmitDesc("");
      qc.invalidateQueries({ queryKey: ["public-contest", id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold mb-2">Contest Not Found</h2>
        <p className="text-muted-foreground mb-4">This contest doesn't exist or is no longer available.</p>
        <Link href="/careers"><Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Careers</Button></Link>
      </div>
    );
  }

  const isExpired = new Date(contest.deadline) < new Date();
  const remaining = timeLeft(contest.deadline);
  const hasWinner = !!contest.winnerSubmissionId;

  return (
    <>
      <SEO
        title={`${contest.title} — Advantix Digital`}
        description={contest.description}
        path={`/contests/${contest.id}`}
      />

      <div className="pt-28 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Link href="/careers">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Back to Careers
            </span>
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {contest.coverImageUrl && (
              <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden mb-8">
                <img src={contest.coverImageUrl} alt={contest.title} className="w-full h-full object-cover" />
              </div>
            )}

            <div className="flex flex-wrap items-start gap-4 mb-6">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">{contest.type}</span>
                  {hasWinner && (
                    <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold flex items-center gap-1">
                      <Star className="w-3 h-3" /> Winner Selected
                    </span>
                  )}
                  {!isExpired && !hasWinner && (
                    <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Open
                    </span>
                  )}
                  {isExpired && !hasWinner && (
                    <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold">
                      Closed
                    </span>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-3">{contest.title}</h1>
                <p className="text-lg text-muted-foreground">{contest.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Users className="w-5 h-5 mx-auto mb-1.5 text-blue-500" />
                <p className="text-2xl font-bold">{contest.participantCount}</p>
                <p className="text-xs text-muted-foreground">Participants</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <FileImage className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
                <p className="text-2xl font-bold">{contest.submissionCount}</p>
                <p className="text-xs text-muted-foreground">Submissions</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Calendar className="w-5 h-5 mx-auto mb-1.5 text-amber-500" />
                <p className="text-sm font-bold">{new Date(contest.deadline).toLocaleDateString()}</p>
                <p className="text-xs text-muted-foreground">{remaining || (isExpired ? "Expired" : "Deadline")}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <Sparkles className="w-5 h-5 mx-auto mb-1.5 text-purple-500" />
                <p className="text-sm font-bold truncate">{contest.prize || "—"}</p>
                <p className="text-xs text-muted-foreground">Prize</p>
              </div>
            </div>

            {hasWinner && contest.winner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-6 mb-8"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-6 h-6 text-amber-600" />
                  <h2 className="text-xl font-bold text-amber-800 dark:text-amber-300">Winner</h2>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <img src={contest.winner.fileUrl} alt="Winning submission"
                    className="w-full sm:w-60 h-60 rounded-xl object-cover border-2 border-amber-300 shadow-lg" />
                  <div className="text-center sm:text-left">
                    <p className="text-2xl font-bold">{contest.winner.participantName}</p>
                    {contest.winner.description && <p className="text-muted-foreground mt-2">{contest.winner.description}</p>}
                    {contest.prize && <p className="text-amber-700 dark:text-amber-300 font-semibold mt-3 flex items-center gap-1 justify-center sm:justify-start"><Sparkles className="w-4 h-4" /> Prize: {contest.prize}</p>}
                  </div>
                </div>
              </motion.div>
            )}

            {!isExpired && !hasWinner && step === "view" && (
              <div className="bg-card border-2 border-primary/20 rounded-2xl p-6 mb-8 text-center">
                <Trophy className="w-10 h-10 mx-auto mb-3 text-primary" />
                <h3 className="text-xl font-bold mb-2">Want to participate?</h3>
                <p className="text-muted-foreground mb-4">Sign up and submit your work before the deadline!</p>
                <Button onClick={() => setStep("signup")} size="lg" className="rounded-xl gap-2 px-8">
                  Join Competition <ArrowLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            )}

            {step === "signup" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-6 mb-8 max-w-md mx-auto">
                <h3 className="text-xl font-bold mb-4 text-center">Sign Up</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  By signing up, you agree to the contest rules and guidelines.
                </p>
                <form onSubmit={e => { e.preventDefault(); signupMutation.mutate(signupForm); }} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Full Name *</label>
                    <Input value={signupForm.name} onChange={e => setSignupForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Your full name" className="rounded-xl" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Email *</label>
                    <Input type="email" value={signupForm.email} onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com" className="rounded-xl" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Phone (optional)</label>
                    <Input value={signupForm.phone} onChange={e => setSignupForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+880..." className="rounded-xl" />
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep("view")} className="flex-1 rounded-xl">Cancel</Button>
                    <Button type="submit" disabled={signupMutation.isPending} className="flex-1 rounded-xl gap-2">
                      {signupMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Sign Up & Continue
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === "submit" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-6 mb-8 max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-4 justify-center">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">Signed up as {participantEmail}</span>
                </div>
                <h3 className="text-xl font-bold mb-4 text-center">Submit Your Work</h3>
                <form onSubmit={e => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Upload File *</label>
                    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => document.getElementById("contest-file-input")?.click()}>
                      {submitFile ? (
                        <div className="flex items-center gap-2 justify-center">
                          <FileImage className="w-5 h-5 text-primary" />
                          <span className="text-sm font-medium">{submitFile.name}</span>
                          <span className="text-xs text-muted-foreground">({(submitFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload your file</p>
                          <p className="text-xs text-muted-foreground mt-1">Max 20MB</p>
                        </>
                      )}
                    </div>
                    <input id="contest-file-input" type="file" className="hidden" accept="image/*,.pdf,.ai,.psd,.svg,.zip"
                      onChange={e => setSubmitFile(e.target.files?.[0] || null)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                    <textarea value={submitDesc} onChange={e => setSubmitDesc(e.target.value)}
                      placeholder="Tell us about your submission..."
                      className="w-full min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y" />
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setStep("view")} className="flex-1 rounded-xl">Cancel</Button>
                    <Button type="submit" disabled={submitMutation.isPending || !submitFile} className="flex-1 rounded-xl gap-2">
                      {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {(contest.instructions || contest.rules) && (
              <div className="grid sm:grid-cols-2 gap-6 mb-8">
                {contest.instructions && (
                  <div className="bg-card border border-border rounded-2xl p-6">
                    <h3 className="font-bold text-lg mb-3">Instructions</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contest.instructions}</p>
                  </div>
                )}
                {contest.rules && (
                  <div className="bg-card border border-border rounded-2xl p-6">
                    <h3 className="font-bold text-lg mb-3">Rules</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contest.rules}</p>
                  </div>
                )}
              </div>
            )}

            {contest.submissions.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <FileImage className="w-5 h-5 text-primary" /> Submissions ({contest.submissions.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {contest.submissions.map(s => {
                    const isWinner = String(s.id) === contest.winnerSubmissionId;
                    return (
                      <motion.div key={s.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className={`rounded-xl overflow-hidden border transition-all ${isWinner ? "border-amber-400 ring-2 ring-amber-300/50 shadow-lg" : "border-border hover:border-primary/30"}`}
                      >
                        <div className="relative">
                          <img src={s.fileUrl} alt={s.fileName || "Submission"} className="w-full h-40 object-cover" />
                          {isWinner && (
                            <div className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                              <Star className="w-2.5 h-2.5" /> Winner
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-semibold flex items-center gap-1"><User className="w-3 h-3" /> {s.participantName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(s.submittedAt).toLocaleDateString()}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}
