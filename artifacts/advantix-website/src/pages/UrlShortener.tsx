import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Copy, Trash2, ExternalLink, LogOut, User, Plus, CheckCircle, X, Eye,
  Link, ArrowLeft, Loader2, BarChart2, Globe, TrendingUp, Smartphone, MousePointer,
  LayoutDashboard, Monitor, Wifi, Signal, Chrome, Shield, Clock, Wrench,
  Lock, Hash, Languages, MapPin, Building2, ChevronDown,
} from "lucide-react";
import { Link as RouterLink, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toolsApi, type ToolUser, type ShortUrl } from "@/lib/toolsApi";
import { useToolsUser } from "@/context/ToolsUserContext";
import { format } from "date-fns";

const expo = [0.22, 1, 0.36, 1] as const;

/* ── Copy Button ─────────────────────────────────────────── */
function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className={`rounded text-muted-foreground hover:text-primary transition-colors ${size === "md" ? "p-1.5" : "p-1"}`}
      title="Copy"
    >
      {copied
        ? <CheckCircle className={size === "md" ? "w-4 h-4 text-green-500" : "w-3.5 h-3.5 text-green-500"} />
        : <Copy className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} />}
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

/* ── Analytics Types ──────────────────────────────────────── */
type Analytics = {
  totalClicks: number;
  byDay: Array<{ day: string; clicks: string }>;
  byHour: Array<{ hour: number; clicks: string }>;
  byCountry: Array<{ country: string; country_code: string; clicks: string }>;
  byReferrer: Array<{ referrer: string; clicks: string }>;
  byDevice: Array<{ device: string; clicks: string }>;
  byBrowser: Array<{ browser: string; clicks: string }>;
  byOS: Array<{ os: string; clicks: string }>;
  byISP: Array<{ isp: string; clicks: string; is_mobile: boolean }>;
  byLanguage: Array<{ language: string; clicks: string }>;
  byRegion: Array<{ region: string; clicks: string }>;
  byOrg: Array<{ org: string; clicks: string }>;
  connectionSplit: { cellular: string; wifi_or_broadband: string };
  recentClicks: Array<{
    ip: string; country: string | null; city: string | null; region: string | null;
    browser: string | null; os: string | null; isp: string | null; org: string | null;
    timezone: string | null; language: string | null; is_bot: boolean | null;
    is_mobile: boolean | null; referrer: string | null; device: string | null;
    created_at: string;
  }>;
};

/* ── Shared bar row ───────────────────────────────────────── */
function BarRow({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground/80 w-36 shrink-0 truncate">{label}</span>
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

function browserIcon(browser: string): string {
  const b = browser.toLowerCase();
  if (b.includes("chrome")) return "🌐";
  if (b.includes("firefox")) return "🦊";
  if (b.includes("safari")) return "🧭";
  if (b.includes("edge")) return "🔷";
  if (b.includes("opera")) return "🔴";
  if (b.includes("samsung")) return "📱";
  return "🌍";
}

function osIcon(os: string): string {
  const o = os.toLowerCase();
  if (o.includes("windows")) return "🪟";
  if (o.includes("ios")) return "🍎";
  if (o.includes("android")) return "🤖";
  if (o.includes("macos")) return "🍏";
  if (o.includes("linux")) return "🐧";
  return "💻";
}

function langFlag(lang: string): string {
  const map: Record<string, string> = {
    Bengali: "🇧🇩", English: "🇺🇸", Arabic: "🇸🇦", Hindi: "🇮🇳",
    Chinese: "🇨🇳", Spanish: "🇪🇸", French: "🇫🇷", German: "🇩🇪",
    Japanese: "🇯🇵", Korean: "🇰🇷", Russian: "🇷🇺", Turkish: "🇹🇷",
    Urdu: "🇵🇰", Indonesian: "🇮🇩", Malay: "🇲🇾",
  };
  return map[lang] ?? "🗣️";
}

/* ── Hour Heatmap ────────────────────────────────────────── */
function HourHeatmap({ byHour }: { byHour: Array<{ hour: number; clicks: string }> }) {
  const hourMap: Record<number, number> = {};
  byHour.forEach(r => { hourMap[r.hour] = parseInt(r.clicks); });
  const maxClicks = Math.max(...Object.values(hourMap), 1);

  const timeLabel = (h: number) => {
    if (h === 0) return "12am";
    if (h < 12) return `${h}am`;
    if (h === 12) return "12pm";
    return `${h - 12}pm`;
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-400" /> Hour-of-Day Activity
      </h3>
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }, (_, h) => {
          const clicks = hourMap[h] ?? 0;
          const intensity = maxClicks > 0 ? clicks / maxClicks : 0;
          const bg = intensity === 0
            ? "bg-secondary/30"
            : intensity < 0.25 ? "bg-amber-900/40"
            : intensity < 0.5 ? "bg-amber-600/60"
            : intensity < 0.75 ? "bg-amber-400/80"
            : "bg-amber-400";
          return (
            <div key={h} className="flex flex-col items-center gap-1" title={`${timeLabel(h)}: ${clicks} click${clicks !== 1 ? "s" : ""}`}>
              <div className={`w-full aspect-square rounded-md ${bg} cursor-default transition-all hover:ring-1 hover:ring-amber-400/50`} />
              {h % 3 === 0 && <span className="text-[9px] text-muted-foreground">{timeLabel(h)}</span>}
            </div>
          );
        })}
      </div>
      {byHour.length === 0 && (
        <p className="text-center text-xs text-muted-foreground mt-2">No click data yet</p>
      )}
    </div>
  );
}

/* ── Analytics Modal ──────────────────────────────────────── */
function AnalyticsModal({ open, onClose, url, shortBase }: { open: boolean; onClose: () => void; url: ShortUrl | null; shortBase: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "deep" | "recent">("overview");

  useEffect(() => {
    if (!open || !url) return;
    setData(null); setError(""); setLoading(true); setTab("overview");
    toolsApi.urls.analytics(url.id)
      .then(setData)
      .catch(() => setError("Could not load analytics"))
      .finally(() => setLoading(false));
  }, [open, url?.id]);

  if (!url) return null;
  const short = `${shortBase}/s/${url.shortCode}`;

  const maxCountry  = data ? Math.max(...data.byCountry.map(r  => parseInt(r.clicks)), 1) : 1;
  const maxRef      = data ? Math.max(...data.byReferrer.map(r => parseInt(r.clicks)), 1) : 1;
  const maxDevice   = data ? Math.max(...data.byDevice.map(r   => parseInt(r.clicks)), 1) : 1;
  const maxBrowser  = data ? Math.max(...data.byBrowser.map(r  => parseInt(r.clicks)), 1) : 1;
  const maxOS       = data ? Math.max(...data.byOS.map(r        => parseInt(r.clicks)), 1) : 1;
  const maxISP      = data ? Math.max(...data.byISP.map(r      => parseInt(r.clicks)), 1) : 1;
  const maxDay      = data ? Math.max(...data.byDay.map(r      => parseInt(r.clicks)), 1) : 1;
  const maxLang     = data ? Math.max(...data.byLanguage.map(r  => parseInt(r.clicks)), 1) : 1;
  const maxRegion   = data ? Math.max(...data.byRegion.map(r   => parseInt(r.clicks)), 1) : 1;
  const maxOrg      = data ? Math.max(...data.byOrg.map(r      => parseInt(r.clicks)), 1) : 1;

  const cellular    = data ? parseInt(String(data.connectionSplit.cellular))          : 0;
  const wifi        = data ? parseInt(String(data.connectionSplit.wifi_or_broadband)) : 0;
  const connTotal   = cellular + wifi || 1;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            Link Analytics
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 font-mono truncate">{short}</p>
          {url.clickLimit && (
            <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
              <Hash className="w-3.5 h-3.5" /> Click limit: {url.clicks}/{url.clickLimit}
            </p>
          )}
          {url.passwordHash && (
            <p className="text-xs text-purple-400 flex items-center gap-1 mt-0.5">
              <Lock className="w-3.5 h-3.5" /> Password protected
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}
        {error && <p className="text-destructive text-sm py-4 text-center">{error}</p>}

        {data && !loading && (
          <div className="space-y-5 mt-1">

            {/* Tab toggle */}
            <div className="flex bg-secondary/40 p-1 rounded-xl gap-1">
              {(["overview", "deep", "recent"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {t === "overview" ? "📊 Overview" : t === "deep" ? "🔬 Deep Data" : "🕐 Recent"}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <>
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

                {/* Connection type */}
                {(cellular + wifi) > 0 && (
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Signal className="w-4 h-4 text-purple-400" /> Connection Type
                    </h3>
                    <div className="flex gap-3">
                      <div className="flex-1 text-center bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                        <Signal className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                        <p className="text-xl font-bold">{cellular}</p>
                        <p className="text-xs text-muted-foreground">Mobile / SIM</p>
                        <p className="text-xs font-semibold text-orange-400">{Math.round((cellular / connTotal) * 100)}%</p>
                      </div>
                      <div className="flex-1 text-center bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <Wifi className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <p className="text-xl font-bold">{wifi}</p>
                        <p className="text-xs text-muted-foreground">WiFi / Broadband</p>
                        <p className="text-xs font-semibold text-blue-400">{Math.round((wifi / connTotal) * 100)}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clicks over time */}
                {data.byDay.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Clicks Over Time (30 days)
                    </h3>
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

                {/* 2-column grid: Countries + Referrers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.byCountry.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" /> Countries
                      </h3>
                      <div className="space-y-2">
                        {data.byCountry.map(r => (
                          <BarRow key={r.country_code} label={`${countryFlag(r.country_code)} ${r.country || r.country_code}`} value={parseInt(r.clicks)} max={maxCountry} color="bg-blue-500" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.byReferrer.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" /> Traffic Sources
                      </h3>
                      <div className="space-y-2">
                        {data.byReferrer.map(r => (
                          <BarRow key={r.referrer} label={r.referrer} value={parseInt(r.clicks)} max={maxRef} color="bg-green-500" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2-column grid: Browser + OS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.byBrowser.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Chrome className="w-4 h-4 text-yellow-400" /> Browsers
                      </h3>
                      <div className="space-y-2">
                        {data.byBrowser.map(r => (
                          <BarRow key={r.browser} label={`${browserIcon(r.browser)} ${r.browser}`} value={parseInt(r.clicks)} max={maxBrowser} color="bg-yellow-500" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.byOS.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-violet-400" /> Operating Systems
                      </h3>
                      <div className="space-y-2">
                        {data.byOS.map(r => (
                          <BarRow key={r.os} label={`${osIcon(r.os)} ${r.os}`} value={parseInt(r.clicks)} max={maxOS} color="bg-violet-500" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2-column grid: Devices + ISP/Carrier */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.byDevice.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-orange-400" /> Devices
                      </h3>
                      <div className="space-y-2">
                        {data.byDevice.map(r => (
                          <BarRow key={r.device} label={r.device} value={parseInt(r.clicks)} max={maxDevice} color="bg-orange-400" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.byISP.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Signal className="w-4 h-4 text-pink-400" /> ISP / Carrier
                      </h3>
                      <div className="space-y-2">
                        {data.byISP.map(r => (
                          <BarRow
                            key={r.isp}
                            label={`${r.is_mobile ? "📡" : "🔗"} ${r.isp}`}
                            value={parseInt(r.clicks)}
                            max={maxISP}
                            color="bg-pink-500"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {data.totalClicks === 0 && (
                  <div className="text-center py-8">
                    <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No clicks yet — share your link to see analytics here!</p>
                  </div>
                )}
              </>
            )}

            {tab === "deep" && (
              <div className="space-y-6">
                {/* Hour-of-day heatmap */}
                <HourHeatmap byHour={data.byHour} />

                {/* Language + Region */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.byLanguage.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Languages className="w-4 h-4 text-cyan-400" /> Browser Language
                      </h3>
                      <div className="space-y-2">
                        {data.byLanguage.map(r => (
                          <BarRow key={r.language} label={`${langFlag(r.language)} ${r.language}`} value={parseInt(r.clicks)} max={maxLang} color="bg-cyan-500" />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.byRegion.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-rose-400" /> Region / State
                      </h3>
                      <div className="space-y-2">
                        {data.byRegion.map(r => (
                          <BarRow key={r.region} label={`📍 ${r.region}`} value={parseInt(r.clicks)} max={maxRegion} color="bg-rose-500" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Organization / Company */}
                {data.byOrg.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-teal-400" /> Organization / Company
                    </h3>
                    <div className="space-y-2">
                      {data.byOrg.map(r => (
                        <BarRow key={r.org} label={`🏢 ${r.org}`} value={parseInt(r.clicks)} max={maxOrg} color="bg-teal-500" />
                      ))}
                    </div>
                  </div>
                )}

                {data.byLanguage.length === 0 && data.byRegion.length === 0 && data.byOrg.length === 0 && data.byHour.length === 0 && (
                  <div className="text-center py-8">
                    <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Deep data will appear after new clicks are recorded.</p>
                  </div>
                )}
              </div>
            )}

            {tab === "recent" && (
              <div>
                {data.recentClicks.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No clicks recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.recentClicks.map((click, i) => (
                      <div key={i} className="bg-secondary/30 rounded-xl p-3 text-sm border border-border/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {click.country && (
                                <span className="text-foreground/80 font-medium">
                                  {click.city ? `${click.city}, ` : ""}{click.country}
                                  {click.region ? ` · ${click.region}` : ""}
                                </span>
                              )}
                              {click.isp && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${click.is_mobile ? "bg-orange-500/15 text-orange-400" : "bg-blue-500/15 text-blue-400"}`}>
                                  {click.is_mobile ? "📡 SIM" : "📶 WiFi"} · {click.isp}
                                </span>
                              )}
                              {click.is_bot && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">🤖 Bot</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {click.browser && <span>{browserIcon(click.browser)} {click.browser}</span>}
                              {click.os && <span>{osIcon(click.os)} {click.os}</span>}
                              {click.device && <span>📱 {click.device}</span>}
                              {click.language && <span>🗣️ {click.language}</span>}
                              {click.timezone && <span>🕐 {click.timezone}</span>}
                              {click.referrer && click.referrer !== "Direct" && <span>↩ {click.referrer}</span>}
                            </div>
                            {click.org && (
                              <div className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {click.org}
                              </div>
                            )}
                            {click.ip && (
                              <div className="text-xs font-mono text-muted-foreground/60 flex items-center gap-1">
                                <Shield className="w-3 h-3" /> {click.ip}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                            {format(new Date(click.created_at), "MMM d, HH:mm")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── UTM Builder Modal ────────────────────────────────────── */
function UtmBuilderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [baseUrl, setBaseUrl]       = useState("");
  const [source, setSource]         = useState("");
  const [medium, setMedium]         = useState("");
  const [campaign, setCampaign]     = useState("");
  const [term, setTerm]             = useState("");
  const [content, setContent]       = useState("");
  const [copied, setCopied]         = useState(false);

  const builtUrl = (() => {
    if (!baseUrl.trim()) return "";
    try {
      let base = baseUrl.trim();
      if (!base.startsWith("http://") && !base.startsWith("https://")) base = "https://" + base;
      const u = new URL(base);
      if (source)   u.searchParams.set("utm_source",   source.trim());
      if (medium)   u.searchParams.set("utm_medium",   medium.trim());
      if (campaign) u.searchParams.set("utm_campaign", campaign.trim());
      if (term)     u.searchParams.set("utm_term",     term.trim());
      if (content)  u.searchParams.set("utm_content",  content.trim());
      return u.toString();
    } catch { return ""; }
  })();

  const handleCopy = () => {
    if (!builtUrl) return;
    navigator.clipboard.writeText(builtUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const presets: Array<{ label: string; source: string; medium: string }> = [
    { label: "Google Ads",    source: "google",    medium: "cpc" },
    { label: "Facebook Ads",  source: "facebook",  medium: "paid_social" },
    { label: "Instagram",     source: "instagram", medium: "social" },
    { label: "WhatsApp",      source: "whatsapp",  medium: "messaging" },
    { label: "Email",         source: "email",     medium: "newsletter" },
    { label: "Telegram",      source: "telegram",  medium: "messaging" },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            UTM Link Builder
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Build trackable links for Google Analytics &amp; campaign tracking</p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.label} onClick={() => { setSource(p.source); setMedium(p.medium); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-secondary/40 hover:border-primary/40 hover:bg-primary/5 transition-colors font-medium">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-sm">Website URL <span className="text-destructive">*</span></Label>
              <Input placeholder="https://advantix.agency/services" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-sm">Source <span className="text-xs text-muted-foreground">(utm_source)</span></Label>
                <Input placeholder="e.g. google, facebook" value={source} onChange={e => setSource(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">Medium <span className="text-xs text-muted-foreground">(utm_medium)</span></Label>
                <Input placeholder="e.g. cpc, email, social" value={medium} onChange={e => setMedium(e.target.value)} className="text-sm" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">Campaign Name <span className="text-xs text-muted-foreground">(utm_campaign)</span></Label>
              <Input placeholder="e.g. summer-sale-2026" value={campaign} onChange={e => setCampaign(e.target.value)} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-sm">Term <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="e.g. web+design" value={term} onChange={e => setTerm(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">Content <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="e.g. banner-top" value={content} onChange={e => setContent(e.target.value)} className="text-sm" />
              </div>
            </div>
          </div>

          {builtUrl && (
            <div className="bg-secondary/40 rounded-xl p-3 border border-border/40">
              <p className="text-xs text-muted-foreground font-medium mb-2">Generated URL</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-xs font-mono break-all text-foreground/80">{builtUrl}</p>
                <button onClick={handleCopy}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors flex items-center gap-1.5">
                  {copied ? <><CheckCircle className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
            </div>
          )}
          {!builtUrl && baseUrl && (
            <p className="text-xs text-destructive text-center">Invalid URL — please include a valid web address.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── URL Row ──────────────────────────────────────────────── */
function UrlRow({ item, shortBase, onDelete, onAnalytics }: { item: ShortUrl; shortBase: string; onDelete: (id: number) => void; onAnalytics: (u: ShortUrl) => void }) {
  const short = `${shortBase}/s/${item.shortCode}`;
  const isExpired = item.clickLimit !== null && item.clicks >= (item.clickLimit ?? Infinity);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: expo }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/30 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {item.title && <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>}
          {item.passwordHash && <Lock className="w-3 h-3 text-purple-400 shrink-0" title="Password protected" />}
          {item.clickLimit && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isExpired ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
              {isExpired ? "Expired" : `${item.clicks}/${item.clickLimit}`}
            </span>
          )}
        </div>
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
  const { user, setUser, loading, logout: ctxLogout } = useToolsUser();
  const [, navigate] = useLocation();
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  const [inputUrl, setInputUrl] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [showCustomSlug, setShowCustomSlug] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [clickLimit, setClickLimit] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [analyticsUrl, setAnalyticsUrl] = useState<ShortUrl | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [utmOpen, setUtmOpen] = useState(false);

  const shortBase = typeof window !== "undefined" ? window.location.origin : "";

  const loadUrls = useCallback(async () => {
    if (!user) return;
    setUrlsLoading(true);
    try { setUrls(await toolsApi.urls.list()); }
    finally { setUrlsLoading(false); }
  }, [user]);

  useEffect(() => { loadUrls(); }, [loadUrls]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setCreating(true); setCreateError("");
    try {
      const limit = clickLimit.trim() ? parseInt(clickLimit.trim()) : undefined;
      const created = await toolsApi.urls.create(
        inputUrl.trim(),
        inputTitle.trim() || undefined,
        customSlug.trim() || undefined,
        linkPassword.trim() || undefined,
        limit && limit > 0 ? limit : undefined,
      );
      setUrls(prev => [created, ...prev]);
      setInputUrl(""); setInputTitle(""); setCustomSlug("");
      setShowCustomSlug(false); setShowAdvanced(false);
      setLinkPassword(""); setClickLimit("");
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

  const handleLogout = async () => { await ctxLogout(); setUrls([]); };
  const handleAnalytics = (url: ShortUrl) => { setAnalyticsUrl(url); setAnalyticsOpen(true); };

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
              <p className="text-muted-foreground mt-0.5">Shorten links, custom aliases &amp; track clicks</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUtmOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                title="UTM Builder"
              >
                <Wrench className="w-4 h-4" />
                <span className="hidden sm:inline">UTM Builder</span>
              </button>
              <RouterLink href="/tools/dashboard">
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary/80 transition-colors text-left">
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
                </button>
              </RouterLink>
              <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors" title="Sign out">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Button onClick={() => navigate("/login")} variant="outline" size="sm" className="gap-2">
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
                <Button size="sm" onClick={() => navigate("/login")} className="shrink-0">Sign In</Button>
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

              {user && (
                <>
                  {/* Custom alias */}
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
                        <p className="text-xs text-muted-foreground">Letters, numbers, hyphens only.</p>
                      </div>
                    )}
                  </div>

                  {/* Advanced options */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(v => !v)}
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                      Advanced options (password, click limit)
                    </button>

                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-4">
                            {/* Password protection */}
                            <div>
                              <Label className="mb-1.5 block text-sm flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-purple-400" />
                                Password Protection <span className="text-muted-foreground font-normal">(optional)</span>
                              </Label>
                              <Input
                                type="password"
                                placeholder="Set a password — visitors must enter it"
                                value={linkPassword}
                                onChange={e => setLinkPassword(e.target.value)}
                                className="h-10 text-sm"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Visitors will see a password prompt before being redirected.</p>
                            </div>

                            {/* Click limit */}
                            <div>
                              <Label className="mb-1.5 block text-sm flex items-center gap-1.5">
                                <Hash className="w-3.5 h-3.5 text-amber-400" />
                                Click Limit <span className="text-muted-foreground font-normal">(optional)</span>
                              </Label>
                              <Input
                                type="number"
                                placeholder="e.g. 100 — link expires after this many clicks"
                                value={clickLimit}
                                onChange={e => setClickLimit(e.target.value)}
                                className="h-10 text-sm"
                                min={1}
                              />
                              <p className="text-xs text-muted-foreground mt-1">After reaching this limit, the link will show an "expired" page.</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
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
                onClick={!user ? () => navigate("/login") : undefined}
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

        {/* URL List */}
        {user && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
            {urlsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : urls.length === 0 ? (
              <div className="text-center py-16">
                <Link2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground">No links yet — create your first one above!</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{urls.length} link{urls.length !== 1 ? "s" : ""}</p>
                </div>
                <AnimatePresence>
                  {urls.map(item => (
                    <UrlRow key={item.id} item={item} shortBase={shortBase} onDelete={handleDelete} onAnalytics={handleAnalytics} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <AnalyticsModal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} url={analyticsUrl} shortBase={shortBase} />
      <UtmBuilderModal open={utmOpen} onClose={() => setUtmOpen(false)} />
    </div>
  );
}
