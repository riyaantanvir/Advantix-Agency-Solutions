import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import {
  Users, Zap, DollarSign, Bot, Edit2, Check, X,
  MessageSquare, Wrench, TrendingUp, Calendar,
} from "lucide-react";

interface Summary {
  grand_tokens: string;
  grand_cost: string;
  active_users: string;
  month_tokens: string;
  month_cost: string;
}

interface UserRow {
  user_id: number;
  name: string;
  email: string;
  joined_at: string;
  total_tokens: string;
  total_cost_usd: string;
  month_cost_usd: string;
  month_tokens: string;
  total_tool_calls: string;
  request_count: string;
  last_used_at: string | null;
  messages_sent: string;
  month_messages: string;
  monthly_message_limit: number | null;
  monthly_token_limit: number | null;
  monthly_usd_limit: string | null;
}

function fmt(n: string | number, decimals = 0) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(v) ? "0" : v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function ManageAssistant() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editMsgLimit, setEditMsgLimit] = useState("");
  const [editTokenLimit, setEditTokenLimit] = useState("");
  const [editUsdLimit, setEditUsdLimit] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/assistant/usage", { credentials: "include" });
      if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return; }
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }

  function startEdit(u: UserRow) {
    setEditingUser(u.user_id);
    setEditMsgLimit(u.monthly_message_limit != null ? String(u.monthly_message_limit) : "");
    setEditTokenLimit(u.monthly_token_limit != null ? String(u.monthly_token_limit) : "");
    setEditUsdLimit(u.monthly_usd_limit != null ? parseFloat(u.monthly_usd_limit).toFixed(2) : "");
  }

  async function saveLimit(userId: number) {
    const monthlyMessageLimit = editMsgLimit === "" ? null : parseInt(editMsgLimit);
    const monthlyTokenLimit = editTokenLimit === "" ? null : parseInt(editTokenLimit);
    const monthlyUsdLimit = editUsdLimit === "" ? null : parseFloat(editUsdLimit);

    const res = await fetch(`/api/admin/assistant/users/${userId}/limit`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyMessageLimit, monthlyTokenLimit, monthlyUsdLimit }),
    });
    if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return; }
    if (res.ok) {
      setUsers(prev => prev.map(u =>
        u.user_id === userId
          ? {
              ...u,
              monthly_message_limit: monthlyMessageLimit,
              monthly_token_limit: monthlyTokenLimit,
              monthly_usd_limit: monthlyUsdLimit != null ? String(monthlyUsdLimit) : null,
            }
          : u
      ));
      setEditingUser(null);
      toast({ title: "Limits updated" });
    } else {
      toast({ title: "Failed to update limits", variant: "destructive" });
    }
  }

  const activeCount = users.filter(u => parseFloat(u.total_cost_usd) > 0 || parseInt(u.messages_sent) > 0).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Manage Advantix Assistant</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor usage and set per-user limits</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total Tokens (All time)",
            value: summary ? fmt(summary.grand_tokens) : "—",
            icon: Zap,
            color: "text-primary",
            sub: summary ? `${fmt(summary.month_tokens)} this month` : "",
          },
          {
            label: "Total Cost (All time)",
            value: summary ? `$${fmt(summary.grand_cost, 4)}` : "—",
            icon: DollarSign,
            color: "text-emerald-500",
            sub: summary ? `$${fmt(summary.month_cost, 4)} this month` : "",
          },
          {
            label: "Active Users",
            value: String(activeCount),
            icon: Users,
            color: "text-blue-500",
            sub: `of ${users.length} total`,
          },
          {
            label: "Total Requests",
            value: summary ? fmt(users.reduce((s, u) => s + parseInt(u.request_count), 0)) : "—",
            icon: TrendingUp,
            color: "text-violet-500",
            sub: `${fmt(users.reduce((s, u) => s + parseInt(u.messages_sent), 0))} messages sent`,
          },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{loading ? "—" : card.value}</p>
            {card.sub && <p className="text-xs text-muted-foreground mt-1">{loading ? "" : card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">User Usage & Limits</h2>
          <span className="ml-auto text-xs text-muted-foreground">Click ✏️ to set monthly limits per user</span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">User</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1"><MessageSquare className="w-3 h-3" /> Msgs (mo)</div>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1"><Zap className="w-3 h-3" /> Tokens (mo)</div>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1"><DollarSign className="w-3 h-3" /> Cost (mo)</div>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1"><Wrench className="w-3 h-3" /> Tool Calls</div>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Msg Limit/mo</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Token Limit/mo</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">USD Limit/mo</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-end gap-1"><Calendar className="w-3 h-3" /> Last Used</div>
                  </th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => {
                  const isEditing = editingUser === u.user_id;
                  const monthMsgs = parseInt(u.month_messages);
                  const monthTokens = parseInt(u.month_tokens);
                  const monthCost = parseFloat(u.month_cost_usd);
                  const msgAtRisk = u.monthly_message_limit && monthMsgs / u.monthly_message_limit > 0.8;
                  const tokenAtRisk = u.monthly_token_limit && monthTokens / u.monthly_token_limit > 0.8;
                  const usdAtRisk = u.monthly_usd_limit && monthCost / parseFloat(u.monthly_usd_limit) > 0.8;
                  const hasActivity = parseInt(u.messages_sent) > 0 || parseInt(u.total_tool_calls) > 0;

                  return (
                    <tr key={u.user_id} className={`transition-colors ${isEditing ? "bg-muted/30" : "hover:bg-muted/20"} ${!hasActivity ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                        {!hasActivity && <div className="text-[10px] text-muted-foreground/60 mt-0.5">No activity</div>}
                      </td>

                      {/* Month messages */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={msgAtRisk ? "text-amber-500 font-medium" : "tabular-nums"}>
                          {monthMsgs.toLocaleString()}{msgAtRisk ? " ⚠" : ""}
                        </span>
                      </td>

                      {/* Month tokens */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={tokenAtRisk ? "text-amber-500 font-medium" : "text-muted-foreground tabular-nums"}>
                          {monthTokens.toLocaleString()}{tokenAtRisk ? " ⚠" : ""}
                        </span>
                      </td>

                      {/* Month cost */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={usdAtRisk ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                          ${monthCost.toFixed(4)}{usdAtRisk ? " ⚠" : ""}
                        </span>
                      </td>

                      {/* Tool calls */}
                      <td className="px-3 py-3.5 text-right text-muted-foreground tabular-nums">
                        {parseInt(u.total_tool_calls).toLocaleString()}
                      </td>

                      {/* Msg limit */}
                      <td className="px-3 py-3.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editMsgLimit}
                            onChange={e => setEditMsgLimit(e.target.value)}
                            placeholder="∞"
                            className="w-24 px-2 py-1 text-xs bg-background border border-primary/40 rounded-md outline-none focus:ring-1 focus:ring-primary/50 text-right"
                          />
                        ) : (
                          <span className={`font-mono text-xs ${msgAtRisk ? "text-amber-500" : "text-muted-foreground"}`}>
                            {u.monthly_message_limit != null ? u.monthly_message_limit.toLocaleString() : "∞"}
                          </span>
                        )}
                      </td>

                      {/* Token limit */}
                      <td className="px-3 py-3.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editTokenLimit}
                            onChange={e => setEditTokenLimit(e.target.value)}
                            placeholder="∞"
                            className="w-24 px-2 py-1 text-xs bg-background border border-primary/40 rounded-md outline-none focus:ring-1 focus:ring-primary/50 text-right"
                          />
                        ) : (
                          <span className={`font-mono text-xs ${tokenAtRisk ? "text-amber-500" : "text-muted-foreground"}`}>
                            {u.monthly_token_limit != null ? u.monthly_token_limit.toLocaleString() : "∞"}
                          </span>
                        )}
                      </td>

                      {/* USD limit */}
                      <td className="px-3 py-3.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editUsdLimit}
                            onChange={e => setEditUsdLimit(e.target.value)}
                            placeholder="∞"
                            className="w-24 px-2 py-1 text-xs bg-background border border-primary/40 rounded-md outline-none focus:ring-1 focus:ring-primary/50 text-right"
                          />
                        ) : (
                          <span className={`font-mono text-xs ${usdAtRisk ? "text-amber-500" : "text-muted-foreground"}`}>
                            {u.monthly_usd_limit != null ? `$${parseFloat(u.monthly_usd_limit).toFixed(2)}` : "∞"}
                          </span>
                        )}
                      </td>

                      {/* Last used */}
                      <td className="px-3 py-3.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {u.last_used_at
                          ? new Date(u.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "Never"}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveLimit(u.user_id)} className="text-emerald-500 hover:text-emerald-400 p-0.5" title="Save">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingUser(null)} className="text-muted-foreground hover:text-foreground p-0.5" title="Cancel">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(u)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit limits">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <p className="text-xs text-muted-foreground">
        ⚠ = user has exceeded 80% of their monthly limit. Set limit to blank/empty to allow unlimited usage.
      </p>
    </div>
  );
}
