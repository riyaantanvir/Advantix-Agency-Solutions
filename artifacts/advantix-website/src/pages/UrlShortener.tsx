import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Copy, Trash2, ExternalLink, LogOut, User, Plus, CheckCircle, X, Eye, Link, ArrowLeft, Loader2, BarChart2, Globe, TrendingUp, Smartphone, MousePointer } from "lucide-react";
import { Link as RouterLink } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi, type ToolUser, type ShortUrl } from "@/lib/toolsApi";
import { format } from "date-fns";

const expo = [0.22, 1, 0.36, 1] as const;

/* ── Copy Button ─────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

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
    e.preventDefault(); setError(""); setLoading(true);
    try {
      if (tab === "signup") {
        const { user } = await toolsApi.auth.register(name.trim(), email.trim(), password);
        onSuccess(user);
      } else {
        const { user } = await toolsApi.auth.login(email.trim(), password);
        onSuccess(user);
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {tab === "login" ? "Sign in to Advantix Tools" : "Create your account"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-4 bg-secondary/40 p-1 rounded-xl">
          {(["login", "signup"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); reset(); }}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === "signup" && (
            <div><Label className="mb-1 block">Name</Label>
              <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div><Label className="mb-1 block">Email</Label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div><Label className="mb-1 block">Password</Label>
            <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <p className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Please wait…</> : tab === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Analytics Modal ──────────────────────────────────────── */
type Analytics = {
  totalClicks: number;
  byDay: Array<{ day: string; clicks: string }>;
  byCountry: Array<{ country: string; country_code: string; clicks: string }>;
  byReferrer: Array<{ referrer: string; clicks: string }>;
  byDevice: Array<{ device: string; clicks: string }>;
};

function BarRow({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground/80 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function AnalyticsModal({ open, onClose, url, shortBase }: { open: boolean; onClose: () => void; url: ShortUrl | null; shortBase: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !url) return;
    setData(null); setError(""); setLoading(true);
    toolsApi.urls.analytics(url.id)
      .then(setData)
      .catch(() => setError("Could not load analytics"))
      .finally(() => setLoading(false));
  }, [open, url?.id]);

  if (!url) return null;
  const short = `${shortBase}/s/${url.shortCode}`;
  const maxCountry = data ? Math.max(...data.byCountry.map(r => parseInt(r.clicks))) : 0;
  const maxRef = data ? Math.max(...data.byReferrer.map(r => parseInt(r.clicks))) : 0;
  const maxDevice = data ? Math.max(...data.byDevice.map(r => parseInt(r.clicks))) : 0;
  const maxDay = data ? Math.max(...data.byDay.map(r => parseInt(r.clicks)), 1) : 1;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            Link Analytics
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 font-mono truncate">{short}</p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}
        {error && <p className="text-destructive text-sm py-4 text-center">{error}</p>}

        {data && !loading && (
          <div className="space-y-6 mt-2">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Clicks", value: data.totalClicks, icon: MousePointer, color: "text-primary" },
                { label: "Countries", value: data.byCountry.length, icon: Globe, color: "text-blue-400" },
                { label: "Sources", value: data.byReferrer.length, icon: TrendingUp, color: "text-green-400" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-secondary/40 rounded-xl p-3 text-center">
                  <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Clicks by day */}
            {data.byDay.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Clicks Over Time</h3>
                <div className="flex items-end gap-1 h-20 bg-secondary/20 rounded-xl px-3 py-2">
                  {data.byDay.map(({ day, clicks }) => {
                    const pct = Math.max(4, Math.round((parseInt(clicks) / maxDay) * 100));
                    return (
                      <div key={day} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${day}: ${clicks} clicks`}>
                        <div className="w-full bg-primary/70 hover:bg-primary rounded-sm transition-all cursor-default" style={{ height: `${pct}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 px-1">
                  <span className="text-xs text-muted-foreground">{data.byDay[0]?.day}</span>
                  <span className="text-xs text-muted-foreground">{data.byDay[data.byDay.length - 1]?.day}</span>
                </div>
              </div>
            )}

            {/* Countries */}
            {data.byCountry.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Globe className="w-4 h-4 text-blue-400" /> Top Countries</h3>
                <div className="space-y-2">
                  {data.byCountry.map(r => (
                    <BarRow key={r.country_code} label={`${countryFlag(r.country_code)} ${r.country || r.country_code}`} value={parseInt(r.clicks)} max={maxCountry} color="bg-blue-500" />
                  ))}
                </div>
              </div>
            )}

            {/* Referrers */}
            {data.byReferrer.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /> Traffic Sources</h3>
                <div className="space-y-2">
                  {data.byReferrer.map(r => (
                    <BarRow key={r.referrer} label={r.referrer} value={parseInt(r.clicks)} max={maxRef} color="bg-green-500" />
                  ))}
                </div>
              </div>
            )}

            {/* Devices */}
            {data.byDevice.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Smartphone className="w-4 h-4 text-orange-400" /> Devices</h3>
                <div className="space-y-2">
                  {data.byDevice.map(r => (
                    <BarRow key={r.device} label={r.device} value={parseInt(r.clicks)} max={maxDevice} color="bg-orange-400" />
                  ))}
                </div>
              </div>
            )}

            {data.totalClicks === 0 && (
              <div className="text-center py-8">
                <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No clicks yet — share your link to see analytics here!</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── URL Row ──────────────────────────────────────────────── */
function UrlRow({ item, shortBase, onDelete, onAnalytics }: { item: ShortUrl; shortBase: string; onDelete: (id: number) => void; onAnalytics: (u: ShortUrl) => void }) {
  const short = `${shortBase}/s/${item.shortCode}`;
  return (
    <motion.div
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

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onAnalytics(item)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/60 hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors text-sm font-medium"
          title="View analytics"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span className="tabular-nums">{item.clicks}</span>
        </button>
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
  const [customSlug, setCustomSlug] = useState("");
  const [showCustomSlug, setShowCustomSlug] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [analyticsUrl, setAnalyticsUrl] = useState<ShortUrl | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const shortBase = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    toolsApi.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loadUrls = useCallback(async () => {
    if (!user) return;
    setUrlsLoading(true);
    try {
      setUrls(await toolsApi.urls.list());
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
      const created = await toolsApi.urls.create(inputUrl.trim(), inputTitle.trim() || undefined, customSlug.trim() || undefined);
      setUrls(prev => [created, ...prev]);
      setInputUrl("");
      setInputTitle("");
      setCustomSlug("");
      setShowCustomSlug(false);
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

  const handleAnalytics = (url: ShortUrl) => {
    setAnalyticsUrl(url);
    setAnalyticsOpen(true);
  };

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="mb-8">
          <RouterLink href="/tools">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Advantix Tools
            </button>
          </RouterLink>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: expo }} className="flex items-start justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Link2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-extrabold tracking-tight">URL Shortener</h1>
              <p className="text-muted-foreground mt-0.5">Shorten links, custom aliases & track clicks</p>
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: expo, delay: 0.1 }}>
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

              {/* Custom Alias Toggle */}
              {user && (
                <div>
                  {!showCustomSlug ? (
                    <button type="button" onClick={() => setShowCustomSlug(true)} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> Add custom alias
                    </button>
                  ) : (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-primary" /> Custom Alias
                        </Label>
                        <button type="button" onClick={() => { setShowCustomSlug(false); setCustomSlug(""); }} className="text-muted-foreground hover:text-foreground text-xs">Remove</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{shortBase}/s/</span>
                        <Input
                          placeholder="your-custom-alias"
                          value={customSlug}
                          onChange={e => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                          className="h-9 font-mono text-sm"
                          maxLength={50}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Letters, numbers, hyphens only. Leave blank for auto-generated.</p>
                    </div>
                  )}
                </div>
              )}

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
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.2 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">Your Links</h2>
              <span className="text-sm text-muted-foreground">{urls.length} link{urls.length !== 1 ? "s" : ""}</span>
            </div>

            {urlsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />)}
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
                    <UrlRow key={u.id} item={u} shortBase={shortBase} onDelete={handleDelete} onAnalytics={handleAnalytics} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={u => { setUser(u); setAuthOpen(false); }} />
      <AnalyticsModal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} url={analyticsUrl} shortBase={shortBase} />
    </div>
  );
}
