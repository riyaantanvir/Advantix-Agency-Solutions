import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Link2, BarChart2, Copy, CheckCircle, MessageSquare, ArrowRight, LogOut, Settings, Plus, Zap, Video, Clock, Sparkles, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toolsApi, type ShortUrl } from "@/lib/toolsApi";
import { useToolsUser } from "@/context/ToolsUserContext";
import { format } from "date-fns";

const expo = [0.22, 1, 0.36, 1] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors" title="Copy">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

interface AiUsage {
  tokensUsed: number;
  costUsd: number;
  monthlyLimit: number | null;
}

export default function ToolsDashboard() {
  const { user, logout } = useToolsUser();
  const [, navigate] = useLocation();
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [recStats, setRecStats] = useState({ totalRecordings: 0, totalSeconds: 0 });
  const [loadingRec, setLoadingRec] = useState(true);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loadingAi, setLoadingAi] = useState(true);

  const shortBase = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!user) { navigate("/tools"); return; }
    toolsApi.urls.list()
      .then(setUrls)
      .catch(() => setUrls([]))
      .finally(() => setLoadingUrls(false));
    toolsApi.recordings.stats()
      .then(setRecStats)
      .catch(() => setRecStats({ totalRecordings: 0, totalSeconds: 0 }))
      .finally(() => setLoadingRec(false));
    fetch("/api/ai/usage/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAiUsage(data); })
      .finally(() => setLoadingAi(false));
  }, [user]);

  const totalClicks = urls.reduce((s, u) => s + u.clicks, 0);
  const totalMinutes = Math.round(recStats.totalSeconds / 60);

  const openChat = () => {
    window.dispatchEvent(new Event("open-chat-widget"));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/tools");
  };

  if (!user) return null;

  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo }}
          className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg font-display">
              {initials}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Welcome back</p>
              <h1 className="text-2xl font-display font-extrabold">{user.name}</h1>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </motion.div>

        {/* Stat cards */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          {[
            { label: "Total Links", value: urls.length, icon: Link2, color: "text-primary", bg: "bg-primary/10", loading: loadingUrls },
            { label: "Total Clicks", value: totalClicks, icon: BarChart2, color: "text-green-400", bg: "bg-green-500/10", loading: loadingUrls },
            { label: "Tools Available", value: 3, icon: Zap, color: "text-orange-400", bg: "bg-orange-500/10", loading: false },
            { label: "Recordings", value: recStats.totalRecordings, icon: Video, color: "text-purple-400", bg: "bg-purple-500/10", loading: loadingRec },
            { label: "Mins Recorded", value: totalMinutes, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", loading: loadingRec },
          ].map(({ label, value, icon: Icon, color, bg, loading }) => (
            <Card key={label} className="p-5 border-border/50 bg-card">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold tabular-nums">{loading ? "—" : value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </Card>
          ))}
        </motion.div>

        {/* AI Usage card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.08 }}
          className="mb-8">
          <Card className="p-5 border-border/50 bg-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Advantix AI Usage</p>
                  <p className="text-xs text-muted-foreground">This month's token consumption</p>
                </div>
              </div>
              <a href="/ai/" className="text-xs text-violet-400 hover:underline flex items-center gap-1">
                Open AI <ArrowRight className="w-3 h-3" />
              </a>
            </div>

            {loadingAi ? (
              <div className="h-8 rounded bg-secondary/40 animate-pulse" />
            ) : aiUsage ? (
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold tabular-nums">{aiUsage.tokensUsed.toLocaleString()}</span>
                  <div className="text-right">
                    {aiUsage.monthlyLimit ? (
                      <span className="text-xs text-muted-foreground">
                        of {aiUsage.monthlyLimit.toLocaleString()} tokens limit
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">tokens used · no limit set</span>
                    )}
                    <p className="text-xs text-muted-foreground">${aiUsage.costUsd.toFixed(4)} this month</p>
                  </div>
                </div>
                {aiUsage.monthlyLimit && aiUsage.monthlyLimit > 0 && (() => {
                  const pct = Math.min(100, Math.round((aiUsage.tokensUsed / aiUsage.monthlyLimit) * 100));
                  const isWarn = pct >= 80;
                  const isCrit = pct >= 95;
                  return (
                    <div>
                      <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isCrit ? "bg-red-500" : isWarn ? "bg-amber-500" : "bg-violet-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={`text-xs font-medium ${isCrit ? "text-red-400" : isWarn ? "text-amber-400" : "text-violet-400"}`}>
                          {pct}% used
                        </span>
                        {isWarn && (
                          <span className={`text-xs ${isCrit ? "text-red-400" : "text-amber-400"}`}>
                            {isCrit ? "⚠️ Limit nearly reached" : "⚠️ Approaching limit"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Brain className="w-4 h-4" />
                <span>No AI usage yet. <a href="/ai/" className="text-violet-400 hover:underline">Start chatting →</a></span>
              </div>
            )}
          </Card>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6">
          {/* Recent links */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.1 }}
            className="sm:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-lg">Recent Links</h2>
              <Link href="/tools/url-shortener">
                <button className="text-sm text-primary hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>

            {loadingUrls ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />)}
              </div>
            ) : urls.length === 0 ? (
              <Card className="border-dashed border-border/60 bg-transparent p-8 text-center">
                <Link2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No links yet</p>
                <Link href="/tools/url-shortener">
                  <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Create your first link</Button>
                </Link>
              </Card>
            ) : (
              <div className="space-y-2">
                {urls.slice(0, 5).map(url => {
                  const short = `${shortBase}/s/${url.shortCode}`;
                  return (
                    <Card key={url.id} className="p-4 border-border/40 bg-card hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {url.title && <p className="text-sm font-semibold truncate mb-0.5">{url.title}</p>}
                          <div className="flex items-center gap-1.5">
                            <a href={short} target="_blank" rel="noopener noreferrer"
                              className="text-primary font-mono text-xs hover:underline truncate">{short}</a>
                            <CopyButton text={short} />
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{url.originalUrl}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-sm">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <BarChart2 className="w-3.5 h-3.5" /> {url.clicks}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{format(new Date(url.createdAt), "MMM d")}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {urls.length > 5 && (
                  <Link href="/tools/url-shortener">
                    <p className="text-sm text-center text-muted-foreground hover:text-primary transition-colors pt-1 cursor-pointer">
                      + {urls.length - 5} more links
                    </p>
                  </Link>
                )}
              </div>
            )}
          </motion.div>

          {/* Sidebar: quick actions */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: expo, delay: 0.15 }}
            className="space-y-4">
            <h2 className="font-display font-bold text-lg">Quick Actions</h2>

            <a href="/ai/">
              <Card className="p-4 border-border/40 bg-card hover:border-violet-500/30 hover:bg-violet-500/5 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Advantix AI</p>
                    <p className="text-xs text-muted-foreground">Chat with GPT, Claude, Gemini</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-400 transition-colors" />
                </div>
              </Card>
            </a>

            <Link href="/tools/url-shortener">
              <Card className="p-4 border-border/40 bg-card hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">URL Shortener</p>
                    <p className="text-xs text-muted-foreground">Create & manage links</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Card>
            </Link>

            <Link href="/tools/screen-recorder">
              <Card className="p-4 border-border/40 bg-card hover:border-purple-500/30 hover:bg-purple-500/5 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Screen Recorder</p>
                    <p className="text-xs text-muted-foreground">Record up to 10 minutes</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 transition-colors" />
                </div>
              </Card>
            </Link>

            <Card className="p-4 border-border/40 bg-card hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer group" onClick={openChat}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Chat with Support</p>
                  <p className="text-xs text-muted-foreground">Get help from our team</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-400 transition-colors" />
              </div>
            </Card>

            <Link href="/tools/settings">
              <Card className="p-4 border-border/50 bg-card/60 hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Account Settings</p>
                    <p className="text-xs text-muted-foreground">Update profile & change password</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Card>
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
