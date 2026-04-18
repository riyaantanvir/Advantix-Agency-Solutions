import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Link2, BarChart2, Copy, CheckCircle, MessageSquare, ArrowRight,
  LogOut, Settings, Plus, Zap, Video, Sparkles, Bot, Heart,
  Headphones, Facebook, Clock, User, ChevronRight, Send, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toolsApi, type ShortUrl } from "@/lib/toolsApi";
import { useToolsUser } from "@/context/ToolsUserContext";
import { format } from "date-fns";

const ease = [0.22, 1, 0.36, 1] as const;

function fade(delay = 0) {
  return { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.48, ease, delay } };
}

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

interface AssistantStats {
  messagesSent: number;
  aiResponses: number;
  toolCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  monthCostUsd: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}
interface FavoriteItem { image_id: number; url: string; caption: string | null; page_slug: string; folder_name: string; }

const TOOLS = [
  { label: "Advantix AI", desc: "GPT, Claude, Gemini", icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/10", border: "hover:border-violet-500/40 hover:bg-violet-500/5", href: "/ai/", external: true },
  { label: "Facebook Auto-Reply", desc: "Auto-reply comments & DMs", icon: Facebook, color: "text-blue-400", bg: "bg-blue-500/10", border: "hover:border-blue-500/40 hover:bg-blue-500/5", href: "/tools/facebook", external: false },
  { label: "URL Shortener", desc: "Create & manage short links", icon: Link2, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "hover:border-indigo-500/40 hover:bg-indigo-500/5", href: "/tools/url-shortener", external: false },
  { label: "Screen Recorder", desc: "Record up to 10 minutes", icon: Video, color: "text-purple-400", bg: "bg-purple-500/10", border: "hover:border-purple-500/40 hover:bg-purple-500/5", href: "/tools/screen-recorder", external: false },
  { label: "PDF to Audio", desc: "Listen to any document", icon: Headphones, color: "text-rose-400", bg: "bg-rose-500/10", border: "hover:border-rose-500/40 hover:bg-rose-500/5", href: "/tools/pdf-audio", external: false },
  { label: "Account Settings", desc: "Profile & password", icon: Settings, color: "text-slate-400", bg: "bg-slate-500/10", border: "hover:border-slate-500/40 hover:bg-slate-500/5", href: "/tools/settings", external: false },
];

export default function ToolsDashboard() {
  const { user, loading, logout } = useToolsUser();
  const [, navigate] = useLocation();
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [recStats, setRecStats] = useState({ totalRecordings: 0, totalSeconds: 0 });
  const [loadingRec, setLoadingRec] = useState(true);
  const [assistantStats, setAssistantStats] = useState<AssistantStats | null>(null);
  const [loadingAssistant, setLoadingAssistant] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loadingFavs, setLoadingFavs] = useState(true);

  const shortBase = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/tools"); return; }
    toolsApi.urls.list().then(setUrls).catch(() => setUrls([])).finally(() => setLoadingUrls(false));
    toolsApi.recordings.stats().then(setRecStats).catch(() => setRecStats({ totalRecordings: 0, totalSeconds: 0 })).finally(() => setLoadingRec(false));
    fetch("/api/tools/assistant/stats", { credentials: "include" }).then(r => r.ok ? r.json() : null).then(d => { if (d) setAssistantStats(d); }).finally(() => setLoadingAssistant(false));
    fetch("/api/favorites/images", { credentials: "include" }).then(r => r.ok ? r.json() : []).then(setFavorites).catch(() => setFavorites([])).finally(() => setLoadingFavs(false));
  }, [user, loading]);

  const totalClicks = urls.reduce((s, u) => s + u.clicks, 0);
  const totalMinutes = Math.round(recStats.totalSeconds / 60);
  const hasAssistantActivity = assistantStats && (assistantStats.messagesSent > 0 || assistantStats.totalTokens > 0);

  const handleLogout = async () => { await logout(); navigate("/tools"); };
  const openChat = () => window.dispatchEvent(new Event("open-chat-widget"));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return null;

  const initials = user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const stats = [
    { label: "Short Links", value: urls.length, icon: Link2, color: "text-indigo-400", bg: "bg-indigo-500/10", loading: loadingUrls },
    { label: "Total Clicks", value: totalClicks, icon: BarChart2, color: "text-emerald-400", bg: "bg-emerald-500/10", loading: loadingUrls },
    { label: "Recordings", value: recStats.totalRecordings, icon: Video, color: "text-purple-400", bg: "bg-purple-500/10", loading: loadingRec },
    { label: "Mins Recorded", value: totalMinutes, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", loading: loadingRec },
  ];

  return (
    <div className="pt-24 pb-20 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 max-w-5xl space-y-6">

        {/* ── Profile banner ──────────────────────────────────────────── */}
        <motion.div {...fade(0)}>
          <div className="relative rounded-2xl overflow-hidden border border-border/50">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-violet-500/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between px-6 py-5 gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-violet-500/20 flex items-center justify-center text-primary font-extrabold text-lg border border-primary/20 shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-0.5">Welcome back</p>
                  <h1 className="text-xl font-bold leading-tight">{user.name}</h1>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href="/tools/settings">
                  <Button variant="outline" size="sm" className="gap-2 text-muted-foreground h-9">
                    <User className="w-3.5 h-3.5" /> Profile
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground h-9">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <motion.div {...fade(0.05)} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(({ label, value, icon: Icon, color, bg, loading: l }) => (
            <div key={label} className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums leading-none">{l ? "—" : value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Tools grid ──────────────────────────────────────────────── */}
        <motion.div {...fade(0.08)}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Your Tools
            </h2>
            <span className="text-xs text-muted-foreground">{TOOLS.length} available</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TOOLS.map(({ label, desc, icon: Icon, color, bg, border, href, external }) => {
              const inner = (
                <div className={`group rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3.5 cursor-pointer transition-all duration-200 ${border}`}>
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground/60 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              );
              if (label === "Chat with Support") return (
                <div key={label} onClick={openChat}>{inner}</div>
              );
              return external
                ? <a key={label} href={href}>{inner}</a>
                : <Link key={label} href={href}>{inner}</Link>;
            })}
          </div>
        </motion.div>

        {/* ── Bottom 2-col: Recent Links + AI Usage ───────────────────── */}
        <div className="grid sm:grid-cols-5 gap-4">

          {/* Recent Links — 3/5 */}
          <motion.div {...fade(0.1)} className="sm:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-400" /> Recent Links
              </h2>
              <Link href="/tools/url-shortener">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>

            {loadingUrls ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-[60px] rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
            ) : urls.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-transparent p-8 text-center">
                <Link2 className="w-8 h-8 text-muted-foreground/25 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No short links yet</p>
                <Link href="/tools/url-shortener">
                  <Button size="sm" className="gap-2 h-8 text-xs"><Plus className="w-3.5 h-3.5" /> Create first link</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {urls.slice(0, 5).map(url => {
                  const short = `${shortBase}/s/${url.shortCode}`;
                  return (
                    <div key={url.id} className="rounded-xl border border-border/40 bg-card px-4 py-3 flex items-center gap-3 hover:border-indigo-500/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        {url.title && <p className="text-xs font-semibold truncate text-foreground/80 mb-0.5">{url.title}</p>}
                        <div className="flex items-center gap-1">
                          <a href={short} target="_blank" rel="noopener noreferrer" className="text-indigo-400 font-mono text-xs hover:underline truncate">{short}</a>
                          <CopyButton text={short} />
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{url.originalUrl}</p>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                        <BarChart2 className="w-3 h-3" />
                        <span className="text-xs tabular-nums">{url.clicks}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 hidden sm:block shrink-0">
                        {format(new Date(url.createdAt), "MMM d")}
                      </span>
                    </div>
                  );
                })}
                {urls.length > 5 && (
                  <Link href="/tools/url-shortener">
                    <p className="text-xs text-center text-muted-foreground hover:text-primary transition-colors pt-1 cursor-pointer">
                      +{urls.length - 5} more links →
                    </p>
                  </Link>
                )}
              </div>
            )}
          </motion.div>

          {/* Advantix Assistant — 2/5 */}
          <motion.div {...fade(0.12)} className="sm:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" /> Assistant Uses
              </h2>
              <Link href="/tools/assistant">
                <button className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
                  Open <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-4 flex flex-col justify-between min-h-[160px] gap-3">
              {loadingAssistant ? (
                <div className="space-y-2 animate-pulse flex-1">
                  <div className="h-7 w-28 bg-muted/40 rounded" />
                  <div className="h-4 w-full bg-muted/30 rounded" />
                  <div className="h-4 w-3/4 bg-muted/30 rounded" />
                </div>
              ) : hasAssistantActivity ? (
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 p-2.5 text-center">
                      <p className="text-xl font-bold tabular-nums text-emerald-400">{assistantStats!.messagesSent.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                        <Send className="w-2.5 h-2.5" /> Messages Sent
                      </p>
                    </div>
                    <div className="rounded-lg bg-violet-500/8 border border-violet-500/15 p-2.5 text-center">
                      <p className="text-xl font-bold tabular-nums text-violet-400">{assistantStats!.toolCalls.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                        <Wrench className="w-2.5 h-2.5" /> Tool Calls
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                    <span>{assistantStats!.totalTokens.toLocaleString()} total tokens</span>
                    <span>${assistantStats!.totalCostUsd.toFixed(4)} lifetime</span>
                  </div>
                  {assistantStats!.lastMessageAt && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Last used {format(new Date(assistantStats!.lastMessageAt), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-3">
                  <Bot className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">No assistant usage yet</p>
                  <Link href="/tools/assistant">
                    <button className="text-xs text-emerald-400 hover:underline">Try the Assistant →</button>
                  </Link>
                </div>
              )}

              <button
                onClick={openChat}
                className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-lg py-2 hover:border-border transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat with Support
              </button>
            </div>
          </motion.div>
        </div>

        {/* ── Saved Photos ─────────────────────────────────────────────── */}
        {(loadingFavs || favorites.length > 0) && (
          <motion.div {...fade(0.14)}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-400 fill-current" /> Saved Photos
                {!loadingFavs && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-normal">{favorites.length}</span>
                )}
              </h2>
              <Link href="/favorites">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
              </Link>
            </div>

            {loadingFavs ? (
              <div className="flex gap-2">
                {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="w-20 h-20 rounded-xl bg-muted/40 animate-pulse shrink-0" />)}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {favorites.slice(0, 20).map(fav => (
                  <Link key={fav.image_id} href={`/pages/${fav.page_slug}`}>
                    <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-muted/30 cursor-pointer hover:ring-2 hover:ring-red-400/50 transition-all group">
                      <img
                        src={fav.url}
                        alt={fav.caption ?? fav.folder_name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}
