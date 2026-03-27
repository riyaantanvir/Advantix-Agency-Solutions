import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Copy, Trash2, ExternalLink, LogOut, User, Plus, CheckCircle, X, Eye, Link, ArrowLeft, Loader2 } from "lucide-react";
import { Link as RouterLink } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi, type ToolUser, type ShortUrl } from "@/lib/toolsApi";
import { format } from "date-fns";

const expo = [0.22, 1, 0.36, 1] as const;

/* ── Auth Modal ───────────────────────────────────────────── */
function AuthModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (u: ToolUser) => void }) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setName(""); setEmail(""); setPassword(""); setError(""); setLoading(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let result: { user: ToolUser };
      if (tab === "login") {
        result = await toolsApi.auth.login(email, password);
      } else {
        if (!name.trim()) { setError("Name is required"); setLoading(false); return; }
        result = await toolsApi.auth.register(name, email, password);
      }
      reset();
      onSuccess(result.user);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md bg-card border-border/60">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-xl font-display">
              {tab === "login" ? "Welcome back" : "Create your account"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-secondary/60 p-1 gap-1 mb-4">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); reset(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence>
            {tab === "signup" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pb-0">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder={tab === "signup" ? "Min. 6 characters" : "Your password"} value={password} onChange={e => setPassword(e.target.value)} required autoComplete={tab === "login" ? "current-password" : "new-password"} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
              <X className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Please wait…</> : tab === "login" ? "Sign In" : "Create Account"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {tab === "login" ? "No account?" : "Already have one?"}{" "}
            <button type="button" onClick={() => { setTab(tab === "login" ? "signup" : "login"); reset(); }} className="text-primary underline underline-offset-2 font-medium">
              {tab === "login" ? "Sign up free" : "Sign in"}
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Copy button ──────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-primary transition-colors" title="Copy">
      {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

/* ── Short URL row ────────────────────────────────────────── */
function UrlRow({ item, shortBase, onDelete }: { item: ShortUrl; shortBase: string; onDelete: (id: number) => void }) {
  const short = `${shortBase}/s/${item.shortCode}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: expo }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/30 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        {item.title && <p className="text-sm font-semibold text-foreground mb-1 truncate">{item.title}</p>}
        <div className="flex items-center gap-2 mb-1">
          <a href={short} target="_blank" rel="noopener noreferrer" className="text-primary font-mono text-sm font-semibold hover:underline truncate">
            {short}
          </a>
          <CopyButton text={short} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.originalUrl}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Eye className="w-3.5 h-3.5" />
          <span className="text-sm font-medium tabular-nums">{item.clicks}</span>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {format(new Date(item.createdAt), "MMM d, yyyy")}
        </span>
        <a href={item.originalUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Open original">
          <ExternalLink className="w-4 h-4" />
        </a>
        <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function UrlShortener() {
  const [user, setUser] = useState<ToolUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  const [inputUrl, setInputUrl] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const shortBase = typeof window !== "undefined" ? window.location.origin : "";

  /* Check existing session */
  useEffect(() => {
    toolsApi.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  /* Load URLs when user logs in */
  const loadUrls = useCallback(async () => {
    if (!user) return;
    setUrlsLoading(true);
    try {
      const list = await toolsApi.urls.list();
      setUrls(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } finally {
      setUrlsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadUrls(); }, [loadUrls]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await toolsApi.urls.create(inputUrl.trim(), inputTitle.trim() || undefined);
      setUrls(prev => [created, ...prev]);
      setInputUrl("");
      setInputTitle("");
    } catch (err: any) {
      setCreateError(err.message ?? "Failed to shorten URL");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    await toolsApi.urls.delete(id);
    setUrls(prev => prev.filter(u => u.id !== id));
  };

  const handleLogout = async () => {
    await toolsApi.auth.logout();
    setUser(null);
    setUrls([]);
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">

        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <RouterLink href="/tools">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Advantix Tools
            </button>
          </RouterLink>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: expo }}
          className="flex items-start justify-between mb-10"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-extrabold tracking-tight">URL Shortener</h1>
              <p className="text-muted-foreground mt-0.5">Shorten links and track clicks</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors" title="Sign out">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Button onClick={() => setAuthOpen(true)} variant="outline" size="sm" className="gap-2">
              <User className="w-4 h-4" /> Sign In
            </Button>
          )}
        </motion.div>

        {/* Create form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: expo, delay: 0.1 }}
        >
          <Card className="p-6 border-border/50 bg-card mb-6">
            {!user && (
              <div className="mb-5 flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Link className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Sign in to save your links</p>
                  <p className="text-xs text-muted-foreground">Your links will be stored and accessible anytime.</p>
                </div>
                <Button size="sm" onClick={() => setAuthOpen(true)} className="shrink-0">Sign In</Button>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="url" className="mb-1.5 block">Long URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/very/long/url/here"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  required
                  className="font-mono text-sm h-12"
                  disabled={!user}
                />
              </div>
              <div>
                <Label htmlFor="title" className="mb-1.5 block">Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="title"
                  placeholder="e.g. Instagram Bio Link"
                  value={inputTitle}
                  onChange={e => setInputTitle(e.target.value)}
                  className="h-11"
                  disabled={!user}
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <X className="w-4 h-4 shrink-0" /> {createError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
                disabled={creating || !user}
                onClick={!user ? () => setAuthOpen(true) : undefined}
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Shortening…</>
                ) : !user ? (
                  <><User className="w-4 h-4 mr-2" /> Sign in to Shorten</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Shorten URL</>
                )}
              </Button>
            </form>
          </Card>
        </motion.div>

        {/* URL list */}
        {user && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: expo, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">Your Links</h2>
              <span className="text-sm text-muted-foreground">{urls.length} link{urls.length !== 1 ? "s" : ""}</span>
            </div>

            {urlsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />
                ))}
              </div>
            ) : urls.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-border/50">
                <Link2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No links yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Shorten your first URL above</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {urls.map(u => (
                    <UrlRow key={u.id} item={u} shortBase={shortBase} onDelete={handleDelete} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Auth modal */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={u => { setUser(u); setAuthOpen(false); }} />
    </div>
  );
}
