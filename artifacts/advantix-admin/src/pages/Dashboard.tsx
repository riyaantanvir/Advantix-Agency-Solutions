import { useState, useMemo } from "react";
import { useGetStats, getGetStatsQueryKey, useListLeads, useListContacts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Users, Eye, Mail, TrendingUp, MessageSquare, Activity, Calendar, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  isWithinInterval, startOfDay, endOfDay,
  subDays, startOfMonth, format, isToday as dateFnsIsToday,
} from "date-fns";

/* ── Date preset types ──────────────────────────────────────── */
type Preset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "allTime" | "custom";

const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days", value: "last30" },
  { label: "This Month", value: "thisMonth" },
  { label: "All Time", value: "allTime" },
  { label: "Custom", value: "custom" },
];

function getRangeForPreset(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "allTime":
      return null;
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = new Date(customFrom);
      const t = new Date(customTo);
      if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
      return { from: startOfDay(f), to: endOfDay(t) };
    }
  }
}

function formatRange(preset: Preset, range: { from: Date; to: Date } | null): string {
  if (!range) return "All Time";
  if (preset === "today") return "Today";
  if (preset === "yesterday") return "Yesterday";
  if (preset === "last7") return "Last 7 Days";
  if (preset === "last30") return "Last 30 Days";
  if (preset === "thisMonth") return "This Month";
  return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
}

function inRange(dateStr: string, range: { from: Date; to: Date } | null): boolean {
  if (!range) return true;
  const d = new Date(dateStr);
  return isWithinInterval(d, { start: range.from, end: range.to });
}

/* ═══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [open, setOpen] = useState(false);

  const range = useMemo(
    () => getRangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const { data: me } = useQuery<{ authenticated: boolean; username: string }>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) { const err = new Error("Not authenticated") as any; err.status = r.status; throw err; }
      return r.json();
    },
    staleTime: Infinity,
  });

  const { data: stats, isLoading: statsLoading } = useGetStats({
    query: {
      queryKey: getGetStatsQueryKey(),
      refetchInterval: 30000,
    },
  });

  const { data: leads, isLoading: leadsLoading } = useListLeads();
  const { data: contacts, isLoading: contactsLoading } = useListContacts();

  const isLoading = statsLoading || leadsLoading || contactsLoading;

  /* filtered counts */
  const filteredLeads = useMemo(
    () => leads?.filter(l => inRange(l.createdAt, range)) ?? [],
    [leads, range]
  );
  const filteredContacts = useMemo(
    () => contacts?.filter(c => inRange(c.createdAt, range)) ?? [],
    [contacts, range]
  );
  const unreadInRange = filteredContacts.filter(c => !c.replied).length;
  const todayLeadsCount = leads?.filter(l => dateFnsIsToday(new Date(l.createdAt))).length ?? 0;

  const isToday = preset === "today";

  const statCards = [
    {
      title: "Active Visitors",
      value: stats?.activeVisitors ?? 0,
      icon: Activity,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      note: "real-time",
    },
    {
      title: isToday ? "Today's Views" : "Views (today)",
      value: stats?.todayViews ?? 0,
      icon: Eye,
      color: "text-green-500",
      bg: "bg-green-500/10",
      note: "today only",
    },
    {
      title: "New Leads",
      value: filteredLeads.length,
      icon: TrendingUp,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      note: null,
    },
    {
      title: "Unread Messages",
      value: unreadInRange,
      icon: MessageSquare,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      note: null,
    },
    {
      title: "Contacts",
      value: filteredContacts.length,
      icon: Mail,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      note: null,
    },
    {
      title: "Total Leads (all time)",
      value: leads?.length ?? 0,
      icon: Users,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      note: "all time",
    },
  ];

  const rangeLabel = formatRange(preset, range);

  return (
    <div className="space-y-8">
      {/* Header */}
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

        {/* Date filter */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-border/60 bg-card hover:bg-secondary/60 min-w-[180px] justify-between font-medium"
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                {rangeLabel}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-72 p-3 bg-card border-border/60 shadow-xl rounded-xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Date Range</p>

            {/* Preset buttons */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {PRESETS.filter(p => p.value !== "custom").map(p => (
                <button
                  key={p.value}
                  onClick={() => { setPreset(p.value); if (p.value !== "custom") setOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                    preset === p.value
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range */}
            <div className="border-t border-border/50 pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Custom Range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => { setCustomFrom(e.target.value); setPreset("custom"); }}
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => { setCustomTo(e.target.value); setPreset("custom"); }}
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {preset === "custom" && customFrom && customTo && (
                  <Button
                    size="sm"
                    className="w-full mt-1"
                    onClick={() => setOpen(false)}
                  >
                    Apply
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter pill */}
      <div className="flex items-center gap-2 -mt-4">
        <span className="text-xs text-muted-foreground">Showing data for:</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
          <Calendar className="w-3 h-3" />
          {rangeLabel}
        </span>
        {preset !== "today" && (
          <button
            onClick={() => setPreset("today")}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Reset to Today
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))
        ) : (
          statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6 rounded-2xl border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <h3 className="text-4xl font-display font-bold text-foreground mt-2">{stat.value}</h3>
                    {stat.note && (
                      <p className="text-xs text-muted-foreground/60 mt-1">{stat.note}</p>
                    )}
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Top pages — always today from API */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-card">
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h3 className="text-xl font-display font-bold">Top Pages Today</h3>
          <span className="text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1">Today only</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/30">
                <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Page Path</th>
                <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Views</th>
              </tr>
            </thead>
            <tbody>
              {statsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-6 py-4"><Skeleton className="h-5 w-48" /></td>
                    <td className="px-6 py-4 flex justify-end"><Skeleton className="h-5 w-12" /></td>
                  </tr>
                ))
              ) : stats?.topPages && stats.topPages.length > 0 ? (
                stats.topPages.map((page, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-foreground font-mono text-sm">{page.page}</td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">{page.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-muted-foreground">
                    No page views recorded today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Filtered leads/contacts summary */}
      {preset !== "today" && !isLoading && (
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-card">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-xl font-display font-bold">
              Activity Summary — <span className="text-primary">{rangeLabel}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30">
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Metric</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 text-foreground">New Leads</td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{filteredLeads.length}</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 text-foreground">New Contacts</td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{filteredContacts.length}</td>
                </tr>
                <tr className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 text-foreground">Unread Messages</td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{unreadInRange}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
