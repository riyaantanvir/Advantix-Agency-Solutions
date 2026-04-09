import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, X, Check, ArrowRight, Sparkles } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DISMISSED_KEY = "email_capture_dismissed";
const CAPTURED_KEY  = "email_captured";

export function EmailCaptureModal() {
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (
      localStorage.getItem(DISMISSED_KEY) ||
      localStorage.getItem(CAPTURED_KEY)
    ) return;

    // Check if newsletter is enabled before showing modal
    fetch(`${BASE}/api/settings/newsletter`)
      .then(r => r.json())
      .then((data: { enabled: boolean }) => {
        if (!data.enabled) return;
        const t = setTimeout(() => setOpen(true), 15000);
        return () => clearTimeout(t);
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const r = await fetch(`${BASE}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), source: "modal" }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      localStorage.setItem(CAPTURED_KEY, "1");
      setStatus("done");
      setTimeout(() => setOpen(false), 3000);
    } catch (err: unknown) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[96] w-full max-w-md px-4"
          >
            <div className="bg-card border border-border/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-6 pt-8 pb-6 text-center">
                <button
                  onClick={dismiss}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 border border-primary/20 mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-display font-bold text-foreground">
                  Get Expert Tips, Free
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Join 500+ business owners getting our weekly digest on growth, design, and digital marketing.
                </p>
              </div>

              <div className="px-6 pb-6">
                {status === "done" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-6"
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/15 border border-green-500/20 mb-3">
                      <Check className="w-6 h-6 text-green-400" />
                    </div>
                    <p className="font-semibold text-foreground">You're subscribed!</p>
                    <p className="text-sm text-muted-foreground mt-1">Watch your inbox for great content.</p>
                  </motion.div>
                ) : (
                  <form onSubmit={submit} className="space-y-3 mt-4">
                    <input
                      type="text"
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-secondary/50 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Your email address *"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setStatus("idle"); setErrMsg(""); }}
                      className="w-full px-4 py-2.5 bg-secondary/50 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                    />
                    {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-medium text-sm rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {status === "loading" ? (
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>Subscribe Free <ArrowRight size={14} /></>
                      )}
                    </button>
                    <p className="text-center text-xs text-muted-foreground">
                      No spam. Unsubscribe anytime.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
