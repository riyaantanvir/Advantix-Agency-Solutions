import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Facebook, Plus, Trash2, CheckCircle2, XCircle, RefreshCw,
  MessageCircle, BarChart2, Settings2, Webhook, Loader2, ExternalLink,
  Zap, Brain, ChevronRight, AlertCircle, LogIn, Copy, Check,
  ToggleLeft, ToggleRight, ArrowLeft, Eye, EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useToolsUser } from "@/context/ToolsUserContext";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";

const API = "/api";
const expo = [0.16, 1, 0.3, 1] as const;

type Tab = "pages" | "rules" | "messages" | "stats" | "webhook";

interface FbPage {
  id: number;
  pageId: string;
  pageName: string;
  isActive: boolean;
  connectedAt: string;
  lastCheckedAt: string | null;
}

interface FbRule {
  id: number;
  facebookPageId: number;
  ruleName: string;
  triggerType: "all" | "keyword" | "ai_decide";
  triggerKeywords: string | null;
  replyMode: "template" | "ai";
  replyTemplate: string | null;
  aiInstructions: string | null;
  priority: number;
  isActive: boolean;
}

interface FbMessage {
  id: number;
  senderName: string | null;
  senderId: string;
  messageText: string;
  receivedAt: string;
  isReplied: boolean;
  replyText: string | null;
  replyType: string | null;
  error: string | null;
}

interface FbStats {
  pages: number;
  totalMessages: number;
  repliedMessages: number;
  failedMessages: number;
  replyRate: number;
  lastActivity: string | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export default function FacebookManager() {
  const { user } = useToolsUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pages");
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const { data: pages = [], isLoading: loadingPages } = useQuery<FbPage[]>({
    queryKey: ["fb-pages"],
    queryFn: () => apiFetch("/facebook/pages").then((r) => r?.pages ?? r ?? []),
    enabled: !!user,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<FbStats>({
    queryKey: ["fb-stats"],
    queryFn: () => apiFetch("/facebook/stats"),
    enabled: !!user && tab === "stats",
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery<FbRule[]>({
    queryKey: ["fb-rules", selectedPageId],
    queryFn: () => apiFetch(`/facebook/rules${selectedPageId ? `?pageId=${selectedPageId}` : ""}`).then((r) => r?.rules ?? r ?? []),
    enabled: !!user && tab === "rules",
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<FbMessage[]>({
    queryKey: ["fb-messages", selectedPageId],
    queryFn: () => apiFetch(`/facebook/messages${selectedPageId ? `?pageId=${selectedPageId}` : ""}`).then((r) => r?.messages ?? r ?? []),
    enabled: !!user && tab === "messages",
  });

  const { data: webhookInfo } = useQuery({
    queryKey: ["fb-webhook-info"],
    queryFn: () => apiFetch("/facebook/webhook-info"),
    enabled: !!user && tab === "webhook",
  });

  const disconnectPage = useMutation({
    mutationFn: (id: number) => apiFetch(`/facebook/pages/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-pages"] }); toast({ title: "Page disconnected" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => apiFetch(`/facebook/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-rules"] }); toast({ title: "Rule deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/facebook/rules/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-rules"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkNow = useMutation({
    mutationFn: () => apiFetch("/facebook/check-now", { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["fb-messages"] });
      qc.invalidateQueries({ queryKey: ["fb-stats"] });
      toast({ title: `Done — ${d.processed ?? 0} new messages processed` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startOAuth = useCallback(() => {
    apiFetch("/facebook/auth-url")
      .then((d) => { window.location.href = d.authUrl; })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }));
  }, [toast]);

  const copyWebhook = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    });
  };

  if (!user) {
    return (
      <div className="pt-28 pb-24 min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 text-center">
          <Facebook className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Facebook Auto-Reply</h1>
          <p className="text-muted-foreground mb-6">Login to manage your Facebook pages and auto-reply rules.</p>
          <Link href="/login">
            <Button><LogIn className="w-4 h-4 mr-2" />Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "pages",   label: "Pages",    icon: Facebook },
    { id: "rules",   label: "Rules",    icon: Zap },
    { id: "messages",label: "Messages", icon: MessageCircle },
    { id: "stats",   label: "Stats",    icon: BarChart2 },
    { id: "webhook", label: "Webhook",  icon: Webhook },
  ];

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <SEO title="Facebook Auto-Reply — Advantix Tools" />
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: expo }}
          className="flex items-center gap-3 mb-8">
          <Link href="/tools/dashboard">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <Facebook className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold leading-tight">Facebook Auto-Reply</h1>
            <p className="text-xs text-muted-foreground">Connect pages · Set rules · Auto-reply comments & DMs</p>
          </div>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => checkNow.mutate()} disabled={checkNow.isPending}>
              {checkNow.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Check Now
            </Button>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.05, ease: expo }}
          className="flex gap-1 bg-card border border-border/40 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                tab === id ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </motion.div>

        {/* ── PAGES TAB ───────────────────────────────────────────────────── */}
        {tab === "pages" && (
          <motion.div key="pages" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: expo }}
            className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Connected Pages ({pages.length})</h2>
              <Button size="sm" onClick={startOAuth} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Connect Page
              </Button>
            </div>

            {loadingPages && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingPages && pages.length === 0 && (
              <Card className="p-8 text-center border-border/40">
                <Facebook className="w-10 h-10 text-blue-400/40 mx-auto mb-3" />
                <p className="font-semibold mb-1">No pages connected</p>
                <p className="text-sm text-muted-foreground mb-4">Connect your Facebook page to start auto-replying.</p>
                <Button onClick={startOAuth} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />Connect Facebook Page
                </Button>
              </Card>
            )}

            {pages.map((page) => (
              <Card key={page.id} className="p-4 border-border/40 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Facebook className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{page.pageName}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.pageId}</p>
                  <p className="text-xs text-muted-foreground">
                    Connected {new Date(page.connectedAt).toLocaleDateString()} ·{" "}
                    {page.lastCheckedAt ? `Last checked ${new Date(page.lastCheckedAt).toLocaleTimeString()}` : "Never checked"}
                  </p>
                </div>
                <Badge variant="outline" className={page.isActive ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}>
                  {page.isActive ? "Active" : "Inactive"}
                </Badge>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                  onClick={() => { if (confirm(`Disconnect "${page.pageName}"?`)) disconnectPage.mutate(page.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </motion.div>
        )}

        {/* ── RULES TAB ───────────────────────────────────────────────────── */}
        {tab === "rules" && (
          <motion.div key="rules" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: expo }}
            className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-semibold">Auto-Reply Rules ({rules.length})</h2>
                <p className="text-xs text-muted-foreground">Rules are checked in priority order (highest first).</p>
              </div>
              <div className="flex items-center gap-2">
                {pages.length > 0 && (
                  <select value={selectedPageId ?? ""} onChange={(e) => setSelectedPageId(e.target.value ? Number(e.target.value) : null)}
                    className="text-xs bg-card border border-border/40 rounded-lg px-2 py-1.5 text-foreground">
                    <option value="">All Pages</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.pageName}</option>)}
                  </select>
                )}
              </div>
            </div>

            {pages.length === 0 && (
              <Card className="p-6 border-border/40 text-center">
                <AlertCircle className="w-8 h-8 text-yellow-400/60 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Connect a Facebook page first to create rules.</p>
              </Card>
            )}

            {loadingRules && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingRules && rules.length === 0 && pages.length > 0 && (
              <Card className="p-6 border-border/40 text-center">
                <Zap className="w-8 h-8 text-yellow-400/40 mx-auto mb-2" />
                <p className="font-semibold mb-1">No rules yet</p>
                <p className="text-sm text-muted-foreground">Rules will be shown here after creation.</p>
              </Card>
            )}

            {rules.map((rule) => (
              <Card key={rule.id} className={cn("p-4 border-border/40", !rule.isActive && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                    rule.replyMode === "ai" ? "bg-violet-500/10" : "bg-yellow-500/10")}>
                    {rule.replyMode === "ai" ? <Brain className="w-4 h-4 text-violet-400" /> : <Zap className="w-4 h-4 text-yellow-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{rule.ruleName}</p>
                      <Badge variant="outline" className="text-xs">{rule.replyMode === "ai" ? "AI Reply" : "Template"}</Badge>
                      <Badge variant="outline" className={cn("text-xs",
                        rule.triggerType === "all" ? "border-blue-500/40 text-blue-400" :
                        rule.triggerType === "keyword" ? "border-orange-500/40 text-orange-400" : "border-violet-500/40 text-violet-400")}>
                        {rule.triggerType === "all" ? "All Messages" : rule.triggerType === "keyword" ? "Keywords" : "AI Decides"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Priority: {rule.priority}</span>
                    </div>
                    {rule.triggerKeywords && (
                      <p className="text-xs text-muted-foreground mt-1">Keywords: {rule.triggerKeywords}</p>
                    )}
                    {rule.replyTemplate && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Reply: {rule.replyTemplate}</p>
                    )}
                    {rule.aiInstructions && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">AI: {rule.aiInstructions}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8"
                      onClick={() => toggleRule.mutate({ id: rule.id, isActive: !rule.isActive })}>
                      {rule.isActive
                        ? <ToggleRight className="w-4 h-4 text-green-400" />
                        : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => { if (confirm(`Delete rule "${rule.ruleName}"?`)) deleteRule.mutate(rule.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {pages.length > 0 && (
              <CreateRuleForm pages={pages} onCreated={() => qc.invalidateQueries({ queryKey: ["fb-rules"] })} />
            )}
          </motion.div>
        )}

        {/* ── MESSAGES TAB ────────────────────────────────────────────────── */}
        {tab === "messages" && (
          <motion.div key="messages" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: expo }}
            className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold">Message History</h2>
              {pages.length > 0 && (
                <select value={selectedPageId ?? ""} onChange={(e) => setSelectedPageId(e.target.value ? Number(e.target.value) : null)}
                  className="text-xs bg-card border border-border/40 rounded-lg px-2 py-1.5 text-foreground">
                  <option value="">All Pages</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.pageName}</option>)}
                </select>
              )}
            </div>

            {loadingMessages && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingMessages && messages.length === 0 && (
              <Card className="p-8 text-center border-border/40">
                <MessageCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-semibold mb-1">No messages yet</p>
                <p className="text-sm text-muted-foreground">Messages will appear here after auto-reply runs.</p>
              </Card>
            )}

            {messages.map((msg) => (
              <Card key={msg.id} className="p-4 border-border/40">
                <div className="flex items-start gap-3">
                  <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0",
                    msg.error ? "bg-red-400" : msg.isReplied ? "bg-green-400" : "bg-yellow-400")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{msg.senderName ?? msg.senderId}</p>
                      <span className="text-xs text-muted-foreground">{new Date(msg.receivedAt).toLocaleString()}</span>
                      {msg.replyType && (
                        <Badge variant="outline" className="text-xs">
                          {msg.replyType === "ai" ? "AI" : "Template"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">{msg.messageText}</p>
                    {msg.replyText && (
                      <div className="mt-2 flex items-start gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-green-300/80">{msg.replyText}</p>
                      </div>
                    )}
                    {msg.error && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />{msg.error}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {msg.error ? <XCircle className="w-4 h-4 text-red-400" /> :
                     msg.isReplied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                     <Loader2 className="w-4 h-4 text-yellow-400" />}
                  </div>
                </div>
              </Card>
            ))}
          </motion.div>
        )}

        {/* ── STATS TAB ───────────────────────────────────────────────────── */}
        {tab === "stats" && (
          <motion.div key="stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: expo }}
            className="space-y-6">
            <h2 className="font-semibold">Statistics</h2>

            {loadingStats && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {stats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Connected Pages", value: stats.pages, color: "text-blue-400", bg: "bg-blue-500/10" },
                    { label: "Total Messages", value: stats.totalMessages, color: "text-foreground", bg: "bg-muted/30" },
                    { label: "Replied", value: stats.repliedMessages, color: "text-green-400", bg: "bg-green-500/10" },
                    { label: "Failed", value: stats.failedMessages, color: "text-red-400", bg: "bg-red-500/10" },
                    { label: "Reply Rate", value: `${stats.replyRate}%`, color: "text-violet-400", bg: "bg-violet-500/10" },
                    { label: "Last Activity", value: stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString() : "—", color: "text-muted-foreground", bg: "bg-muted/30" },
                  ].map(({ label, value, color, bg }) => (
                    <Card key={label} className="p-4 border-border/40">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", bg)}>
                        <BarChart2 className={cn("w-4 h-4", color)} />
                      </div>
                      <p className={cn("text-2xl font-bold font-display", color)}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </Card>
                  ))}
                </div>

                {stats.replyRate < 80 && stats.totalMessages > 0 && (
                  <Card className="p-4 border-yellow-500/30 bg-yellow-500/5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-300">Low reply rate ({stats.replyRate}%)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Check your rules and make sure AI keys are configured properly.</p>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── WEBHOOK TAB ─────────────────────────────────────────────────── */}
        {tab === "webhook" && (
          <motion.div key="webhook" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: expo }}
            className="space-y-6">
            <h2 className="font-semibold">Webhook Configuration</h2>

            <Card className="p-5 border-border/40 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Webhook className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Facebook Webhook URL</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add this URL in your Facebook App's Messenger/Webhooks settings.</p>
                </div>
              </div>

              {webhookInfo ? (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Webhook Callback URL</Label>
                    <div className="flex items-center gap-2">
                      <Input value={webhookInfo.webhookUrl} readOnly className="text-xs font-mono bg-muted/30" />
                      <Button size="icon" variant="outline" onClick={() => copyWebhook(webhookInfo.webhookUrl)} className="shrink-0">
                        {copiedWebhook ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Verify Token</Label>
                    <Input value={webhookInfo.verifyToken} readOnly className="text-xs font-mono bg-muted/30" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Subscribe to these fields</Label>
                    <div className="flex flex-wrap gap-2">
                      {(webhookInfo.subscribeFields ?? ["messages", "messaging_postbacks", "feed"]).map((f: string) => (
                        <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </Card>

            <Card className="p-5 border-border/40 space-y-3">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                Setup Instructions
              </p>
              {[
                "Go to developers.facebook.com and create (or open) your app.",
                "Add the \"Messenger\" or \"Facebook Login\" product.",
                "In Webhooks settings, add the Callback URL above and paste the Verify Token.",
                "Subscribe to: messages, messaging_postbacks, feed.",
                "Connect your Facebook Page using the \"Pages\" tab above.",
                "Create auto-reply rules in the \"Rules\" tab.",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-muted-foreground">{step}</p>
                </div>
              ))}
              <a href="https://developers.facebook.com" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="mt-2">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open Facebook Developers
                </Button>
              </a>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Create Rule Form ──────────────────────────────────────────────────────────
function CreateRuleForm({ pages, onCreated }: { pages: FbPage[]; onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    facebookPageId: pages[0]?.id ?? 0,
    ruleName: "",
    triggerType: "all" as "all" | "keyword" | "ai_decide",
    triggerKeywords: "",
    replyMode: "template" as "template" | "ai",
    replyTemplate: "",
    aiInstructions: "",
    priority: 0,
  });

  const create = useMutation({
    mutationFn: () =>
      fetch("/api/facebook/rules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          facebookPageId: Number(form.facebookPageId),
          priority: Number(form.priority),
          triggerKeywords: form.triggerType === "keyword" ? form.triggerKeywords : null,
          replyTemplate: form.replyMode === "template" ? form.replyTemplate : null,
          aiInstructions: form.replyMode === "ai" ? form.aiInstructions : null,
        }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => {
      toast({ title: "Rule created!" });
      onCreated();
      setOpen(false);
      setForm({ ...form, ruleName: "", triggerKeywords: "", replyTemplate: "", aiInstructions: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-blue-500/40 transition-colors">
        <Plus className="w-4 h-4" />Add New Rule
      </button>
    );
  }

  return (
    <Card className="p-5 border-blue-500/20 bg-blue-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">New Auto-Reply Rule</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1.5 block">Page</Label>
          <select value={form.facebookPageId} onChange={(e) => setForm({ ...form, facebookPageId: Number(e.target.value) })}
            className="w-full text-sm bg-card border border-border/40 rounded-lg px-3 py-2 text-foreground">
            {pages.map((p) => <option key={p.id} value={p.id}>{p.pageName}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Rule Name</Label>
          <Input placeholder="e.g. Greeting Reply" value={form.ruleName}
            onChange={(e) => setForm({ ...form, ruleName: e.target.value })} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1.5 block">Trigger</Label>
          <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value as typeof form.triggerType })}
            className="w-full text-sm bg-card border border-border/40 rounded-lg px-3 py-2 text-foreground">
            <option value="all">All Messages</option>
            <option value="keyword">Keyword Match</option>
            <option value="ai_decide">AI Decides</option>
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block">Reply Mode</Label>
          <select value={form.replyMode} onChange={(e) => setForm({ ...form, replyMode: e.target.value as typeof form.replyMode })}
            className="w-full text-sm bg-card border border-border/40 rounded-lg px-3 py-2 text-foreground">
            <option value="template">Template (fixed text)</option>
            <option value="ai">AI (dynamic)</option>
          </select>
        </div>
      </div>

      {form.triggerType === "keyword" && (
        <div>
          <Label className="text-xs mb-1.5 block">Keywords (comma-separated)</Label>
          <Input placeholder="hello, hi, help" value={form.triggerKeywords}
            onChange={(e) => setForm({ ...form, triggerKeywords: e.target.value })} />
        </div>
      )}

      {form.replyMode === "template" && (
        <div>
          <Label className="text-xs mb-1.5 block">Reply Template</Label>
          <Textarea placeholder="Thank you for your message! We'll get back to you soon." rows={3}
            value={form.replyTemplate} onChange={(e) => setForm({ ...form, replyTemplate: e.target.value })} />
        </div>
      )}

      {form.replyMode === "ai" && (
        <div>
          <Label className="text-xs mb-1.5 block">AI Instructions</Label>
          <Textarea placeholder="You are a helpful assistant for [Business]. Reply politely and professionally..." rows={3}
            value={form.aiInstructions} onChange={(e) => setForm({ ...form, aiInstructions: e.target.value })} />
        </div>
      )}

      <div>
        <Label className="text-xs mb-1.5 block">Priority (higher = runs first)</Label>
        <Input type="number" min={0} max={100} value={form.priority}
          onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="w-32" />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending || !form.ruleName}>
          {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Create Rule
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}
