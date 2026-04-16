import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Users, DollarSign, BarChart3, Clock, Terminal, RefreshCw, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type UserStat = {
  user_id: number;
  email: string;
  name: string | null;
  joined_at: string;
  total_tokens: string;
  input_tokens: string;
  output_tokens: string;
  total_cost_usd: string;
  month_cost_usd: string;
  total_tool_calls: string;
  request_count: string;
  last_used_at: string | null;
  messages_sent: string;
};

type RecentRequest = {
  id: number;
  user_id: number;
  email: string;
  name: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
  tool_calls: number;
  created_at: string;
};

function fmt(n: string | number): string {
  return Number(n).toLocaleString();
}

function cost(n: string | number): string {
  const v = Number(n);
  if (v === 0) return "$0.00";
  if (v < 0.001) return `$${v.toFixed(6)}`;
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic:  "bg-amber-500/10 text-amber-400 border-amber-500/25",
  openai:     "bg-green-500/10 text-green-400 border-green-500/25",
  openrouter: "bg-purple-500/10 text-purple-400 border-purple-500/25",
  gemini:     "bg-blue-500/10 text-blue-400 border-blue-500/25",
};

export default function AssistantUsage() {
  const [users, setUsers] = useState<UserStat[]>([]);
  const [recent, setRecent] = useState<RecentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [tab, setTab] = useState<"users" | "recent">("users");

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/admin/assistant/usage`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setUsers(d.users ?? []); setRecent(d.recentRequests ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalTokens   = users.reduce((s, u) => s + Number(u.total_tokens), 0);
  const totalCost     = users.reduce((s, u) => s + Number(u.total_cost_usd), 0);
  const monthCost     = users.reduce((s, u) => s + Number(u.month_cost_usd), 0);
  const activeUsers   = users.filter(u => Number(u.request_count) > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">AI Tool Usage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Token consumption and cost estimates across all users</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Zap,        label: "Total Tokens",    value: fmt(totalTokens),    color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20" },
          { icon: DollarSign, label: "All-time Cost",   value: cost(totalCost),     color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
          { icon: TrendingUp, label: "This Month",      value: cost(monthCost),     color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
          { icon: Users,      label: "Active Users",    value: String(activeUsers), color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
        ].map(({ icon: Icon, label, value, color, bg, border }) => (
          <Card key={label} className={`p-4 border ${border} ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit border border-border/50">
        {(["users", "recent"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? "Per User" : "Recent Requests"}
          </button>
        ))}
      </div>

      {/* Per-user table */}
      {tab === "users" && (
        <Card className="border border-border/50 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No users found.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {/* Table head */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 bg-muted/20 text-xs text-muted-foreground font-medium">
                <span>User</span>
                <span className="text-right">Tokens</span>
                <span className="text-right">Messages</span>
                <span className="text-right">Tool Calls</span>
                <span className="text-right">This Month</span>
                <span className="text-right">All-time Cost</span>
              </div>
              {users.map(u => {
                const isExpanded = expandedUser === u.user_id;
                const hasActivity = Number(u.request_count) > 0;
                return (
                  <motion.div key={u.user_id} layout>
                    <button
                      onClick={() => hasActivity && setExpandedUser(isExpanded ? null : u.user_id)}
                      className={`w-full grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3.5 text-sm text-left transition-colors ${
                        hasActivity ? "hover:bg-muted/20 cursor-pointer" : "cursor-default opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {hasActivity
                          ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)
                          : <div className="w-3.5" />
                        }
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{u.name || u.email}</p>
                          {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                          {u.last_used_at && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {timeAgo(u.last_used_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-right font-mono text-xs text-amber-400">{fmt(u.total_tokens)}</span>
                      <span className="text-right text-xs">{fmt(u.messages_sent)}</span>
                      <span className="text-right text-xs">{fmt(u.total_tool_calls)}</span>
                      <span className="text-right text-xs text-blue-400">{cost(u.month_cost_usd)}</span>
                      <span className="text-right text-xs font-semibold text-green-400">{cost(u.total_cost_usd)}</span>
                    </button>

                    {/* Expanded breakdown */}
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-5 pb-4 bg-muted/10 border-t border-border/30"
                      >
                        <div className="pt-3 grid grid-cols-3 gap-3">
                          {[
                            { label: "Input tokens",  value: fmt(u.input_tokens) },
                            { label: "Output tokens", value: fmt(u.output_tokens) },
                            { label: "Requests sent", value: fmt(u.request_count) },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg bg-background border border-border/40 p-3 text-center">
                              <p className="text-sm font-bold font-display text-foreground">{value}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Recent requests feed */}
      {tab === "recent" && (
        <Card className="border border-border/50 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No requests yet.</div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 bg-muted/20 text-xs text-muted-foreground font-medium">
                <span>User · Model</span>
                <span className="text-right">Tokens</span>
                <span className="text-right">Tools</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Time</span>
              </div>
              {recent.map(r => (
                <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-sm items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{r.name || r.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${PROVIDER_COLORS[r.provider] ?? "bg-muted/30 text-muted-foreground border-border/30"}`}>
                        {r.provider}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">{r.model}</span>
                    </div>
                  </div>
                  <span className="text-right font-mono text-xs text-amber-400">{fmt(r.total_tokens)}</span>
                  <span className="text-right text-xs flex items-center justify-end gap-0.5">
                    {r.tool_calls > 0 ? (
                      <><Terminal className="w-3 h-3 text-green-400" /> {r.tool_calls}</>
                    ) : <span className="text-muted-foreground">—</span>}
                  </span>
                  <span className="text-right text-xs font-semibold text-green-400">{cost(r.estimated_cost_usd)}</span>
                  <span className="text-right text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
