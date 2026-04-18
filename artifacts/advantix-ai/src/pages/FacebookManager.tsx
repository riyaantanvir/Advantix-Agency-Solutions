import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { useUser } from "@/context/UserContext";
import { toast } from "sonner";
import {
  Facebook, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  MessageCircle, Bot, Clock, CheckCircle2, XCircle, Zap,
  Link2, Settings, Eye, EyeOff, ToggleLeft, ToggleRight,
  AlertCircle, Send, Loader2, Info,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface FbPage {
  id: number; pageId: string; pageName: string; isActive: boolean;
  connectedAt: string; lastCheckedAt: string | null;
}
interface FbMessage {
  id: number; senderName: string | null; messageText: string; receivedAt: string;
  isReplied: boolean; replyText: string | null; replyType: string | null;
  error: string | null; pageName: string;
}
interface FbRule {
  id: number; facebookPageId: number; ruleName: string; triggerType: string;
  triggerKeywords: string | null; replyMode: string; replyTemplate: string | null;
  aiInstructions: string | null; priority: number; isActive: boolean;
}
interface Stats {
  totalMessages: number; aiReplies: number; templateReplies: number;
  pendingReplies: number; connectedPages: number;
}
interface WebhookInfo { webhookUrl: string; verifyToken: string; callbackFields: string; }
interface OAuthPage { id: string; name: string; }

const BASE = "/api";

/* ── Fetch helpers ─────────────────────────────────────────────────────── */
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error ?? r.statusText); }
  return r.json() as Promise<T>;
}

/* ── Rule Form ──────────────────────────────────────────────────────────── */
function RuleForm({
  pages, initial, onSave, onCancel,
}: {
  pages: FbPage[];
  initial?: Partial<FbRule>;
  onSave: (rule: FbRule) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    facebookPageId: initial?.facebookPageId ?? pages[0]?.id ?? 0,
    ruleName: initial?.ruleName ?? "",
    triggerType: initial?.triggerType ?? "all",
    triggerKeywords: initial?.triggerKeywords ?? "",
    replyMode: initial?.replyMode ?? "template",
    replyTemplate: initial?.replyTemplate ?? "",
    aiInstructions: initial?.aiInstructions ?? "",
    priority: initial?.priority ?? 0,
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let saved: FbRule;
      if (initial?.id) {
        saved = (await api<{ rule: FbRule }>(`/facebook/rules/${initial.id}`, {
          method: "PUT", body: JSON.stringify(form),
        })).rule;
      } else {
        saved = (await api<{ rule: FbRule }>(`/facebook/rules`, {
          method: "POST", body: JSON.stringify(form),
        })).rule;
      }
      onSave(saved);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Rule Name *</label>
          <input required value={form.ruleName} onChange={e => setForm(f => ({ ...f, ruleName: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            placeholder="e.g. Welcome Reply" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Facebook Page *</label>
          <select value={form.facebookPageId} onChange={e => setForm(f => ({ ...f, facebookPageId: Number(e.target.value) }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
            {pages.map(p => <option key={p.id} value={p.id}>{p.pageName}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Trigger Type</label>
          <select value={form.triggerType} onChange={e => setForm(f => ({ ...f, triggerType: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50">
            <option value="all">All Messages</option>
            <option value="keyword">Keyword Match</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Priority (higher = checked first)</label>
          <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" />
        </div>
      </div>

      {form.triggerType === "keyword" && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Keywords (comma separated)</label>
          <input value={form.triggerKeywords} onChange={e => setForm(f => ({ ...f, triggerKeywords: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            placeholder="price, cost, how much" />
        </div>
      )}

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Reply Mode</label>
        <div className="flex gap-2">
          {[{ v: "template", label: "Template" }, { v: "ai", label: "AI Generated" }].map(opt => (
            <button key={opt.v} type="button"
              onClick={() => setForm(f => ({ ...f, replyMode: opt.v }))}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${form.replyMode === opt.v
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-white/[0.03] border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>
              {opt.v === "ai" ? <><Bot className="inline w-3 h-3 mr-1" />{opt.label}</> : opt.label}
            </button>
          ))}
        </div>
      </div>

      {form.replyMode === "template" ? (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Reply Template * <span className="text-primary/70">(use {"{name}"} for sender name)</span></label>
          <textarea required value={form.replyTemplate} onChange={e => setForm(f => ({ ...f, replyTemplate: e.target.value }))}
            rows={3}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
            placeholder="Hi {name}! Thanks for messaging us. We'll get back to you shortly." />
        </div>
      ) : (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">AI Instructions *</label>
          <textarea required value={form.aiInstructions} onChange={e => setForm(f => ({ ...f, aiInstructions: e.target.value }))}
            rows={4}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
            placeholder="You are a customer service representative for [Business Name]. Reply professionally and helpfully. If asked about pricing, say to contact us at [phone]. Keep replies concise and friendly." />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
          {form.isActive
            ? <ToggleRight className="w-8 h-8 text-primary" />
            : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
        </button>
        <span className="text-xs text-muted-foreground">{form.isActive ? "Rule Active" : "Rule Inactive"}</span>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {initial?.id ? "Update Rule" : "Create Rule"}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function FacebookManager() {
  const { user } = useUser();

  const [pages, setPages] = useState<FbPage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<FbMessage[]>([]);
  const [rules, setRules] = useState<FbRule[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [oauthPages, setOauthPages] = useState<OAuthPage[]>([]);

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [connectingPageId, setConnectingPageId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"messages" | "rules" | "webhook">("messages");
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<FbRule | null>(null);
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);
  const [showVerifyToken, setShowVerifyToken] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [pagesRes, statsRes, msgsRes, rulesRes, webhookRes] = await Promise.all([
        api<{ pages: FbPage[] }>("/facebook/pages"),
        api<Stats>("/facebook/stats"),
        api<{ messages: FbMessage[] }>("/facebook/messages"),
        api<{ rules: FbRule[] }>("/facebook/rules"),
        api<WebhookInfo>("/facebook/webhook-info"),
      ]);
      setPages(pagesRes.pages);
      setStats(statsRes);
      setMessages(msgsRes.messages);
      setRules(rulesRes.rules);
      setWebhookInfo(webhookRes);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Check for OAuth callback result */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      /* Load oauth pages from session */
      api<{ pages: OAuthPage[] }>("/facebook/oauth-pages").then(r => {
        if (r.pages.length > 0) {
          setOauthPages(r.pages);
          toast.success("Facebook connected! Choose a page to link.");
        } else {
          loadAll();
        }
      }).catch(() => { });
    } else if (params.get("oauth") === "error") {
      const msg = params.get("msg") ?? "Connection failed";
      window.history.replaceState({}, "", window.location.pathname);
      toast.error(`Facebook error: ${msg}`);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function startOAuth() {
    try {
      const { url } = await api<{ url: string }>("/facebook/auth-url");
      window.location.href = url;
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function connectPage(pageId: string) {
    setConnectingPageId(pageId);
    try {
      const result = await api<{ ok: boolean; pageName: string }>("/facebook/connect-page", {
        method: "POST", body: JSON.stringify({ pageId }),
      });
      toast.success(`✅ "${result.pageName}" connected successfully!`);
      setOauthPages([]);
      await loadAll();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setConnectingPageId(null);
    }
  }

  async function disconnectPage(page: FbPage) {
    if (!confirm(`Disconnect "${page.pageName}"? All rules and history will be deleted.`)) return;
    try {
      await api(`/facebook/pages/${page.id}`, { method: "DELETE" });
      toast.success("Page disconnected");
      await loadAll();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function checkNow() {
    setChecking(true);
    try {
      const r = await api<{ newMessages: number; repliedCount: number }>("/facebook/check-now", { method: "POST", body: "{}" });
      toast.success(`✅ Checked: ${r.newMessages} new message(s), ${r.repliedCount} replied`);
      await loadAll();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setChecking(false);
    }
  }

  async function toggleRule(rule: FbRule) {
    try {
      const updated = (await api<{ rule: FbRule }>(`/facebook/rules/${rule.id}`, {
        method: "PUT", body: JSON.stringify({ isActive: !rule.isActive }),
      })).rule;
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function deleteRule(rule: FbRule) {
    if (!confirm(`Delete rule "${rule.ruleName}"?`)) return;
    try {
      await api(`/facebook/rules/${rule.id}`, { method: "DELETE" });
      setRules(prev => prev.filter(r => r.id !== rule.id));
      toast.success("Rule deleted");
    } catch (err) {
      toast.error(String(err));
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-20 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Facebook className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Facebook Auto-Reply</h1>
              <p className="text-xs text-muted-foreground">Connect your Facebook page and automate replies</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={checkNow} disabled={checking || !pages.length}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Check Now
            </button>
            <button onClick={startOAuth}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-300 hover:bg-blue-500/30 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Connect Page
            </button>
          </div>
        </div>

        {/* OAuth Page Selection Modal */}
        {oauthPages.length > 0 && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <h3 className="text-sm font-medium text-blue-300 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Select which page to connect:
            </h3>
            <div className="grid gap-2">
              {oauthPages.map(p => (
                <button key={p.id} onClick={() => connectPage(p.id)}
                  disabled={connectingPageId === p.id}
                  className="flex items-center justify-between p-3 bg-white/[0.05] border border-white/[0.08] rounded-lg hover:border-blue-500/40 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <Facebook className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">ID: {p.id}</span>
                  </div>
                  {connectingPageId === p.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    : <span className="text-xs text-blue-400">Connect →</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: "Connected Pages", value: stats.connectedPages, icon: <Link2 className="w-4 h-4" />, color: "text-blue-400" },
              { label: "Total Messages", value: stats.totalMessages, icon: <MessageCircle className="w-4 h-4" />, color: "text-purple-400" },
              { label: "AI Replies", value: stats.aiReplies, icon: <Bot className="w-4 h-4" />, color: "text-emerald-400" },
              { label: "Template Replies", value: stats.templateReplies, icon: <Send className="w-4 h-4" />, color: "text-orange-400" },
              { label: "Pending", value: stats.pendingReplies, icon: <Clock className="w-4 h-4" />, color: "text-yellow-400" },
            ].map(s => (
              <div key={s.label} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className={`${s.color} mb-1`}>{s.icon}</div>
                <div className="text-xl font-bold text-foreground">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Connected Pages */}
        {pages.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Connected Pages</h2>
            <div className="grid gap-2">
              {pages.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Facebook className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.pageName}</div>
                      <div className="text-xs text-muted-foreground">
                        ID: {p.pageId} · Connected {new Date(p.connectedAt).toLocaleDateString()}
                        {p.lastCheckedAt && ` · Last checked: ${new Date(p.lastCheckedAt).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${p.isActive ? "bg-emerald-400" : "bg-gray-500"}`} />
                    <button onClick={() => disconnectPage(p)}
                      className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && pages.length === 0 && oauthPages.length === 0 && (
          <div className="text-center py-16 border border-dashed border-white/[0.1] rounded-xl mb-6">
            <Facebook className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-foreground mb-1">No Facebook page connected</h3>
            <p className="text-xs text-muted-foreground mb-4">Connect your Facebook page to start auto-replying to messages</p>
            <button onClick={startOAuth}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm text-blue-300 hover:bg-blue-500/30 transition-colors">
              <Facebook className="w-4 h-4" />
              Connect Facebook Page
            </button>
          </div>
        )}

        {/* Tabs */}
        {pages.length > 0 && (
          <>
            <div className="flex gap-1 mb-4 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl w-fit">
              {[
                { id: "messages", label: "Message History", icon: <MessageCircle className="w-3.5 h-3.5" /> },
                { id: "rules", label: "Auto-Reply Rules", icon: <Settings className="w-3.5 h-3.5" /> },
                { id: "webhook", label: "Webhook Setup", icon: <Zap className="w-3.5 h-3.5" /> },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === tab.id
                    ? "bg-white/[0.1] text-foreground"
                    : "text-muted-foreground hover:text-foreground"}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            {/* Messages Tab */}
            {activeTab === "messages" && (
              <div className="space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    No messages yet. Click "Check Now" to fetch messages from your page.
                  </div>
                ) : messages.map(msg => (
                  <div key={msg.id} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground">{msg.senderName ?? "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">{msg.pageName}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(msg.receivedAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-foreground/80 truncate">{msg.messageText}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {msg.isReplied ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            {msg.replyType === "ai" ? "AI Reply" : "Template"}
                          </span>
                        ) : msg.error ? (
                          <span className="flex items-center gap-1 text-[10px] text-red-400"><XCircle className="w-3 h-3" />Error</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-yellow-400"><Clock className="w-3 h-3" />Pending</span>
                        )}
                        <button onClick={() => setExpandedMsg(expandedMsg === msg.id ? null : msg.id)}
                          className="p-1 text-muted-foreground hover:text-foreground">
                          {expandedMsg === msg.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    {expandedMsg === msg.id && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Incoming Message:</div>
                          <div className="text-xs text-foreground/80 bg-white/[0.03] rounded-lg p-2">{msg.messageText}</div>
                        </div>
                        {msg.replyText && (
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-0.5">
                              Reply sent {msg.repliedAt ? `at ${new Date(msg.repliedAt).toLocaleString()}` : ""}:
                            </div>
                            <div className="text-xs text-emerald-300 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">{msg.replyText}</div>
                          </div>
                        )}
                        {msg.error && (
                          <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg p-2">
                            Error: {msg.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Rules Tab */}
            {activeTab === "rules" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Rules are checked in priority order. First matching rule wins.
                  </p>
                  {!showRuleForm && (
                    <button onClick={() => { setShowRuleForm(true); setEditingRule(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-lg text-xs text-primary hover:bg-primary/30 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Rule
                    </button>
                  )}
                </div>

                {(showRuleForm && !editingRule) && (
                  <RuleForm pages={pages}
                    onSave={rule => { setRules(prev => [rule, ...prev]); setShowRuleForm(false); toast.success("Rule created!"); }}
                    onCancel={() => setShowRuleForm(false)} />
                )}

                {rules.length === 0 && !showRuleForm && (
                  <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-white/[0.1] rounded-xl">
                    No rules yet. Add a rule to start auto-replying.
                  </div>
                )}

                {rules.map(rule => (
                  <div key={rule.id}>
                    {editingRule?.id === rule.id ? (
                      <RuleForm pages={pages} initial={rule}
                        onSave={updated => { setRules(prev => prev.map(r => r.id === rule.id ? updated : r)); setEditingRule(null); toast.success("Rule updated!"); }}
                        onCancel={() => setEditingRule(null)} />
                    ) : (
                      <div className={`p-3 border rounded-xl transition-colors ${rule.isActive ? "bg-white/[0.03] border-white/[0.06]" : "bg-white/[0.01] border-white/[0.04] opacity-60"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground">{rule.ruleName}</span>
                              {rule.replyMode === "ai" && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">AI</span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.08] text-muted-foreground rounded-full">
                                {rule.triggerType === "all" ? "All msgs" : `Keywords: ${rule.triggerKeywords}`}
                              </span>
                              <span className="text-[10px] text-muted-foreground">Priority: {rule.priority}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {rule.replyMode === "template" ? rule.replyTemplate : rule.aiInstructions}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => toggleRule(rule)}
                              className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                              {rule.isActive ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            <button onClick={() => setEditingRule(rule)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors">
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteRule(rule)}
                              className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Webhook Tab */}
            {activeTab === "webhook" && webhookInfo && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-yellow-300 mb-1">Facebook Webhook Setup Required</p>
                      <p className="text-xs text-muted-foreground">
                        To receive real-time messages, configure the webhook in your{" "}
                        <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="text-blue-400 hover:underline">
                          Facebook Developer Console
                        </a>.
                        Go to your App → Messenger → Webhooks.
                      </p>
                    </div>
                  </div>
                </div>

                {[
                  { label: "Callback URL", value: webhookInfo.webhookUrl, copy: true },
                  { label: "Verify Token", value: webhookInfo.verifyToken, copy: true, secret: true },
                  { label: "Subscribed Fields", value: webhookInfo.callbackFields, copy: false },
                ].map(item => (
                  <div key={item.label} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                    <div className="text-xs text-muted-foreground mb-1.5">{item.label}</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-foreground font-mono bg-white/[0.05] rounded px-2 py-1.5 truncate">
                        {item.secret && !showVerifyToken ? "••••••••••••••••••" : item.value}
                      </code>
                      {item.secret && (
                        <button onClick={() => setShowVerifyToken(v => !v)}
                          className="p-1.5 text-muted-foreground hover:text-foreground">
                          {showVerifyToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {item.copy && (
                        <button onClick={() => { navigator.clipboard.writeText(item.value); toast.success("Copied!"); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground">
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                  <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-400" /> Setup Steps
                  </p>
                  <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                    <li>Go to <strong className="text-foreground">developers.facebook.com</strong> → Your App</li>
                    <li>Navigate to <strong className="text-foreground">Messenger → Settings → Webhooks</strong></li>
                    <li>Click <strong className="text-foreground">Add Callback URL</strong> and paste the URL above</li>
                    <li>Enter the <strong className="text-foreground">Verify Token</strong> above and click Verify</li>
                    <li>Subscribe to <strong className="text-foreground">messages</strong> and <strong className="text-foreground">messaging_postbacks</strong></li>
                    <li>Save and your page will start receiving live messages</li>
                  </ol>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Note:</strong> Set <code className="text-primary">FACEBOOK_WEBHOOK_VERIFY_TOKEN</code> env var to customize the verify token.
                    Set <code className="text-primary">FACEBOOK_WEBHOOK_BASE_URL</code> to your custom domain (e.g. <code>https://api.yourdomain.com</code>).
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
