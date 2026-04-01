import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Users, Zap, DollarSign, BarChart3, Edit2, Check, X } from "lucide-react";

interface Stats {
  totalTokens: number;
  totalCostUsd: number;
  activeUsers: number;
  byProvider: { provider: string; totalTokens: string; totalCost: string }[];
}

interface UserUsage {
  id: number;
  name: string;
  email: string;
  tokensUsed: number;
  costUsd: number;
  monthlyLimit: number | null;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  anthropic: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  gemini: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI (GPT)",
  anthropic: "Anthropic (Claude)",
  gemini: "Google (Gemini)",
};

export default function ManageAI() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editLimit, setEditLimit] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`/api/ai/admin/stats?period=${period}`, { credentials: "include" }),
        fetch("/api/ai/admin/users", { credentials: "include" }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function saveLimit(userId: number) {
    const value = editLimit === "" || editLimit === "∞" ? null : parseInt(editLimit);
    const res = await fetch(`/api/ai/admin/users/${userId}/limit`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyTokenLimit: value }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, monthlyLimit: value } : u));
      setEditingUser(null);
      toast({ title: "Limit updated" });
    }
  }

  const totalByProvider = stats?.byProvider ?? [];
  const grandTotal = totalByProvider.reduce((s, p) => s + Number(p.totalTokens), 0) || 1;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Manage Advantix AI</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor usage, costs, and set user limits</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["week", "month", "all"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "week" ? "This week" : p === "month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Tokens", value: stats ? stats.totalTokens.toLocaleString() : "—", icon: Zap, color: "text-primary" },
          { label: "Total Cost (USD)", value: stats ? `$${stats.totalCostUsd.toFixed(4)}` : "—", icon: DollarSign, color: "text-emerald-500" },
          { label: "Active Users", value: stats ? stats.activeUsers.toString() : "—", icon: Users, color: "text-blue-500" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* By Provider */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Usage by Provider</h2>
        </div>
        {totalByProvider.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
        ) : (
          <div className="space-y-3">
            {totalByProvider.map(p => {
              const tokens = Number(p.totalTokens);
              const cost = Number(p.totalCost);
              const pct = Math.round((tokens / grandTotal) * 100);
              return (
                <div key={p.provider}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[p.provider] || "bg-muted text-muted-foreground border-border"}`}>
                        {PROVIDER_LABELS[p.provider] || p.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{tokens.toLocaleString()} tokens</span>
                      <span className="text-foreground font-medium">${cost.toFixed(4)}</span>
                      <span className="text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">User Usage</h2>
          <span className="ml-auto text-xs text-muted-foreground">Monthly tokens · Monthly cost · Limit</span>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No users have used Advantix AI yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">User</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Cost</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Monthly Limit</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => {
                const atRisk = u.monthlyLimit && u.tokensUsed / u.monthlyLimit > 0.8;
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={atRisk ? "text-destructive font-medium" : ""}>
                        {u.tokensUsed.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-muted-foreground">
                      ${u.costUsd.toFixed(4)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {editingUser === u.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            value={editLimit}
                            onChange={e => setEditLimit(e.target.value)}
                            placeholder="∞"
                            className="w-24 px-2 py-1 text-xs bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary/50 text-right"
                          />
                          <button onClick={() => saveLimit(u.id)} className="text-emerald-500 hover:text-emerald-400 p-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingUser(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className={`font-mono text-xs ${atRisk ? "text-amber-500" : "text-muted-foreground"}`}>
                          {u.monthlyLimit ? u.monthlyLimit.toLocaleString() : "∞"}
                          {atRisk && " ⚠"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {editingUser !== u.id && (
                        <button
                          onClick={() => { setEditingUser(u.id); setEditLimit(u.monthlyLimit?.toString() ?? ""); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit limit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
