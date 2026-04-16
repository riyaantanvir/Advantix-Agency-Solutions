import { useState, useMemo } from "react";
import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Eye, Mail, TrendingUp, MessageSquare, Activity, Calendar, ChevronDown,
  Link2, Video, Headphones, Sparkles, Globe, Monitor, Smartphone, BarChart2,
  Zap, Bot, MousePointer, ShieldCheck, UserCheck, BugPlay,
  AlertCircle, CheckCircle2, Inbox, Send, Plug, Clock, ArrowRight,
  FileText, UserPlus, Wrench, MessagesSquare, BugOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  isWithinInterval, startOfDay, endOfDay,
  subDays, startOfMonth, format, formatDistanceToNow,
} from "date-fns";

/* ── Date preset helpers ─────────────────────────────────────── */
type Preset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "allTime" | "custom";
const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today",       value: "today" },
  { label: "Yesterday",   value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days",value: "last30" },
  { label: "This Month",  value: "thisMonth" },
  { label: "All Time",    value: "allTime" },
  { label: "Custom",      value: "custom" },
];

function getRangeForPreset(p: Preset, from: string, to: string) {
  const now = new Date();
  if (p === "today")     return { from: startOfDay(now), to: endOfDay(now) };
  if (p === "yesterday") { const y = subDays(now,1); return { from: startOfDay(y), to: endOfDay(y) }; }
  if (p === "last7")     return { from: startOfDay(subDays(now,6)), to: endOfDay(now) };
  if (p === "last30")    return { from: startOfDay(subDays(now,29)), to: endOfDay(now) };
  if (p === "thisMonth") return { from: startOfMonth(now), to: endOfDay(now) };
  if (p === "allTime")   return null;
  if (!from || !to)      return null;
  const f = new Date(from); const t = new Date(to);
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
  return { from: startOfDay(f), to: endOfDay(t) };
}
function formatRange(p: Preset, r: { from: Date; to: Date } | null) {
  if (!r) return "All Time";
  if (p === "today")      return "Today";
  if (p === "yesterday")  return "Yesterday";
  if (p === "last7")      return "Last 7 Days";
  if (p === "last30")     return "Last 30 Days";
  if (p === "thisMonth")  return "This Month";
  return `${format(r.from,"MMM d")} – ${format(r.to,"MMM d, yyyy")}`;
}
function inRange(d: string, r: { from: Date; to: Date } | null) {
  if (!r) return true;
  return isWithinInterval(new Date(d), { start: r.from, end: r.to });
}

/* ── Overview stats type ─────────────────────────────────────── */
type OverviewStats = {
  totalUsers: number; totalAdmins: number; activeUsers30d: number;
  totalAiRequests: number; pendingChatRequests: number; pendingTasks: number;
  pendingBugs: number; unreadInbox: number; activeIntegrations: number;
  totalIntegrations: number; emailsSentToday: number; emailEngagementsToday: number;
  recentActivity: { type: string; action: string; title: string; sub: string | null; ts: string }[];
};

/* ── Activity icon map ───────────────────────────────────────── */
const ACTIVITY_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  lead:    { icon: TrendingUp,    color: "text-amber-400",  bg: "bg-amber-500/15"  },
  contact: { icon: MessageSquare, color: "text-blue-400",   bg: "bg-blue-500/15"   },
  user:    { icon: UserPlus,      color: "text-green-400",  bg: "bg-green-500/15"  },
  task:    { icon: FileText,      color: "text-cyan-400",   bg: "bg-cyan-500/15"   },
  bug:     { icon: BugPlay,       color: "text-rose-400",   bg: "bg-rose-500/15"   },
  chat:    { icon: MessagesSquare,color: "text-violet-400", bg: "bg-violet-500/15" },
  email:   { icon: Send,          color: "text-primary",    bg: "bg-primary/15"    },
};

/* ═══════════════════════════════════════════════════════════ */
/*  Overview Tab                                               */
/* ═══════════════════════════════════════════════════════════ */
function OverviewTab() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [open, setOpen] = useState(false);

  const range = useMemo(() => getRangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const rangeLabel = formatRange(preset, range);

  const { data: me } = useQuery<{ authenticated: boolean; username: string }>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) { const e = new Error() as any; e.status = r.status; throw e; }
      return r.json();
    },
    staleTime: Infinity,
  });

  const { data: stats, isLoading: statsLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey(), refetchInterval: 30000 },
  });

  const { data: ovStats, isLoading: ovLoading } = useQuery<OverviewStats>({
    queryKey: ["admin-overview-stats"],
    queryFn: () => fetch("/api/admin/overview-stats", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const isLoading = statsLoading || ovLoading;

  /* ── Stat card grid ────────────────────────────────────────── */
  const statCards = [
    {
      title: "Registered Users",
      value: ovStats?.totalUsers ?? 0,
      note: `${ovStats?.activeUsers30d ?? 0} active in 30d`,
      icon: Users,
      color: "text-blue-400", bg: "bg-blue-500/10",
      alert: false,
    },
    {
      title: "Admin Accounts",
      value: ovStats?.totalAdmins ?? 0,
      note: "total admins",
      icon: ShieldCheck,
      color: "text-indigo-400", bg: "bg-indigo-500/10",
      alert: false,
    },
    {
      title: "AI Requests",
      value: ovStats?.totalAiRequests ?? 0,
      note: "all time",
      icon: Sparkles,
      color: "text-violet-400", bg: "bg-violet-500/10",
      alert: false,
    },
    {
      title: "Pending Chats",
      value: ovStats?.pendingChatRequests ?? 0,
      note: "needs reply",
      icon: MessagesSquare,
      color: "text-amber-400", bg: "bg-amber-500/10",
      alert: (ovStats?.pendingChatRequests ?? 0) > 0,
    },
    {
      title: "Pending Tasks",
      value: ovStats?.pendingTasks ?? 0,
      note: "not completed",
      icon: FileText,
      color: "text-cyan-400", bg: "bg-cyan-500/10",
      alert: (ovStats?.pendingTasks ?? 0) > 0,
    },
    {
      title: "Bug Reports",
      value: ovStats?.pendingBugs ?? 0,
      note: "unresolved",
      icon: BugPlay,
      color: "text-rose-400", bg: "bg-rose-500/10",
      alert: (ovStats?.pendingBugs ?? 0) > 0,
    },
    {
      title: "Unread Inbox",
      value: ovStats?.unreadInbox ?? 0,
      note: "inbound unread",
      icon: Inbox,
      color: "text-green-400", bg: "bg-green-500/10",
      alert: (ovStats?.unreadInbox ?? 0) > 0,
    },
    {
      title: "Emails Sent Today",
      value: ovStats?.emailsSentToday ?? 0,
      note: `${ovStats?.emailEngagementsToday ?? 0} engagements`,
      icon: Send,
      color: "text-primary", bg: "bg-primary/10",
      alert: false,
    },
    {
      title: "Integrations",
      value: `${ovStats?.activeIntegrations ?? 0}/${ovStats?.totalIntegrations ?? 0}`,
      note: "configured / total",
      icon: Plug,
      color: (ovStats?.activeIntegrations ?? 0) === (ovStats?.totalIntegrations ?? 1)
        ? "text-emerald-400" : "text-orange-400",
      bg: (ovStats?.activeIntegrations ?? 0) === (ovStats?.totalIntegrations ?? 1)
        ? "bg-emerald-500/10" : "bg-orange-500/10",
      alert: false,
    },
    {
      title: "Active Visitors",
      value: stats?.activeVisitors ?? 0,
      note: "real-time",
      icon: Activity,
      color: "text-teal-400", bg: "bg-teal-500/10",
      alert: false,
    },
    {
      title: "Today's Page Views",
      value: stats?.todayViews ?? 0,
      note: "today only",
      icon: Eye,
      color: "text-sky-400", bg: "bg-sky-500/10",
      alert: false,
    },
    {
      title: "Active Users (30d)",
      value: ovStats?.activeUsers30d ?? 0,
      note: "with recent activity",
      icon: UserCheck,
      color: "text-emerald-400", bg: "bg-emerald-500/10",
      alert: false,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">
            {me?.username
              ? <>Welcome back, <span className="text-foreground font-medium">{me.username}</span> · Real-time metrics and agency performance.</>
              : "Real-time metrics and agency performance."
            }
          </p>
        </div>
        {/* Date filter for traffic section */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 border-border/60 bg-card hover:bg-secondary/60 min-w-[180px] justify-between font-medium">
              <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />{rangeLabel}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 bg-card border-border/60 shadow-xl rounded-xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Date Range</p>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {PRESETS.filter(p => p.value !== "custom").map(p => (
                <button key={p.value} onClick={() => { setPreset(p.value); if (p.value !== "custom") setOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${preset === p.value ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-border/50 pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Custom Range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset("custom"); }}
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset("custom"); }}
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                {preset === "custom" && customFrom && customTo && (
                  <Button size="sm" className="w-full mt-1" onClick={() => setOpen(false)}>Apply</Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── 12-card metric grid ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : statCards.map(({ title, value, note, icon: Icon, color, bg, alert }) => (
            <Card key={title} className="relative p-5 rounded-2xl border-border/50 bg-card hover:shadow-md transition-all group overflow-hidden">
              {/* subtle glow on alert */}
              {alert && <div className="absolute inset-0 rounded-2xl ring-1 ring-orange-500/30 pointer-events-none" />}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
                  <p className="text-3xl font-display font-bold text-foreground mt-1.5 leading-none">{value}</p>
                  {note && <p className="text-xs text-muted-foreground/60 mt-1.5">{note}</p>}
                </div>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
              {alert && (
                <div className="absolute top-2 right-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 block animate-pulse" />
                </div>
              )}
            </Card>
          ))
        }
      </div>

      {/* ── Lower row: Top Pages + Activity Feed ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Top pages today */}
        <Card className="rounded-2xl border-border/50 bg-card overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" /> Top Pages Today
            </h3>
            <span className="text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1">Today only</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/20">
                  <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Views</th>
                </tr>
              </thead>
              <tbody>
                {statsLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="px-5 py-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-5 py-3 flex justify-end"><Skeleton className="h-4 w-10" /></td>
                    </tr>
                  ))
                  : stats?.topPages?.length
                    ? stats.topPages.map((p, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3 text-foreground font-mono text-sm">{p.page}</td>
                        <td className="px-5 py-3 text-right font-semibold text-foreground">{p.count}</td>
                      </tr>
                    ))
                    : <tr><td colSpan={2} className="px-5 py-10 text-center text-sm text-muted-foreground">No page views recorded today.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="rounded-2xl border-border/50 bg-card overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent Activity
            </h3>
            <span className="text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1">All sites</span>
          </div>
          <div className="divide-y divide-border/40 max-h-[380px] overflow-y-auto">
            {ovLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                  <div className="flex-1"><Skeleton className="h-4 w-40 mb-1" /><Skeleton className="h-3 w-24" /></div>
                </div>
              ))
              : !ovStats?.recentActivity?.length
                ? <div className="px-5 py-10 text-center text-sm text-muted-foreground">No recent activity.</div>
                : ovStats.recentActivity.map((item, i) => {
                  const meta = ACTIVITY_META[item.type] ?? ACTIVITY_META.contact;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-secondary/20 transition-colors">
                      <div className={`w-8 h-8 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.title || item.action}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium ${meta.color}`}>{item.action}</span>
                          {item.sub && <span className="text-xs text-muted-foreground truncate">· {item.sub}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                        {item.ts ? formatDistanceToNow(new Date(item.ts), { addSuffix: true }) : ""}
                      </span>
                    </div>
                  );
                })
            }
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Tools Dashboard Tab (unchanged)                            */
/* ═══════════════════════════════════════════════════════════ */

function fmtSeconds(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

type ToolsStats = {
  urlShortener: { totalLinks: number; totalClicks: number; referrers: { source: string; clicks: number }[]; devices: { device: string; clicks: number }[]; browsers: { browser: string; clicks: number }[] };
  screenRecorder: { totalRecordings: number; totalSeconds: number };
  pdfAudio: { totalBooks: number; totalPages: number };
  ai: { totalRequests: number; totalTokens: number; totalCostUsd: number; models: { provider: string; model: string; requests: number; tokens: number }[] };
  totalUsers: number;
  topLinkUsers: { name: string; email: string; link_count: number; click_count: number }[];
  topRecordUsers: { name: string; email: string; rec_count: number; total_seconds: number }[];
  topAiUsers: { name: string; email: string; requests: number; tokens: number }[];
};

function ToolsDashboardTab() {
  const { data, isLoading } = useQuery<ToolsStats>({
    queryKey: ["admin-tools-stats"],
    queryFn: () => fetch("/api/admin/tools/stats", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const { urlShortener, screenRecorder, pdfAudio, ai, totalUsers, topLinkUsers, topRecordUsers, topAiUsers } = data;
  const topClicks  = Math.max(...urlShortener.referrers.map(r => r.clicks), 1);
  const topDevice  = Math.max(...urlShortener.devices.map(d => d.clicks), 1);
  const topBrowser = Math.max(...urlShortener.browsers.map(b => b.clicks), 1);
  const topModel   = Math.max(...ai.models.map(m => m.requests), 1);

  const summaryCards = [
    { label: "Tool Users",      value: totalUsers,                      icon: Users,       color: "text-blue-400",   bg: "bg-blue-500/10" },
    { label: "Short Links",     value: urlShortener.totalLinks,         icon: Link2,       color: "text-primary",    bg: "bg-primary/10" },
    { label: "Total Clicks",    value: urlShortener.totalClicks,        icon: MousePointer,color: "text-green-400",  bg: "bg-green-500/10" },
    { label: "Screen Recordings",value: screenRecorder.totalRecordings, icon: Video,       color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "PDFs Converted",  value: pdfAudio.totalBooks,             icon: Headphones,  color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "AI Requests",     value: ai.totalRequests,                icon: Bot,         color: "text-violet-400", bg: "bg-violet-500/10" },
  ];

  const deviceIcons: Record<string, React.ComponentType<{ className?: string }>> = { desktop: Monitor, mobile: Smartphone, tablet: Smartphone };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="p-4 rounded-2xl border-border/50 bg-card">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}><Icon className={`w-5 h-5 ${color}`} /></div>
            <p className="text-2xl font-display font-bold text-foreground">{Number(value).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 rounded-2xl border-border/50 bg-card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Link2 className="w-5 h-5 text-primary" /></div>
            <div><h3 className="font-display font-bold text-foreground">URL Shortener</h3><p className="text-xs text-muted-foreground">{urlShortener.totalLinks.toLocaleString()} links · {urlShortener.totalClicks.toLocaleString()} clicks</p></div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Click Sources</p>
          {urlShortener.referrers.length === 0 ? <p className="text-sm text-muted-foreground py-2">No click data yet</p> : (
            <div className="space-y-2">
              {urlShortener.referrers.slice(0,6).map(r => (
                <div key={r.source} className="flex items-center gap-3">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground w-28 truncate shrink-0">{r.source}</span>
                  <Bar pct={(r.clicks/topClicks)*100} color="bg-primary" />
                  <span className="text-sm font-medium text-foreground w-10 text-right shrink-0">{r.clicks}</span>
                </div>
              ))}
            </div>
          )}
          {urlShortener.devices.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-5">Devices</p>
              <div className="space-y-2">
                {urlShortener.devices.map(d => {
                  const DIcon = deviceIcons[d.device?.toLowerCase()] ?? Monitor;
                  return (
                    <div key={d.device} className="flex items-center gap-3">
                      <DIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground w-28 truncate shrink-0 capitalize">{d.device}</span>
                      <Bar pct={(d.clicks/topDevice)*100} color="bg-green-500" />
                      <span className="text-sm font-medium text-foreground w-10 text-right shrink-0">{d.clicks}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5 rounded-2xl border-border/50 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center"><Video className="w-5 h-5 text-purple-400" /></div>
              <div><h3 className="font-display font-bold text-foreground">Screen Recorder</h3><p className="text-xs text-muted-foreground">Total usage across all users</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-xl p-4 text-center">
                <p className="text-3xl font-display font-bold text-foreground">{screenRecorder.totalRecordings.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Recordings</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4 text-center">
                <p className="text-3xl font-display font-bold text-foreground">{fmtSeconds(screenRecorder.totalSeconds)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Duration</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 rounded-2xl border-border/50 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center"><Headphones className="w-5 h-5 text-orange-400" /></div>
              <div><h3 className="font-display font-bold text-foreground">PDF to Audio</h3><p className="text-xs text-muted-foreground">Total conversions across all users</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-xl p-4 text-center">
                <p className="text-3xl font-display font-bold text-foreground">{pdfAudio.totalBooks.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">PDFs Converted</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4 text-center">
                <p className="text-3xl font-display font-bold text-foreground">{pdfAudio.totalPages.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Pages</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-6 rounded-2xl border-border/50 bg-card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><Sparkles className="w-5 h-5 text-violet-400" /></div>
          <div><h3 className="font-display font-bold text-foreground">Advantix AI</h3>
          <p className="text-xs text-muted-foreground">{ai.totalRequests.toLocaleString()} requests · {ai.totalTokens.toLocaleString()} tokens · ${ai.totalCostUsd.toFixed(4)} est. cost</p></div>
        </div>
        {ai.models.length === 0 ? <p className="text-sm text-muted-foreground py-2">No AI usage recorded yet</p> : (
          <div className="space-y-2">
            {ai.models.map(m => (
              <div key={`${m.provider}-${m.model}`} className="flex items-center gap-3">
                <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground w-48 truncate shrink-0">{m.model}</span>
                <span className="text-xs text-muted-foreground w-16 shrink-0">{m.provider}</span>
                <Bar pct={(m.requests/topModel)*100} color="bg-violet-500" />
                <span className="text-sm font-medium text-foreground w-16 text-right shrink-0">{m.requests.toLocaleString()} req</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {urlShortener.browsers.length > 0 && (
          <Card className="p-6 rounded-2xl border-border/50 bg-card">
            <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> Browser Breakdown</h3>
            <div className="space-y-2">
              {urlShortener.browsers.map(b => (
                <div key={b.browser} className="flex items-center gap-3">
                  <span className="text-sm text-foreground w-32 truncate shrink-0">{b.browser}</span>
                  <Bar pct={(b.clicks/topBrowser)*100} color="bg-cyan-500" />
                  <span className="text-sm font-medium text-foreground w-10 text-right shrink-0">{b.clicks}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card className="p-6 rounded-2xl border-border/50 bg-card">
          <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" /> Top Users by Link Clicks</h3>
          {topLinkUsers.length === 0 ? <p className="text-sm text-muted-foreground py-2">No link data yet</p> : (
            <div className="space-y-3">
              {topLinkUsers.map((u, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-primary">{u.name[0]?.toUpperCase()}</span></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                  <div className="text-right shrink-0"><p className="text-sm font-bold text-foreground">{u.click_count.toLocaleString()}</p><p className="text-xs text-muted-foreground">{u.link_count} links</p></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 rounded-2xl border-border/50 bg-card">
          <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2"><Video className="w-4 h-4 text-purple-400" /> Top Users by Recording Time</h3>
          {topRecordUsers.length === 0 ? <p className="text-sm text-muted-foreground py-2">No recording data yet</p> : (
            <div className="space-y-3">
              {topRecordUsers.map((u, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-purple-400">{u.name[0]?.toUpperCase()}</span></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                  <div className="text-right shrink-0"><p className="text-sm font-bold text-foreground">{fmtSeconds(u.total_seconds)}</p><p className="text-xs text-muted-foreground">{u.rec_count} sessions</p></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6 rounded-2xl border-border/50 bg-card">
          <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" /> Top Users by AI Usage</h3>
          {topAiUsers.length === 0 ? <p className="text-sm text-muted-foreground py-2">No AI usage data yet</p> : (
            <div className="space-y-3">
              {topAiUsers.map((u, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-violet-400">{u.name[0]?.toUpperCase()}</span></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                  <div className="text-right shrink-0"><p className="text-sm font-bold text-foreground">{u.requests.toLocaleString()}</p><p className="text-xs text-muted-foreground">{u.tokens.toLocaleString()} tokens</p></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Root: tab switcher                                         */
/* ═══════════════════════════════════════════════════════════ */
type Tab = "overview" | "tools";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      {/* Tab pills */}
      <div className="flex gap-1 bg-secondary/40 p-1 rounded-xl w-fit border border-border/40">
        {([
          { key: "overview", label: "Overview",        icon: BarChart2 },
          { key: "tools",    label: "Tools Dashboard", icon: Zap },
        ] as { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-background text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "tools"    && <ToolsDashboardTab />}
    </div>
  );
}
