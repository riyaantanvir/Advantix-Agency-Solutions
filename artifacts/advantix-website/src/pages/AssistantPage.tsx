import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Wifi, WifiOff, Key, RefreshCw, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Send, Loader2, CheckCircle2, XCircle,
  FolderOpen, FileText, Edit3, Monitor, Zap, AlertTriangle, Info,
  Bot, User, Settings, X, Shield, Clock, Calendar, MessageSquare,
  Wrench, BarChart3, Activity, Sparkles, ChevronLeft, PenSquare, Menu,
  Paperclip, Link, List,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToolsUser } from "@/context/ToolsUserContext";
import { useLocation } from "wouter";

type UsageStats = {
  messagesSent: number;
  aiResponses: number;
  toolCalls: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  monthCostUsd: number;
};

/* ── Types ──────────────────────────────────────────────────────────────── */

type AgentInfo = {
  os: string; platform: string; arch: string; hostname: string;
  username: string; shell: string; cwd: string; nodeVersion: string; hasVscode: boolean;
};

type ToolStartEvent  = { type: "tool_start"; id: string; tool: string; input: Record<string, unknown> };
type ToolDoneEvent   = { type: "tool_done"; id: string; tool: string; stdout: string; stderr: string; exitCode: number };
type ContentEvent    = { type: "content"; delta: string };
type DoneEvent       = { type: "done"; totalTokens: number };
type ConvIdEvent     = { type: "conversation_id"; conversationId: number };
type ErrorEvent      = { type: "error"; message: string };

type StreamEvent = ToolStartEvent | ToolDoneEvent | ContentEvent | DoneEvent | ConvIdEvent | ErrorEvent;

type Conversation = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: string;
};

type ToolExecution = {
  id: string; tool: string; input: Record<string, unknown>;
  status: "running" | "done" | "error";
  stdout?: string; stderr?: string; exitCode?: number;
};

type AttachedFile = {
  id: string;
  name: string;
  mimeType: string;
  type: "image" | "text";
  data: string;      /* base64 for images, raw text for text files */
  preview?: string;  /* data-url for images only */
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolExecution[];
  streaming?: boolean;
  statusText?: string;
  error?: string;
  attachments?: AttachedFile[];
};

type KeyInfo = {
  exists: boolean;
  preview?: string;
  createdAt?: string;
  lastConnectedAt?: string | null;
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function genId() { return Math.random().toString(36).slice(2); }

function getToolStatus(tool: string, input: Record<string, unknown>): string {
  if (tool === "run_command") return `$ ${String(input.command ?? "").slice(0, 60)}`;
  if (tool === "read_file")   return `Reading ${String(input.path ?? "")}`;
  if (tool === "write_file")  return `Writing ${String(input.path ?? "")}`;
  if (tool === "list_directory") return `Listing ${String(input.path ?? ".")}`;
  if (tool === "open_vscode")       return `Opening VS Code`;
  if (tool === "get_cwd")           return `Getting system info`;
  if (tool === "create_short_link") return `Shortening ${String(input.url ?? "").slice(0, 50)}`;
  if (tool === "list_short_links")  return `Loading short links…`;
  if (tool === "get_smm_stats")     return `Fetching social media stats…`;
  if (tool === "get_smm_posts")     return `Loading posts…`;
  return tool;
}

const TOOL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  run_command:       { icon: Terminal,  label: "Run Command",    color: "text-green-400" },
  read_file:         { icon: FileText,  label: "Read File",      color: "text-blue-400" },
  write_file:        { icon: Edit3,     label: "Write File",     color: "text-amber-400" },
  list_directory:    { icon: FolderOpen,label: "List Directory", color: "text-cyan-400" },
  open_vscode:       { icon: Monitor,   label: "Open VS Code",   color: "text-purple-400" },
  get_cwd:           { icon: Info,      label: "Get System Info",color: "text-slate-400" },
  create_short_link: { icon: Link,      label: "Create Short Link",   color: "text-pink-400" },
  list_short_links:  { icon: List,      label: "List Short Links",    color: "text-pink-300" },
  get_smm_stats:     { icon: BarChart3, label: "SMM Stats",           color: "text-violet-400" },
  get_smm_posts:     { icon: MessageSquare, label: "SMM Posts",       color: "text-violet-300" },
};

function ToolCard({ tool }: { tool: ToolExecution }) {
  const [open, setOpen] = useState(tool.status === "running");
  const meta = TOOL_META[tool.tool] ?? { icon: Terminal, label: tool.tool, color: "text-slate-400" };
  const Icon = meta.icon;
  const isRunning = tool.status === "running";
  const isError = tool.status === "error" || (tool.exitCode !== undefined && tool.exitCode !== 0);
  const isDone = !isRunning && !isError;

  const getCommandDisplay = () => {
    if (tool.tool === "run_command" && tool.input.command) return `$ ${tool.input.command}`;
    if (tool.tool === "read_file" && tool.input.path) return String(tool.input.path);
    if (tool.tool === "write_file" && tool.input.path) return `→ ${tool.input.path}`;
    if (tool.tool === "list_directory") return String(tool.input.path ?? ".");
    if (tool.tool === "open_vscode") return String(tool.input.path ?? ".");
    return JSON.stringify(tool.input).slice(0, 80);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border overflow-hidden text-xs font-mono transition-all ${
        isRunning ? "border-amber-500/40 bg-gradient-to-r from-amber-500/5 to-transparent"
        : isDone   ? "border-green-500/25 bg-gradient-to-r from-green-500/5 to-transparent"
        : "border-red-500/25 bg-gradient-to-r from-red-500/5 to-transparent"
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
          isRunning ? "bg-amber-500/15" : isDone ? "bg-green-500/15" : "bg-red-500/15"
        }`}>
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
        </div>
        <span className={`font-semibold text-[11px] uppercase tracking-wide shrink-0 ${meta.color}`}>{meta.label}</span>
        <span className="text-muted-foreground/70 truncate flex-1 text-[11px]">{getCommandDisplay()}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isRunning && (
            <span className="flex items-center gap-1 text-amber-400 text-[10px] font-medium">
              <Loader2 className="w-3 h-3 animate-spin" /> running
            </span>
          )}
          {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
          {isError && <XCircle className="w-3.5 h-3.5 text-red-400" />}
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
        </div>
      </button>
      <AnimatePresence>
        {open && (tool.stdout || tool.stderr) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-white/5">
              {tool.stdout && (
                <pre className="mt-2.5 text-foreground/75 whitespace-pre-wrap break-all max-h-52 overflow-y-auto text-[11px] leading-relaxed scrollbar-thin">{tool.stdout}</pre>
              )}
              {tool.stderr && (
                <pre className="text-red-400/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto text-[11px] leading-relaxed"><span className="text-red-500 font-semibold">stderr: </span>{tool.stderr}</pre>
              )}
              {tool.exitCode !== undefined && tool.exitCode !== 0 && (
                <p className="text-red-400 text-[10px] font-semibold pt-0.5">exit code {tool.exitCode}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const mdComponents = {
  p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }: React.HTMLAttributes<HTMLUListElement>) => <ul className="mb-2 space-y-1 pl-5 list-disc marker:text-primary/50">{children}</ul>,
  ol: ({ children }: React.HTMLAttributes<HTMLOListElement>) => <ol className="mb-2 space-y-1 pl-5 list-decimal marker:text-muted-foreground">{children}</ol>,
  li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: React.HTMLAttributes<HTMLElement>) => <em className="italic opacity-90">{children}</em>,
  code: ({ children, className }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = className?.includes("language-");
    if (isBlock) return (
      <pre className="my-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 overflow-x-auto text-[11px] text-green-300 font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    );
    return <code className="px-1.5 py-0.5 rounded bg-black/30 text-green-300 text-[12px] font-mono border border-white/10">{children}</code>;
  },
  h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-base font-bold text-foreground mt-2 mb-1">{children}</h1>,
  h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-sm font-bold text-foreground mt-2 mb-1">{children}</h2>,
  h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-sm font-semibold text-foreground mt-1.5 mb-0.5">{children}</h3>,
  a: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary/90 underline underline-offset-2 hover:text-primary transition-colors">{children}</a>,
  blockquote: ({ children }: React.HTMLAttributes<HTMLQuoteElement>) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  hr: () => <hr className="border-border/30 my-2" />,
};

function MessageBubble({ msg, userName }: { msg: Message; userName?: string }) {
  const isUser = msg.role === "user";
  const initial = (userName ?? "U")[0].toUpperCase();
  const isThinking = msg.streaming && !msg.content && (!msg.tools || msg.tools.every(t => t.status !== "running"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 group ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center shrink-0 mt-1 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        {/* Tool cards */}
        {msg.tools && msg.tools.length > 0 && (
          <div className="w-full space-y-1.5 min-w-64">
            {msg.tools.map(t => <ToolCard key={t.id} tool={t} />)}
          </div>
        )}

        {/* Image attachments */}
        {isUser && msg.attachments && msg.attachments.filter(a => a.type === "image").length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            {msg.attachments.filter(a => a.type === "image").map(a => (
              <img key={a.id} src={a.preview} alt={a.name}
                className="max-w-[200px] max-h-[150px] rounded-xl object-cover border border-white/10 shadow-md" />
            ))}
          </div>
        )}
        {/* Text file attachments */}
        {isUser && msg.attachments && msg.attachments.filter(a => a.type === "text").length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {msg.attachments.filter(a => a.type === "text").map(a => (
              <span key={a.id} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-primary/15 border border-primary/25 text-primary-foreground/80">
                <FileText className="w-3 h-3" />
                {a.name}
              </span>
            ))}
          </div>
        )}

        {/* Message bubble */}
        {(msg.content || msg.streaming) && (
          <div className={`relative text-sm leading-relaxed ${
            isUser
              ? "px-4 py-3 bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-md shadow-primary/10"
              : "px-4 py-3 bg-card border border-border/40 text-foreground rounded-2xl rounded-bl-md shadow-sm"
          }`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            ) : msg.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {msg.content}
              </ReactMarkdown>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="flex gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                {msg.statusText
                  ? <span className="font-mono text-foreground/70 truncate max-w-xs">{msg.statusText}</span>
                  : <span>Thinking…</span>
                }
              </span>
            )}
            {msg.streaming && msg.content && (
              <span className="inline-block w-0.5 h-[1em] bg-current align-middle ml-0.5 animate-pulse rounded-full" />
            )}
          </div>
        )}

        {/* Error */}
        {msg.error && (
          <div className="px-4 py-3 rounded-2xl rounded-bl-md text-sm bg-red-500/8 text-red-400 border border-red-500/20 flex items-start gap-2.5 max-w-full">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed break-words">{msg.error}</span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-secondary/60 border border-border/50 flex items-center justify-center shrink-0 mt-1 text-xs font-bold text-foreground shadow-sm">
          {initial}
        </div>
      )}
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Settings Modal                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function SettingsModal({
  open,
  onClose,
  keyInfo,
  onRegenerate,
  user,
}: {
  open: boolean;
  onClose: () => void;
  keyInfo: KeyInfo | null;
  onRegenerate: () => Promise<{ key: string; preview: string }>;
  user: { name?: string; email?: string } | null;
}) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatsLoading(true);
    fetch("/api/tools/assistant/stats", { credentials: "include" })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [open]);

  const serverBase = window.location.origin;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const result = await onRegenerate();
      setNewKey(result.key);
      setPreview(result.preview);
      setRevokeConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    await fetch("/api/tools/assistant/key", { method: "DELETE", credentials: "include" });
    setNewKey(null);
    setPreview(null);
    setRevokeConfirm(false);
    onClose();
  };

  const downloadAgent = () => {
    const a = document.createElement("a");
    a.href = "/api/tools/assistant/agent.mjs";
    a.download = "agent.mjs";
    a.click();
  };

  const isWindows = navigator.userAgent.toLowerCase().includes("win");
  const [osTab, setOsTab] = useState<"mac" | "windows">(isWindows ? "windows" : "mac");

  const runCmdMac = newKey
    ? `curl -s "${serverBase}/api/tools/assistant/agent.mjs" -o /tmp/agent.mjs && node /tmp/agent.mjs --key ${newKey} --server ${serverBase}`
    : null;
  const runCmdWin = newKey
    ? `curl -s "${serverBase}/api/tools/assistant/agent.mjs" -o "%TEMP%\\agent.mjs" && node "%TEMP%\\agent.mjs" --key ${newKey} --server ${serverBase}`
    : null;
  const runCmd = osTab === "windows" ? runCmdWin : runCmdMac;
  const hasKey = !!(keyInfo?.exists || newKey);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold text-foreground text-base">Agent Settings</h2>
              <p className="text-xs text-muted-foreground">Manage your API key and agent connection</p>
            </div>
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

            {/* ── User profile ── */}
            {user && (
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-lg font-bold text-primary">
                  {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{user.name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="ml-auto shrink-0">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-semibold">Active</span>
                </div>
              </div>
            )}

            {/* ── Usage stats ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Usage
              </h3>
              {statsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading stats...
                </div>
              ) : stats ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: MessageSquare, label: "Messages",   value: stats.messagesSent, color: "text-blue-400",   bg: "bg-blue-500/10" },
                      { icon: Bot,           label: "Responses",  value: stats.aiResponses,  color: "text-violet-400", bg: "bg-violet-500/10" },
                      { icon: Wrench,        label: "Tool Calls", value: stats.toolCalls,    color: "text-green-400",  bg: "bg-green-500/10" },
                    ].map(({ icon: Icon, label, value, color, bg }) => (
                      <div key={label} className={`rounded-xl border border-border/30 ${bg} p-3 text-center`}>
                        <Icon className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
                        <p className={`text-xl font-bold font-display ${color}`}>{value.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                  {stats.totalTokens > 0 && (
                    <div className="rounded-xl border border-border/30 bg-amber-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" /> Total tokens used
                        </span>
                        <span className="font-bold font-display text-amber-400">{stats.totalTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Estimated cost (all time)</span>
                        <span className="font-semibold text-foreground">${stats.totalCostUsd.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">This month</span>
                        <span className="font-semibold text-foreground">${stats.monthCostUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No usage data yet.</p>
              )}
              {stats?.lastMessageAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Last active {new Date(stats.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {stats.firstMessageAt && stats.firstMessageAt !== stats.lastMessageAt && (
                    <> · First chat {new Date(stats.firstMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>
                  )}
                </p>
              )}
            </div>

            {/* ── New key revealed ── */}
            {newKey && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-sm font-semibold text-amber-400">Save this key now — it won't be shown again!</p>
                </div>
                <div className="bg-black/40 rounded-lg p-3 border border-amber-500/20 flex items-start gap-3">
                  <code className="text-sm text-amber-300 font-mono break-all flex-1 leading-relaxed">{newKey}</code>
                  <button
                    onClick={() => copyText(newKey, "newkey")}
                    className="shrink-0 text-amber-400 hover:text-amber-300 transition-colors mt-0.5"
                  >
                    {copied === "newkey" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Ready-to-use command:</p>
                    <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5">
                      {(["mac", "windows"] as const).map(tab => (
                        <button key={tab} onClick={() => setOsTab(tab)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${osTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                          {tab === "mac" ? "Mac/Linux" : "Windows"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-black/50 rounded-lg px-3 py-2.5 border border-border/30 flex items-center gap-2">
                    <code className="text-xs text-green-400 font-mono flex-1 break-all">{runCmd}</code>
                    <button onClick={() => copyText(runCmd, "cmd")} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                      {copied === "cmd" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Current key info ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" /> API Key
              </h3>

              {(keyInfo?.exists || preview) ? (
                <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-foreground font-semibold">{preview ?? keyInfo?.preview}</p>
                      <p className="text-xs text-muted-foreground">Key stored securely (hash only)</p>
                    </div>
                  </div>
                  {keyInfo?.createdAt && (
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1 border-t border-border/30">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Created {new Date(keyInfo.createdAt).toLocaleDateString()}
                      </span>
                      {keyInfo.lastConnectedAt && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Last connected {new Date(keyInfo.lastConnectedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/40 p-4 text-center text-sm text-muted-foreground">
                  No API key yet. Generate one below.
                </div>
              )}

              {/* Regenerate */}
              <button
                onClick={handleRegenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {keyInfo?.exists || preview ? "Regenerate API Key" : "Generate API Key"}
              </button>
              {(keyInfo?.exists || preview) && (
                <p className="text-xs text-muted-foreground text-center">
                  Regenerating will invalidate your current key — the agent will disconnect and need to be restarted with the new key.
                </p>
              )}
            </div>

            {/* ── Download agent ── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" /> Agent Script
              </h3>
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Download the agent script, then open a terminal and run it from the folder you saved it to. Requires Node.js v22+.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={downloadAgent}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border/50 text-foreground rounded-lg text-sm font-semibold hover:bg-secondary/80 transition-colors"
                  >
                    <Download className="w-4 h-4 text-primary" /> Download agent.mjs
                  </button>
                </div>

                {/* Step-by-step run instructions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Run command</p>
                    <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5">
                      {(["mac", "windows"] as const).map(tab => (
                        <button key={tab} onClick={() => setOsTab(tab)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${osTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                          {tab === "mac" ? "Mac/Linux" : "Windows"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {runCmd ? (
                    <div className="bg-black/60 rounded-lg p-3 border border-border/30 space-y-2">
                      <p className="text-[10px] text-muted-foreground">
                        {osTab === "windows" ? "Open Command Prompt (cmd) and paste:" : "Open your terminal and paste:"}
                      </p>
                      <div className="flex items-start gap-2">
                        <code className="text-xs text-green-400 font-mono break-all flex-1">{runCmd}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(runCmd); setCopied("runcmd"); setTimeout(() => setCopied(null), 1500); }}
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy command"
                        >
                          {copied === "runcmd" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info className="w-3 h-3 shrink-0" /> This downloads the agent automatically and runs it — no need to find the file yourself.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-300">
                          {hasKey ? "Click \"Regenerate API Key\" to reveal your run command" : "Generate an API key first"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {hasKey
                            ? "For security, your full API key is only shown once — right after it is generated. Regenerate to get a new key and see the ready-to-run command here."
                            : "You don't have an API key yet. Click \"Generate API Key\" above and the full run command will appear here automatically."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Revoke ── */}
            <div className="space-y-2 pt-2 border-t border-border/30">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Danger Zone
              </h3>
              {!revokeConfirm ? (
                <button
                  onClick={() => setRevokeConfirm(true)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Revoke and delete API key
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-red-400 flex-1">Are you sure? The agent will stop working.</p>
                  <button onClick={handleRevoke} className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors">Delete</button>
                  <button onClick={() => setRevokeConfirm(false)} className="text-xs px-3 py-1.5 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main page                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function AssistantPage() {
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();

  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [agentStatus, setAgentStatus] = useState<{ connected: boolean; info: AgentInfo | null }>({ connected: false, info: null });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newKeyForSidebar, setNewKeyForSidebar] = useState<string | null>(null);

  /* ── Conversations ──────────────────────────────────────────────────────── */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deletingConvId, setDeletingConvId] = useState<number | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const serverBase = window.location.origin;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/tools/assistant/key", { credentials: "include" })
      .then(r => r.json()).then(setKeyInfo).catch(() => {});
  }, []);

  /* ── Shared history parser ──────────────────────────────────────────────── */
  const parseHistoryRows = useCallback((rows: unknown[]): Message[] => {
    type DBRow = { role: string; content: string; tool_name: string | null; tool_input: string | null; tool_result: string | null };
    type Block = { type: string; id?: string; text?: string; name?: string; input?: Record<string, unknown> };
    const toolResults = new Map<string, DBRow>();
    for (const r of rows as DBRow[]) {
      if (r.role === "tool" && r.tool_name) toolResults.set(r.tool_name, r);
    }
    const loaded: Message[] = [];
    for (const r of rows as DBRow[]) {
      if (r.role === "user") { loaded.push({ id: genId(), role: "user", content: r.content }); continue; }
      if (r.role === "assistant") {
        let textContent = r.content;
        let tools: ToolExecution[] = [];
        if (typeof r.content === "string" && r.content.startsWith("[")) {
          try {
            const blocks: Block[] = JSON.parse(r.content);
            textContent = blocks.filter(b => b.type === "text").map(b => b.text ?? "").join("\n").trim();
            tools = blocks.filter(b => b.type === "tool_use" && b.id).map(b => {
              const resultRow = toolResults.get(b.id!);
              return { id: b.id!, tool: b.name ?? "unknown", input: (b.input ?? {}) as Record<string, unknown>,
                status: resultRow ? "done" : "error", stdout: resultRow?.tool_result ?? undefined, exitCode: resultRow ? 0 : 1 } as ToolExecution;
            });
          } catch { /* plain text fallback */ }
        }
        if (!textContent && tools.length === 0) continue;
        loaded.push({ id: genId(), role: "assistant", content: textContent, tools });
      }
    }
    return loaded;
  }, []);

  /* ── Fetch conversations list ───────────────────────────────────────────── */
  const fetchConversations = useCallback(() => {
    fetch("/api/tools/assistant/conversations", { credentials: "include" })
      .then(r => r.json())
      .then(d => setConversations(d.conversations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  /* ── Load history for a specific conversation ───────────────────────────── */
  const loadConversationHistory = useCallback((convId: number | null) => {
    const url = convId
      ? `/api/tools/assistant/history?conversationId=${convId}`
      : "/api/tools/assistant/history";
    fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then(({ messages: rows }) => {
        setMessages(rows?.length ? parseHistoryRows(rows) : []);
        setHistoryLoaded(true);
      }).catch(() => { setHistoryLoaded(true); });
  }, [parseHistoryRows]);

  /* Initial load — no conversation selected yet, start fresh */
  useEffect(() => {
    if (historyLoaded) return;
    setHistoryLoaded(true); /* start with empty, user picks a conversation */
  }, [historyLoaded]);

  /* ── Start a new chat ───────────────────────────────────────────────────── */
  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setInput("");
    inputRef.current?.focus();
  }, []);

  /* ── Switch to a conversation ───────────────────────────────────────────── */
  const openConversation = useCallback((conv: Conversation) => {
    setConversationId(conv.id);
    setMessages([]);
    loadConversationHistory(conv.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [loadConversationHistory]);

  /* ── Delete a conversation ──────────────────────────────────────────────── */
  const deleteConversation = useCallback(async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingConvId(convId);
    await fetch(`/api/tools/assistant/conversations/${convId}`, { method: "DELETE", credentials: "include" });
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (conversationId === convId) { setMessages([]); setConversationId(null); }
    setDeletingConvId(null);
  }, [conversationId]);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/tools/assistant/status", { credentials: "include" });
        const data = await r.json();
        setAgentStatus(data);
        if (data.connected) setShowSetup(false);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  const handleRegenerate = async (): Promise<{ key: string; preview: string }> => {
    const r = await fetch("/api/tools/assistant/key", { method: "POST", credentials: "include" });
    const data = await r.json();
    setNewKeyForSidebar(data.key);
    setKeyInfo({ exists: true, preview: data.preview, createdAt: new Date().toISOString() });
    return data;
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const downloadAgent = () => {
    const a = document.createElement("a");
    a.href = "/api/tools/assistant/agent.mjs";
    a.download = "agent.mjs";
    a.click();
  };

  const clearHistory = async () => {
    if (conversationId) {
      await fetch(`/api/tools/assistant/conversations/${conversationId}`, { method: "DELETE", credentials: "include" });
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      setConversationId(null);
    }
    setMessages([]);
  };

  const MAX_FILES = 5;
  const MAX_SIZE  = 5 * 1024 * 1024; /* 5 MB */
  const ALLOWED_IMAGE = ["image/jpeg","image/png","image/gif","image/webp"];
  const ALLOWED_TEXT  = ["text/plain","application/json","text/markdown","text/csv",
                         "text/javascript","text/typescript","text/html","text/css",
                         "application/javascript","application/typescript"];

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      if (attachedFiles.length >= MAX_FILES) break;
      if (file.size > MAX_SIZE) continue;
      const isImage = ALLOWED_IMAGE.includes(file.type);
      const isText  = ALLOWED_TEXT.includes(file.type) || file.name.match(/\.(txt|md|json|csv|js|ts|py|html|css|sh|yaml|yml|env|log|xml|sql)$/i);
      if (!isImage && !isText) continue;

      const reader = new FileReader();
      if (isImage) {
        reader.onload = e => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.split(",")[1];
          setAttachedFiles(prev => prev.length < MAX_FILES ? [...prev, {
            id: genId(), name: file.name, mimeType: file.type, type: "image", data: base64, preview: dataUrl,
          }] : prev);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = e => {
          const text = e.target?.result as string;
          setAttachedFiles(prev => prev.length < MAX_FILES ? [...prev, {
            id: genId(), name: file.name, mimeType: file.type || "text/plain", type: "text", data: text,
          }] : prev);
        };
        reader.readAsText(file);
      }
    }
  }, [attachedFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData.files;
    if (files.length > 0) handleFiles(files);
  }, [handleFiles]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || sending) return;
    setInput("");
    setSending(true);

    const currentAttachments = [...attachedFiles];
    setAttachedFiles([]);

    const userMsg: Message = { id: genId(), role: "user", content: text, attachments: currentAttachments };
    const assistantId = genId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", tools: [], streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    let currentConvId = conversationId;

    try {
      const res = await fetch("/api/tools/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          conversationId: currentConvId,
          attachments: currentAttachments.map(({ id: _id, preview: _p, ...rest }) => rest),
        }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: StreamEvent = JSON.parse(line.slice(6));
            if (event.type === "conversation_id") {
              currentConvId = event.conversationId;
              setConversationId(event.conversationId);
              fetchConversations();
            } else if (event.type === "tool_start") {
              const status = getToolStatus(event.tool, event.input);
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, statusText: status, tools: [...(m.tools ?? []), { id: event.id, tool: event.tool, input: event.input, status: "running" }] }
                : m));
            } else if (event.type === "tool_done") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, statusText: undefined, tools: (m.tools ?? []).map(t => t.id === event.id
                    ? { ...t, status: (event.exitCode === 0 ? "done" : "error") as "done" | "error", stdout: event.stdout, stderr: event.stderr, exitCode: event.exitCode }
                    : t) }
                : m));
            } else if (event.type === "content") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, statusText: undefined, content: m.content + event.delta }
                : m));
            } else if (event.type === "done") {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false, statusText: undefined } : m));
              fetchConversations();
            } else if (event.type === "error") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, streaming: false, statusText: undefined, error: event.message }
                : m));
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, streaming: false, error: (err as Error).message }
        : m));
    }

    setSending(false);
    inputRef.current?.focus();
  }, [input, sending, conversationId, fetchConversations]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  /* ── Relative time helper ─────────────────────────────────────────────────── */
  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  return (
    <div className="flex h-screen bg-background pt-16">

      {/* ── Conversation Sidebar ────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full border-r border-border/30 bg-background/60 backdrop-blur-sm flex flex-col overflow-hidden shrink-0"
          >
            {/* Sidebar header */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-border/20 shrink-0">
              <MessageSquare className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground flex-1">Conversations</span>
              <button
                onClick={newChat}
                title="New chat"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <PenSquare className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto py-1">
              {conversations.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground/60">
                  No conversations yet.<br />Start chatting to create one.
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-3 py-2.5 group flex items-start gap-2 transition-colors rounded-md mx-1 ${
                      conversationId === conv.id
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate leading-tight">{conv.title || "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">{relativeTime(conv.updated_at)}</div>
                    </div>
                    <button
                      onClick={e => deleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400"
                      title="Delete"
                    >
                      {deletingConvId === conv.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  </button>
                ))
              )}
            </div>

            {/* New Chat CTA */}
            <div className="p-2 border-t border-border/20 shrink-0">
              <button
                onClick={newChat}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-border/30 transition-colors"
              >
                <PenSquare className="w-3.5 h-3.5" />
                New Chat
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/30 bg-background/80 backdrop-blur-sm shrink-0">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          title="Toggle sidebar"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-foreground text-sm">Advantix Assistant</span>
          <span className="text-[10px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-md border border-primary/15 font-semibold tracking-wide">BETA</span>
        </div>

        <div className="flex-1" />

        {/* Connection pill */}
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
          agentStatus.connected
            ? "bg-green-500/8 text-green-400 border-green-500/15"
            : "bg-border/30 text-muted-foreground border-border/30"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${agentStatus.connected ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
          {agentStatus.connected ? agentStatus.info?.hostname ?? "Connected" : "Not connected"}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={clearHistory} title="Clear / delete conversation" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Not-connected banner ─────────────────────────────────────────── */}
        {!agentStatus.connected && (
          <div className="shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-amber-500/5 border-b border-amber-500/10 text-xs text-amber-400/80">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Agent not connected —{" "}
              <button onClick={() => setShowSettings(true)} className="underline underline-offset-2 hover:text-amber-300 font-medium transition-colors">
                Open Settings
              </button>{" "}
              to get your run command.
            </span>
          </div>
        )}

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-6 pb-4">
                {/* Avatar + status */}
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${agentStatus.connected ? "bg-green-500" : "bg-muted"}`} />
                </div>

                {/* Greeting */}
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-foreground text-lg">
                    {user?.name ? `Hi, ${user.name.split(" ")[0]}` : "Advantix Assistant"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                    {agentStatus.connected
                      ? `Connected to ${agentStatus.info?.hostname}. Ask me anything — I can work directly on your machine.`
                      : "Connect your local agent to let me work directly on your computer."}
                  </p>
                </div>

                {!keyInfo?.exists && (
                  <button onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all">
                    <Key className="w-3.5 h-3.5" /> Get started
                  </button>
                )}

                {/* ── What you can do ── */}
                <div className="w-full max-w-xl text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center mb-3">What you can do with the agent</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        icon: Terminal,
                        title: "Run any command",
                        desc: "Execute shell commands — npm, git, python, ffmpeg, anything in your terminal.",
                        examples: ["npm install & run dev server", "git pull & show status"],
                      },
                      {
                        icon: FileText,
                        title: "Read & write files",
                        desc: "Open, read, edit, or create any file on your machine — code, configs, logs.",
                        examples: ["Fix a bug and save the file", "Read error logs and explain"],
                      },
                      {
                        icon: FolderOpen,
                        title: "Browse your filesystem",
                        desc: "Explore directories, find files, check folder contents anywhere on your Mac.",
                        examples: ["List files in Downloads", "Find all .env files in project"],
                      },
                      {
                        icon: Sparkles,
                        title: "Write & run code",
                        desc: "Generate scripts in any language, save them, and run them right away.",
                        examples: ["Write a Python scraper and run it", "Create a bash script"],
                      },
                    ].map(({ icon: Icon, title, desc, examples }) => (
                      <div key={title} className="flex gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10 hover:bg-secondary/20 transition-colors text-left">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground mb-0.5">{title}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mb-1.5">{desc}</p>
                          <div className="flex flex-col gap-0.5">
                            {examples.map(ex => (
                              <button key={ex} onClick={() => { setInput(ex); inputRef.current?.focus(); }}
                                className="text-left text-[11px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors group">
                                <span className="opacity-50 group-hover:opacity-100">→</span> {ex}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} userName={user?.name ?? user?.email} />)}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/20 bg-background/80 backdrop-blur-sm px-4 pb-4 pt-3">
          <div className="max-w-3xl mx-auto">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv,.js,.ts,.py,.html,.css,.sh,.yaml,.yml,.log,.xml,.sql"
              className="hidden"
              onChange={e => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ""; } }}
            />

            {/* Attachment preview strip */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {attachedFiles.map(f => (
                  <div key={f.id} className="relative group flex items-center gap-1.5">
                    {f.type === "image" ? (
                      <div className="relative">
                        <img src={f.preview} alt={f.name}
                          className="w-14 h-14 rounded-lg object-cover border border-border/40 shadow-sm" />
                        <button
                          onClick={() => setAttachedFiles(prev => prev.filter(x => x.id !== f.id))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        ><X className="w-2.5 h-2.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border/40 text-xs max-w-[140px]">
                        <FileText className="w-3 h-3 text-primary/60 shrink-0" />
                        <span className="truncate text-muted-foreground">{f.name}</span>
                        <button
                          onClick={() => setAttachedFiles(prev => prev.filter(x => x.id !== f.id))}
                          className="shrink-0 hover:text-foreground transition-colors"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Live agent status bar ─────────────────────────────────────────── */}
            <AnimatePresence>
              {sending && (() => {
                const streamingMsg = messages.slice().reverse().find(m => m.role === "assistant" && m.streaming);
                const runningTool = streamingMsg?.tools?.find(t => t.status === "running");
                const toolMeta = runningTool ? (TOOL_META[runningTool.tool] ?? { icon: Terminal, label: runningTool.tool, color: "text-slate-400" }) : null;
                const ToolIcon = toolMeta?.icon;
                const cmd = runningTool
                  ? (runningTool.tool === "run_command" ? `$ ${String(runningTool.input.command ?? "")}` :
                     runningTool.tool === "read_file"   ? `Reading ${String(runningTool.input.path ?? "")}` :
                     runningTool.tool === "write_file"  ? `Writing ${String(runningTool.input.path ?? "")}` :
                     runningTool.tool === "list_directory" ? `Listing ${String(runningTool.input.path ?? ".")}` :
                     runningTool.tool === "open_vscode" ? `Opening VS Code` :
                     runningTool.tool === "get_cwd"    ? `Getting current directory` :
                     toolMeta?.label ?? runningTool.tool)
                  : streamingMsg ? "Thinking…" : null;
                if (!cmd) return null;
                return (
                  <motion.div
                    key="agent-live-status"
                    initial={{ opacity: 0, y: 6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 6, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden mb-2"
                  >
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono ${
                      runningTool
                        ? "bg-amber-500/8 border-amber-500/25 text-amber-300/80"
                        : "bg-primary/5 border-primary/20 text-primary/60"
                    }`}>
                      <Loader2 className={`w-3 h-3 animate-spin shrink-0 ${runningTool ? "text-amber-400" : "text-primary/50"}`} />
                      {ToolIcon && <ToolIcon className={`w-3 h-3 shrink-0 ${toolMeta!.color}`} />}
                      <span className="truncate">{cmd}</span>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Drop zone wrapper */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`transition-all rounded-2xl ${isDragging ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
            >
              <div className="flex items-end gap-3 bg-card border border-border/40 rounded-2xl px-4 py-3 focus-within:border-primary/35 focus-within:shadow-lg focus-within:shadow-primary/5 transition-all duration-200">
                {/* Attach button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || attachedFiles.length >= 5}
                  title="Attach image or file"
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all disabled:opacity-30"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={isDragging ? "Drop files here…" : agentStatus.connected ? "Ask me to run a command, write code, read a file…" : "Ask me anything…"}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none max-h-40 overflow-y-auto leading-relaxed"
                  style={{ height: "auto" }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 160) + "px";
                  }}
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && attachedFiles.length === 0) || sending}
                  className="shrink-0 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
              Enter to send · Shift+Enter for new line · Drag & drop or paste images/files
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* ── Settings Modal ─────────────────────────────────────────────────── */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        keyInfo={keyInfo}
        onRegenerate={handleRegenerate}
        user={user}
      />
    </div>
  );
}
