import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Wifi, WifiOff, Key, RefreshCw, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Send, Loader2, CheckCircle2, XCircle,
  FolderOpen, FileText, Edit3, Monitor, Zap, AlertTriangle, Info,
  Bot, User, Settings, X, Shield, Clock, Calendar,
} from "lucide-react";
import { useToolsUser } from "@/context/ToolsUserContext";
import { useLocation } from "wouter";

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

  const getCommandDisplay = () => {
    if (tool.tool === "run_command" && tool.input.command) return `$ ${tool.input.command}`;
    if (tool.tool === "read_file" && tool.input.path) return String(tool.input.path);
    if (tool.tool === "write_file" && tool.input.path) return String(tool.input.path);
    if (tool.tool === "list_directory") return String(tool.input.path ?? ".");
    if (tool.tool === "open_vscode") return String(tool.input.path ?? ".");
    return JSON.stringify(tool.input).slice(0, 60);
  };

  return (
    <div className={`rounded-xl border text-xs font-mono overflow-hidden ${
      tool.status === "running" ? "border-amber-500/30 bg-amber-500/5"
      : tool.exitCode === 0 || tool.status === "done" ? "border-green-500/20 bg-green-500/5"
      : "border-red-500/20 bg-red-500/5"
    }`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
        <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
        <span className="text-muted-foreground truncate flex-1">{getCommandDisplay()}</span>
        {tool.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />}
        {tool.status === "done" && tool.exitCode === 0 && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {(tool.status === "error" || (tool.exitCode !== undefined && tool.exitCode !== 0)) &&
          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>
      {open && (tool.stdout || tool.stderr) && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-white/5">
          {tool.stdout && (
            <pre className="mt-2 text-foreground/80 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{tool.stdout}</pre>
          )}
          {tool.stderr && (
            <pre className="text-red-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">STDERR: {tool.stderr}</pre>
          )}
          {tool.exitCode !== undefined && tool.exitCode !== 0 && (
            <p className="text-red-400">Exit code: {tool.exitCode}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {msg.tools && msg.tools.length > 0 && (
          <div className="w-full space-y-1.5">
            {msg.tools.map(t => <ToolCard key={t.id} tool={t} />)}
          </div>
        )}
        {(msg.content || msg.streaming) && (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-secondary/60 text-foreground rounded-bl-sm border border-border/30"
          }`}>
            {msg.content || <span className="opacity-50">Thinking...</span>}
            {msg.streaming && <span className="ml-1 inline-block w-1.5 h-4 bg-current align-middle animate-pulse rounded-sm" />}
          </div>
        )}
        {msg.error && (
          <div className="px-4 py-3 rounded-2xl text-sm bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {msg.error}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-secondary border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-muted-foreground" />
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
}: {
  open: boolean;
  onClose: () => void;
  keyInfo: KeyInfo | null;
  onRegenerate: () => Promise<{ key: string; preview: string }>;
}) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);

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
    ? `node agent.mjs --key ${newKey} --server ${serverBase}`
    : `node agent.mjs --key YOUR_KEY --server ${serverBase}`;

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
                <p className="text-xs text-muted-foreground">Download the zero-dependency agent script and run it on your local machine. Requires Node.js v22+.</p>
                <button
                  onClick={downloadAgent}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border/50 text-foreground rounded-lg text-sm font-semibold hover:bg-secondary/80 transition-colors"
                >
                  <Download className="w-4 h-4 text-primary" /> Download agent.mjs
                </button>
                <div className="bg-black/50 rounded-lg px-3 py-2.5 border border-border/30">
                  <code className="text-xs text-green-400 font-mono">node agent.mjs --key YOUR_KEY</code>
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
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Terminal className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-lg">Advantix Assistant</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    {agentStatus.connected
                      ? `Connected to ${agentStatus.info?.hostname}. Ask me to run commands, read files, write code, or anything else on your machine.`
                      : "Connect your local agent using the setup guide on the left, then start chatting."}
                  </p>
                </div>
                {!keyInfo?.exists && (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Key className="w-4 h-4" /> Generate API Key to get started
                  </button>
                )}
                {agentStatus.connected && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {["List files in my project", "Create a Hello World in Python", "Show me my git status", "What's in my Downloads folder?"].map(s => (
                      <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/30">
            {!agentStatus.connected && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Agent not connected — AI can still chat but cannot execute commands
              </div>
            )}
            <div className="flex items-end gap-2 bg-secondary/30 border border-border/50 rounded-2xl px-4 py-3 focus-within:border-primary/50 focus-within:bg-secondary/50 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={agentStatus.connected ? "Ask me to run a command, write code, read a file..." : "Type a message..."}
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-40 overflow-y-auto leading-relaxed"
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
                className="shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
      />
    </div>
  );
}
