import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Wifi, WifiOff, Key, RefreshCw, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Send, Loader2, CheckCircle2, XCircle,
  FolderOpen, FileText, Edit3, Monitor, Zap, AlertTriangle, Info,
  Bot, User, Settings, X, Shield, Clock, Calendar, MessageSquare,
  Wrench, BarChart3, Activity, Sparkles, ChevronLeft,
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
type ErrorEvent      = { type: "error"; message: string };

type StreamEvent = ToolStartEvent | ToolDoneEvent | ContentEvent | DoneEvent | ErrorEvent;

type ToolExecution = {
  id: string; tool: string; input: Record<string, unknown>;
  status: "running" | "done" | "error";
  stdout?: string; stderr?: string; exitCode?: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolExecution[];
  streaming?: boolean;
  error?: string;
};

type KeyInfo = {
  exists: boolean;
  preview?: string;
  createdAt?: string;
  lastConnectedAt?: string | null;
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function genId() { return Math.random().toString(36).slice(2); }

const TOOL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  run_command:    { icon: Terminal,  label: "Run Command",    color: "text-green-400" },
  read_file:      { icon: FileText,  label: "Read File",      color: "text-blue-400" },
  write_file:     { icon: Edit3,     label: "Write File",     color: "text-amber-400" },
  list_directory: { icon: FolderOpen,label: "List Directory", color: "text-cyan-400" },
  open_vscode:    { icon: Monitor,   label: "Open VS Code",   color: "text-purple-400" },
  get_cwd:        { icon: Info,      label: "Get System Info",color: "text-slate-400" },
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
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Thinking…
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

  const runCmd = newKey
    ? `curl -s "${serverBase}/api/tools/assistant/agent.mjs" -o /tmp/agent.mjs && node /tmp/agent.mjs --key ${newKey} --server ${serverBase}`
    : null;
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
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: MessageSquare, label: "Messages Sent", value: stats.messagesSent, color: "text-blue-400", bg: "bg-blue-500/10" },
                    { icon: Bot,           label: "AI Responses",  value: stats.aiResponses,  color: "text-violet-400", bg: "bg-violet-500/10" },
                    { icon: Wrench,        label: "Tool Calls",    value: stats.toolCalls,    color: "text-green-400", bg: "bg-green-500/10" },
                  ].map(({ icon: Icon, label, value, color, bg }) => (
                    <div key={label} className={`rounded-xl border border-border/30 ${bg} p-3 text-center`}>
                      <Icon className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
                      <p className={`text-xl font-bold font-display ${color}`}>{value.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                    </div>
                  ))}
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
                  <p className="text-xs text-muted-foreground font-medium">Ready-to-use command:</p>
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
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Run command</p>

                  {runCmd ? (
                    <div className="bg-black/60 rounded-lg p-3 border border-border/30 space-y-2">
                      <p className="text-[10px] text-muted-foreground">Open your terminal and paste this — it works from anywhere:</p>
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (historyLoaded) return;
    fetch("/api/tools/assistant/history", { credentials: "include" })
      .then(r => r.json())
      .then(({ messages: rows }) => {
        if (!rows?.length) return;
        const loaded: Message[] = rows
          .filter((r: { role: string }) => r.role === "user" || r.role === "assistant")
          .map((r: { role: string; content: string }) => ({
            id: genId(), role: r.role as "user" | "assistant", content: r.content,
          }));
        setMessages(loaded);
        setHistoryLoaded(true);
      }).catch(() => {});
  }, [historyLoaded]);

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
    await fetch("/api/tools/assistant/history", { method: "DELETE", credentials: "include" });
    setMessages([]);
    setHistoryLoaded(true);
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    const userMsg: Message = { id: genId(), role: "user", content: text };
    const assistantId = genId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", tools: [], streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch("/api/tools/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
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
            if (event.type === "tool_start") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, tools: [...(m.tools ?? []), { id: event.id, tool: event.tool, input: event.input, status: "running" }] }
                : m));
            } else if (event.type === "tool_done") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, tools: (m.tools ?? []).map(t => t.id === event.id
                    ? { ...t, status: (event.exitCode === 0 ? "done" : "error") as "done" | "error", stdout: event.stdout, stderr: event.stderr, exitCode: event.exitCode }
                    : t) }
                : m));
            } else if (event.type === "content") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, content: m.content + event.delta }
                : m));
            } else if (event.type === "done") {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
            } else if (event.type === "error") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, streaming: false, error: event.message }
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
  }, [input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-screen bg-background pt-16">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-foreground text-sm">Advantix Assistant</span>
          <span className="text-xs text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-semibold">Beta</span>
        </div>

        <div className="flex-1" />

        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
          agentStatus.connected
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-red-500/10 text-red-400 border-red-500/20"
        }`}>
          {agentStatus.connected
            ? <><Wifi className="w-3.5 h-3.5" />Connected · {agentStatus.info?.hostname ?? "Agent"}</>
            : <><WifiOff className="w-3.5 h-3.5" />Agent not connected</>}
        </div>

        {agentStatus.connected && agentStatus.info && (
          <span className="text-xs text-muted-foreground hidden sm:block">
            {agentStatus.info.os} · {agentStatus.info.username} · {agentStatus.info.cwd}
          </span>
        )}

        <button
          onClick={() => setShowSettings(true)}
          title="Agent Settings & API Key"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={clearHistory} title="Clear chat" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar: Setup ──────────────────────────────────────────────── */}
        <div className={`shrink-0 border-r border-border/50 bg-card/30 overflow-y-auto transition-all duration-300 ${
          showSetup || !agentStatus.connected ? "w-72" : "w-10"
        }`}>
          {(!agentStatus.connected || showSetup) ? (
            <div className="p-4 space-y-5">
              <div>
                <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" /> Setup Guide
                </h3>
                <p className="text-xs text-muted-foreground">Run the agent on your machine to allow AI to execute commands, read files, and code with you.</p>
              </div>

              {/* Step 1 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 font-bold">1</span>
                  Generate Your API Key
                </p>
                {keyInfo?.exists ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2 border border-border/40">
                      <Key className="w-3.5 h-3.5 text-primary shrink-0" />
                      <code className="text-xs text-foreground flex-1 font-mono">{keyInfo.preview}</code>
                    </div>
                    <button onClick={() => setShowSettings(true)}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors font-semibold">
                      <Settings className="w-3 h-3" /> Manage key in Settings
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => { setShowSettings(true); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                    <Key className="w-3.5 h-3.5" /> Generate API Key
                  </button>
                )}

                {newKeyForSidebar && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Key generated — open Settings to copy it!
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 font-bold">2</span>
                  Download Agent Script
                </p>
                <button onClick={downloadAgent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-secondary border border-border/40 text-foreground rounded-lg text-xs font-semibold hover:bg-secondary/80 transition-colors">
                  <Download className="w-3.5 h-3.5 text-primary" /> Download agent.mjs
                </button>
                <p className="text-[10px] text-muted-foreground">Requires Node.js v22+</p>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 font-bold">3</span>
                  Run in Terminal
                </p>
                <div className="bg-black/50 border border-border/40 rounded-lg p-3">
                  <code className="text-[11px] text-green-400 font-mono">node agent.mjs --key YOUR_KEY</code>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Open Settings (⚙) to get your full key and run command.</p>
                </div>
              </div>

              <div className="border-t border-border/30 pt-4 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What AI can do</p>
                {[
                  { icon: Terminal,   label: "Run any shell command" },
                  { icon: FileText,   label: "Read & write files" },
                  { icon: FolderOpen, label: "Browse directories" },
                  { icon: Monitor,    label: "Open VS Code" },
                  { icon: RefreshCw,  label: "Auto-reconnects" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => setShowSetup(true)}
              className="h-full w-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Show setup">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Chat area ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-5 pb-8">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center shadow-xl shadow-primary/5">
                    <Sparkles className="w-9 h-9 text-primary" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-background flex items-center justify-center bg-green-500 shadow">
                    {agentStatus.connected
                      ? <Wifi className="w-3 h-3 text-white" />
                      : <WifiOff className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display font-bold text-foreground text-xl">
                    {user?.name ? `Hi, ${user.name.split(" ")[0]}! 👋` : "Advantix Assistant"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    {agentStatus.connected
                      ? `Connected to **${agentStatus.info?.hostname}**. I can run commands, read & write files, open VS Code, and anything else on your machine.`
                      : "Set up your local agent using the guide on the left, then I can execute commands directly on your computer."}
                  </p>
                </div>
                {!keyInfo?.exists && (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <Key className="w-4 h-4" /> Generate API Key to get started
                  </button>
                )}
                {agentStatus.connected && (
                  <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
                    {[
                      { text: "List files in my project", icon: FolderOpen },
                      { text: "Create a Hello World in Python", icon: Terminal },
                      { text: "Show me my git status", icon: Info },
                      { text: "What's in my Downloads folder?", icon: FileText },
                    ].map(({ text, icon: Icon }) => (
                      <button key={text} onClick={() => { setInput(text); inputRef.current?.focus(); }}
                        className="flex items-center gap-2 text-left text-xs px-3 py-2.5 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all group">
                        <Icon className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary shrink-0 transition-colors" />
                        <span>{text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} userName={user?.name ?? user?.email} />)}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 px-4 pb-4 pt-3 border-t border-border/20 bg-background/50 backdrop-blur-sm">
            {!agentStatus.connected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-center gap-2 text-xs text-amber-400/90 bg-amber-500/8 border border-amber-500/15 rounded-xl px-3 py-2 mb-3"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Agent not connected — I can still answer questions but can't execute commands on your machine</span>
              </motion.div>
            )}
            <div className="flex items-end gap-3 bg-card border border-border/50 rounded-2xl px-4 py-3 focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/5 transition-all duration-200">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={agentStatus.connected ? "Ask me to run a command, write code, read a file…" : "Ask me anything…"}
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none max-h-40 overflow-y-auto leading-relaxed"
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
                disabled={!input.trim() || sending}
                className="shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-primary/20"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Enter to send · Shift+Enter for new line · Powered by Claude
            </p>
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
