import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Wifi, WifiOff, Key, RefreshCw, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Send, Loader2, CheckCircle2, XCircle,
  FolderOpen, FileText, Edit3, Monitor, Zap, AlertTriangle, Info,
  Bot, User, Settings, X, Shield, Clock, Calendar, MessageSquare,
  Wrench, BarChart3, Activity, Sparkles, ChevronLeft, PenSquare, Menu,
  Paperclip, Link, List, Globe, Search, GitBranch, SearchCode, FolderSearch,
  FolderPlus, Folder, Smartphone, Code2, Globe2, Cpu, BookOpen,
  BrainCircuit, Pencil, ChevronUp, Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToolsUser } from "@/context/ToolsUserContext";
import { useLocation } from "wouter";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";

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
type ToolDoneEvent   = { type: "tool_done"; id: string; tool: string; stdout: string; stderr: string; exitCode: number; durationMs?: number };
type ContentEvent    = { type: "content"; delta: string };
type ThinkingEvent   = { type: "thinking"; delta: string };
type DoneEvent       = { type: "done"; totalTokens: number };
type ConvIdEvent     = { type: "conversation_id"; conversationId: number };
type ErrorEvent      = { type: "error"; message: string };

type StreamEvent = ToolStartEvent | ToolDoneEvent | ContentEvent | ThinkingEvent | DoneEvent | ConvIdEvent | ErrorEvent;

type Conversation = {
  id: number;
  title: string;
  project_type: string;
  instructions: string;
  task_memory: string;
  created_at: string;
  updated_at: string;
  message_count: string;
};

/* ── Project type definitions ────────────────────────────────────────── */
type ProjectTypeDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  defaultInstructions: string;
};

const PROJECT_TYPES: ProjectTypeDef[] = [
  {
    id: "flutter",
    label: "Flutter App",
    icon: Smartphone,
    color: "text-blue-400",
    description: "Mobile app with Flutter & Dart",
    defaultInstructions: "This is a Flutter/Dart mobile app project.\nAlways use proper Dart null safety.\nFollow Flutter best practices and Material 3 guidelines.\nUse proper widget separation and state management.",
  },
  {
    id: "web",
    label: "Web App",
    icon: Globe2,
    color: "text-emerald-400",
    description: "React, Vue, or any web frontend",
    defaultInstructions: "This is a web application project.\nFollow modern web development best practices.\nUse TypeScript where possible.",
  },
  {
    id: "backend",
    label: "Backend / API",
    icon: Cpu,
    color: "text-violet-400",
    description: "Node.js, Python, or server-side",
    defaultInstructions: "This is a backend/API project.\nFocus on clean architecture, proper error handling, and security.\nUse environment variables for secrets.",
  },
  {
    id: "python",
    label: "Python Script",
    icon: Code2,
    color: "text-yellow-400",
    description: "Python automation, data, AI",
    defaultInstructions: "This is a Python project.\nUse proper virtual environments and requirements.txt.\nFollow PEP 8 style guidelines.",
  },
  {
    id: "ai",
    label: "AI / ML",
    icon: BrainCircuit,
    color: "text-pink-400",
    description: "Machine learning or AI integration",
    defaultInstructions: "This is an AI/ML project.\nFocus on model performance, data pipelines, and reproducibility.\nDocument experiments and results.",
  },
  {
    id: "general",
    label: "General",
    icon: BookOpen,
    color: "text-slate-400",
    description: "Any other project or task",
    defaultInstructions: "",
  },
];

type ToolExecution = {
  id: string; tool: string; input: Record<string, unknown>;
  status: "running" | "done" | "error";
  stdout?: string; stderr?: string; exitCode?: number;
  durationMs?: number;
  startedAt?: number;
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
  thinking?: string;      /* reasoning tokens (DeepSeek R1, QwQ, etc.) */
  tools?: ToolExecution[];
  streaming?: boolean;
  statusText?: string;
  error?: string;
  attachments?: AttachedFile[];
  interrupted?: boolean;
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
  if (tool === "get_site_info")     return `Fetching site info…`;
  if (tool === "patch_file")        return `Patching ${String(input.path ?? "file")}…`;
  if (tool === "search_in_files")   return `Searching for "${String(input.pattern ?? "…")}"…`;
  if (tool === "fetch_url")         return `Fetching ${String(input.url ?? "URL")}…`;
  if (tool === "git")               return `git ${String(input.action ?? "")} ${String(input.args ?? "")}`.trim() + "…";
  if (tool === "find_code")         return `Searching "${String(input.pattern ?? "…")}"${input.ext ? ` [.${input.ext}]` : ""}`;
  if (tool === "list_files")        return `Listing ${String(input.path ?? "project")}${input.ext ? ` (*.${input.ext})` : ""}`;
  return tool;
}

const TOOL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  run_command:       { icon: Terminal,     label: "Run Command",      color: "text-green-400" },
  read_file:         { icon: FileText,     label: "Read File",        color: "text-blue-400" },
  write_file:        { icon: Edit3,        label: "Write File",       color: "text-amber-400" },
  patch_file:        { icon: Edit3,        label: "Patch File",       color: "text-orange-400" },
  search_in_files:   { icon: Search,       label: "Search Files",     color: "text-cyan-400" },
  list_directory:    { icon: FolderOpen,   label: "List Directory",   color: "text-cyan-300" },
  open_vscode:       { icon: Monitor,      label: "Open VS Code",     color: "text-purple-400" },
  get_cwd:           { icon: Info,         label: "Get System Info",  color: "text-slate-400" },
  create_short_link: { icon: Link,         label: "Create Short Link",color: "text-pink-400" },
  list_short_links:  { icon: List,         label: "List Short Links", color: "text-pink-300" },
  get_smm_stats:     { icon: BarChart3,    label: "SMM Stats",        color: "text-violet-400" },
  get_smm_posts:     { icon: MessageSquare,label: "SMM Posts",        color: "text-violet-300" },
  get_site_info:     { icon: Globe,        label: "Site Info",        color: "text-teal-400" },
  fetch_url:         { icon: Globe,        label: "Fetch URL",        color: "text-sky-400" },
  git:               { icon: GitBranch,    label: "Git",              color: "text-orange-300" },
  find_code:           { icon: SearchCode,   label: "Find in Code",       color: "text-emerald-400" },
  list_files:          { icon: FolderSearch, label: "List Files",         color: "text-emerald-300" },
  read_codebase_file:    { icon: Code2,          label: "Read File",          color: "text-blue-300" },
  edit_codebase_file:    { icon: Pencil,         label: "Edit File",          color: "text-amber-300" },
  run_build_check:       { icon: Wrench,         label: "Build Check",        color: "text-green-300" },
  update_project_memory: { icon: BrainCircuit,   label: "Update Journal",     color: "text-violet-400" },
  scan_project:          { icon: Activity,       label: "Scan Project",       color: "text-cyan-300" },
};

function ToolCard({ tool }: { tool: ToolExecution }) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const meta = TOOL_META[tool.tool] ?? { icon: Terminal, label: tool.tool, color: "text-slate-400" };
  const Icon = meta.icon;
  const isRunning = tool.status === "running";
  const isError = tool.status === "error" || (tool.exitCode !== undefined && tool.exitCode !== 0);
  const isDone = !isRunning && !isError;

  /* Live elapsed counter while running */
  useEffect(() => {
    if (!isRunning) return;
    const t0 = tool.startedAt ?? Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => clearInterval(iv);
  }, [isRunning, tool.startedAt]);

  const fmtDuration = (ms: number) =>
    ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  /* Derive rich subtitle from input */
  const getDetail = (): string => {
    const cmd = String(tool.input.command ?? "");
    const path = String(tool.input.path ?? "");
    if (tool.tool === "run_command") {
      /* Detect common patterns */
      if (/grep|rg\b/.test(cmd)) {
        const m = cmd.match(/(?:grep|rg)\s+(?:-[^\s]+\s+)*["']?([^"'\s]+)["']?\s+(.+)/);
        if (m) return `search "${m[1]}" in ${m[2].split(" ")[0]}`;
        return cmd.slice(0, 70);
      }
      return cmd.slice(0, 80);
    }
    if (tool.tool === "read_file")    return path.split("/").slice(-2).join("/");
    if (tool.tool === "write_file")   return `→ ${path.split("/").slice(-2).join("/")}`;
    if (tool.tool === "patch_file")   return `lines ${tool.input.start_line}–${tool.input.end_line} in ${path.split("/").slice(-2).join("/")}`;
    if (tool.tool === "search_in_files") {
      const fp = tool.input.file_pattern ? ` [${tool.input.file_pattern}]` : "";
      return `"${String(tool.input.pattern ?? "").slice(0, 40)}"${fp}`;
    }
    if (tool.tool === "fetch_url") {
      try { return new URL(String(tool.input.url ?? "")).hostname; } catch { return String(tool.input.url ?? "").slice(0, 50); }
    }
    if (tool.tool === "git") {
      const args = tool.input.args ? ` ${String(tool.input.args)}` : "";
      return `git ${String(tool.input.action ?? "")}${args}`.slice(0, 60);
    }
    if (tool.tool === "list_directory") return path || ".";
    if (tool.tool === "open_vscode")  return path || ".";
    return JSON.stringify(tool.input).slice(0, 60);
  };

  /* Extra badge: match count for grep, line count for write/read */
  const getBadge = (): string | null => {
    if (!tool.stdout && tool.tool !== "patch_file") return null;
    if (tool.tool === "search_in_files") {
      const lines = (tool.stdout ?? "").trim().split("\n").filter(Boolean).length;
      return lines > 0 ? `${lines} match${lines === 1 ? "" : "es"}` : "no matches";
    }
    if (tool.tool === "run_command" && /grep|rg\b/.test(String(tool.input.command ?? ""))) {
      const lines = (tool.stdout ?? "").trim().split("\n").filter(Boolean).length;
      return lines > 0 ? `${lines} match${lines === 1 ? "" : "es"}` : "no matches";
    }
    if (tool.tool === "write_file") {
      const content = String(tool.input.content ?? "");
      const lines = content.split("\n").length;
      return `${lines} line${lines === 1 ? "" : "s"}`;
    }
    if (tool.tool === "patch_file" && tool.status === "done") {
      const n = Number(tool.input.end_line ?? 0) - Number(tool.input.start_line ?? 0) + 1;
      return `${n} line${n === 1 ? "" : "s"} replaced`;
    }
    if (tool.tool === "read_file" && tool.stdout) {
      const lines = tool.stdout.split("\n").length;
      return `${lines} line${lines === 1 ? "" : "s"}`;
    }
    return null;
  };

  const badge = isDone || isError ? getBadge() : null;
  const duration = isRunning ? elapsed : (tool.durationMs ?? 0);

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
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
          isRunning ? "bg-amber-500/15" : isDone ? "bg-green-500/15" : "bg-red-500/15"
        }`}>
          {isRunning
            ? <Loader2 className={`w-3 h-3 ${meta.color} animate-spin`} />
            : <Icon className={`w-3 h-3 ${meta.color}`} />}
        </div>
        <span className={`font-semibold text-[10px] uppercase tracking-wider shrink-0 ${meta.color}`}>{meta.label}</span>
        <span className="text-muted-foreground/60 truncate flex-1 text-[11px] font-normal">{getDetail()}</span>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {badge && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${isError ? "bg-red-500/15 text-red-400" : "bg-green-500/10 text-green-400/80"}`}>{badge}</span>
          )}
          {duration > 0 && (
            <span className={`text-[10px] tabular-nums ${isRunning ? "text-amber-400/70" : "text-muted-foreground/40"}`}>{fmtDuration(duration)}</span>
          )}
          {isDone && !open && <CheckCircle2 className="w-3 h-3 text-green-400/70" />}
          {isError && <XCircle className="w-3 h-3 text-red-400" />}
          {(tool.stdout || tool.stderr) && (open ? <ChevronDown className="w-3 h-3 text-muted-foreground/40" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/40" />)}
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

/* ── Code block with language badge + copy button ─────────────────────── */
/* Normalize lang aliases */
const normalizeLang = (l: string) => {
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", py: "python", sh: "bash",
    shell: "bash", zsh: "bash", yml: "yaml", md: "markdown",
    rs: "rust", golang: "go", jsx: "jsx", tsx: "tsx",
  };
  return map[l.toLowerCase()] ?? l.toLowerCase();
};

function CodeBlock({ children, lang }: { children: React.ReactNode; lang: string }) {
  const [copied, setCopied] = useState(false);
  const codeStr = (() => {
    if (typeof children === "string") return children;
    if (Array.isArray(children)) return children.map(c => (typeof c === "string" ? c : "")).join("");
    return "";
  })();

  const normalized = normalizeLang(lang);
  const grammar = Prism.languages[normalized];
  const highlighted = grammar ? Prism.highlight(codeStr.trim(), grammar, normalized) : null;

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-white/10 bg-[#1a1b26] shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/[0.04] border-b border-white/[0.07]">
        <span className="text-[10px] font-mono text-primary/50 uppercase tracking-widest">{normalized || "code"}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(codeStr.trim()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1.5 transition-colors"
        >
          {copied ? <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></> : <><Copy className="w-3 h-3" /><span>Copy</span></>}
        </button>
      </div>
      <pre className="px-4 py-3.5 overflow-x-auto text-[12px] font-mono leading-[1.65] prism-code">
        {highlighted
          ? <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          : <code className="text-[#a9b1d6]">{codeStr}</code>
        }
      </pre>
    </div>
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
    const lang = className?.replace("language-", "") ?? "";
    const isBlock = !!className?.includes("language-");
    if (isBlock) return <CodeBlock lang={lang}>{children}</CodeBlock>;
    return <code className="px-1.5 py-0.5 rounded-md bg-black/40 text-green-300 text-[11.5px] font-mono border border-white/10">{children}</code>;
  },
  h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-base font-bold text-foreground mt-2 mb-1">{children}</h1>,
  h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-sm font-bold text-foreground mt-2 mb-1">{children}</h2>,
  h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-sm font-semibold text-foreground mt-1.5 mb-0.5">{children}</h3>,
  a: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary/90 underline underline-offset-2 hover:text-primary transition-colors">{children}</a>,
  blockquote: ({ children }: React.HTMLAttributes<HTMLQuoteElement>) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  hr: () => <hr className="border-border/30 my-2" />,
};

function ThinkingBlock({ thinking, streaming }: { thinking: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full rounded-xl border border-violet-500/20 bg-violet-950/20 overflow-hidden text-xs mb-0.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-violet-300/80 hover:text-violet-200 hover:bg-violet-950/30 transition-colors text-left"
      >
        <span className="flex items-center gap-1.5 shrink-0">
          {streaming && !open ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "400ms" }} />
            </>
          ) : (
            <span className="text-[10px]">{open ? "▾" : "▸"}</span>
          )}
        </span>
        <span className="font-medium tracking-wide uppercase text-[10px]">
          {streaming ? "Thinking…" : `Reasoning (${thinking.length.toLocaleString()} chars)`}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 font-mono text-[11px] leading-relaxed text-violet-200/60 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {thinking}
          {streaming && <span className="inline-block w-1.5 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, userName }: { msg: Message; userName?: string }) {
  const isUser = msg.role === "user";
  const initial = (userName ?? "U")[0].toUpperCase();
  const [msgCopied, setMsgCopied] = useState(false);
  const copyMsg = () => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content);
    setMsgCopied(true);
    setTimeout(() => setMsgCopied(false), 2000);
  };

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

        {/* Thinking / reasoning block */}
        {!isUser && msg.thinking && (
          <ThinkingBlock thinking={msg.thinking} streaming={msg.streaming && !msg.content} />
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

        {/* Copy button — only for assistant, show on group hover */}
        {!isUser && msg.content && !msg.streaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 self-start">
            <button
              onClick={copyMsg}
              title="Copy message"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50 transition-all"
            >
              {msgCopied ? <><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></> : <><Copy className="w-3 h-3" /><span>Copy</span></>}
            </button>
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
  const [instructions, setInstructions] = useState("");
  const [instrSaving, setInstrSaving] = useState(false);
  const [instrSaved, setInstrSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatsLoading(true);
    Promise.all([
      fetch("/api/tools/assistant/stats", { credentials: "include" }).then(r => r.json()).then(setStats).catch(() => {}),
      fetch("/api/tools/assistant/instructions", { credentials: "include" }).then(r => r.ok ? r.json() : { instructions: "" }).then(d => setInstructions(d.instructions ?? "")).catch(() => {}),
    ]).finally(() => setStatsLoading(false));
  }, [open]);

  const saveInstructions = async () => {
    setInstrSaving(true);
    try {
      await fetch("/api/tools/assistant/instructions", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      setInstrSaved(true);
      setTimeout(() => setInstrSaved(false), 2500);
    } finally {
      setInstrSaving(false);
    }
  };

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

            {/* ── Persistent Instructions ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Persistent Instructions
                </h3>
                <span className="text-[10px] text-muted-foreground">{instructions.length}/4000</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Write instructions the assistant should always follow — like your project structure, preferences, or ongoing tasks. These are added to every conversation automatically.
              </p>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                maxLength={4000}
                rows={5}
                placeholder={"e.g. My main project is at ~/project/my-app\nAlways use pnpm, not npm\nI'm building a trading bot in Python\nDefault working directory: /Users/tanvir/work"}
                className="w-full px-3 py-2.5 text-xs bg-background border border-border/50 rounded-xl outline-none focus:ring-1 focus:ring-primary/50 resize-none font-mono text-foreground placeholder:text-muted-foreground/50 leading-relaxed"
              />
              <button
                onClick={saveInstructions}
                disabled={instrSaving}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  instrSaved
                    ? "bg-green-500/10 text-green-400 border border-green-500/30"
                    : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                } disabled:opacity-60`}
              >
                {instrSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                ) : instrSaved ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Saved!</>
                ) : (
                  "Save Instructions"
                )}
              </button>
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
  const abortControllerRef  = useRef<AbortController | null>(null);
  const streamBufferRef     = useRef<string>("");
  const rafRef              = useRef<number | null>(null);
  const thinkingBufferRef   = useRef<string>("");
  const thinkingRafRef      = useRef<number | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newKeyForSidebar, setNewKeyForSidebar] = useState<string | null>(null);

  /* ── Projects / Conversations ────────────────────────────────────────────── */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [activeProject, setActiveProject] = useState<Conversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deletingConvId, setDeletingConvId] = useState<number | null>(null);

  /* New project modal state */
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjType, setNewProjType] = useState("flutter");
  const [newProjInstructions, setNewProjInstructions] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  /* Memory panel */
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryEditValue, setMemoryEditValue] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasNewMsg, setHasNewMsg] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const serverBase = window.location.origin;

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setHasNewMsg(false);
    } else {
      setHasNewMsg(true);
    }
  }, [messages]);

  const handleScrollContainer = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
    if (atBottom) setHasNewMsg(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    isAtBottomRef.current = true;
    setShowScrollBtn(false);
    setHasNewMsg(false);
  }, []);

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
    /* Detect interrupted task — last assistant message has tools but no text */
    const lastMsg = loaded[loaded.length - 1];
    if (lastMsg && lastMsg.role === "assistant" && (lastMsg.tools ?? []).length > 0 && !lastMsg.content.trim()) {
      lastMsg.interrupted = true;
    }
    return loaded;
  }, []);

  /* Sync activeProject when conversationId or conversations list changes */
  useEffect(() => {
    if (!conversationId) return;
    const found = conversations.find(c => c.id === conversationId);
    if (found) setActiveProject(found);
  }, [conversationId, conversations]);

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

  /* ── Open New Project modal ──────────────────────────────────────────────── */
  const newChat = useCallback(() => {
    const defaultType = PROJECT_TYPES.find(t => t.id === "flutter")!;
    setNewProjName("");
    setNewProjType("flutter");
    setNewProjInstructions(defaultType.defaultInstructions);
    setShowNewProjectModal(true);
  }, []);

  /* ── Create a new project ────────────────────────────────────────────────── */
  const createProject = useCallback(async () => {
    if (!newProjName.trim()) return;
    setCreatingProject(true);
    try {
      const r = await fetch("/api/tools/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newProjName.trim(),
          project_type: newProjType,
          instructions: newProjInstructions.trim(),
        }),
      });
      const proj = await r.json() as Conversation;
      setConversations(prev => [proj, ...prev]);
      setConversationId(proj.id);
      setActiveProject(proj);
      setMessages([]);
      setShowNewProjectModal(false);
      inputRef.current?.focus();
      if (window.innerWidth < 768) setSidebarOpen(false);
    } finally {
      setCreatingProject(false);
    }
  }, [newProjName, newProjType, newProjInstructions]);

  /* ── Switch to a project ─────────────────────────────────────────────────── */
  const openConversation = useCallback((conv: Conversation) => {
    setConversationId(conv.id);
    setActiveProject(conv);
    setMessages([]);
    setShowMemoryPanel(false);
    loadConversationHistory(conv.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [loadConversationHistory]);

  /* ── Delete a project ────────────────────────────────────────────────────── */
  const deleteConversation = useCallback(async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingConvId(convId);
    await fetch(`/api/tools/assistant/conversations/${convId}`, { method: "DELETE", credentials: "include" });
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (conversationId === convId) { setMessages([]); setConversationId(null); setActiveProject(null); }
    setDeletingConvId(null);
  }, [conversationId]);

  /* ── Save project memory ─────────────────────────────────────────────────── */
  const saveMemory = useCallback(async () => {
    if (!conversationId) return;
    setSavingMemory(true);
    await fetch(`/api/tools/assistant/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ task_memory: memoryEditValue }),
    });
    setActiveProject(prev => prev ? { ...prev, task_memory: memoryEditValue } : prev);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, task_memory: memoryEditValue } : c));
    setSavingMemory(false);
    setShowMemoryPanel(false);
  }, [conversationId, memoryEditValue]);

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

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (forceText?: string) => {
    const text = (forceText ?? input).trim();
    if ((!text && attachedFiles.length === 0) || sending) return;
    if (!forceText) setInput("");
    setSending(true);

    const currentAttachments = [...attachedFiles];
    setAttachedFiles([]);

    const userMsg: Message = { id: genId(), role: "user", content: text, attachments: currentAttachments };
    const assistantId = genId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", tools: [], streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    let currentConvId = conversationId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/tools/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
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
                ? { ...m, statusText: status, tools: [...(m.tools ?? []), { id: event.id, tool: event.tool, input: event.input, status: "running", startedAt: Date.now() }] }
                : m));
            } else if (event.type === "tool_done") {
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, statusText: undefined, tools: (m.tools ?? []).map(t => t.id === event.id
                    ? { ...t, status: (event.exitCode === 0 ? "done" : "error") as "done" | "error", stdout: event.stdout, stderr: event.stderr, exitCode: event.exitCode, durationMs: event.durationMs }
                    : t) }
                : m));
            } else if (event.type === "thinking") {
              thinkingBufferRef.current += event.delta;
              if (thinkingRafRef.current === null) {
                const snapId = assistantId;
                thinkingRafRef.current = requestAnimationFrame(() => {
                  thinkingRafRef.current = null;
                  const chunk = thinkingBufferRef.current;
                  if (!chunk) return;
                  thinkingBufferRef.current = "";
                  setMessages(prev => prev.map(m => m.id === snapId
                    ? { ...m, thinking: (m.thinking ?? "") + chunk }
                    : m));
                });
              }
            } else if (event.type === "content") {
              streamBufferRef.current += event.delta;
              if (rafRef.current === null) {
                const snapId = assistantId;
                rafRef.current = requestAnimationFrame(() => {
                  rafRef.current = null;
                  const chunk = streamBufferRef.current;
                  if (!chunk) return;
                  streamBufferRef.current = "";
                  setMessages(prev => prev.map(m => m.id === snapId
                    ? { ...m, statusText: undefined, content: m.content + chunk }
                    : m));
                });
              }
            } else if (event.type === "done") {
              /* Flush any remaining buffered content before marking done */
              if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
              if (thinkingRafRef.current !== null) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = null; }
              const remaining = streamBufferRef.current;
              const remainingThinking = thinkingBufferRef.current;
              streamBufferRef.current = "";
              thinkingBufferRef.current = "";
              setMessages(prev => prev.map(m => m.id === assistantId
                ? { ...m, streaming: false, statusText: undefined, content: m.content + remaining,
                    ...(remainingThinking ? { thinking: (m.thinking ?? "") + remainingThinking } : {}) }
                : m));
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
      /* Cancel any pending RAFs and flush buffered content */
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (thinkingRafRef.current !== null) { cancelAnimationFrame(thinkingRafRef.current); thinkingRafRef.current = null; }
      const remaining = streamBufferRef.current;
      const remainingThinking = thinkingBufferRef.current;
      streamBufferRef.current = "";
      thinkingBufferRef.current = "";
      const isAbort = (err as Error).name === "AbortError";
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, streaming: false, statusText: undefined,
            content: m.content + remaining,
            ...(remainingThinking ? { thinking: (m.thinking ?? "") + remainingThinking } : {}),
            ...(isAbort ? {} : { error: (err as Error).message }) }
        : m));
      if (!isAbort) console.error("Chat error:", err);
    } finally {
      abortControllerRef.current = null;
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

      {/* ── Projects Sidebar ─────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full border-r border-border/30 bg-background/60 backdrop-blur-sm flex flex-col overflow-hidden shrink-0"
          >
            {/* Sidebar header */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-border/20 shrink-0">
              <Folder className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground flex-1">Projects</span>
              <button
                onClick={newChat}
                title="New project"
                className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
              {conversations.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <FolderPlus className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <div className="text-xs text-muted-foreground/60 font-medium">No projects yet</div>
                  <div className="text-[10px] text-muted-foreground/40 mt-1">Create your first project</div>
                  <button
                    onClick={newChat}
                    className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    + New Project
                  </button>
                </div>
              ) : (
                conversations.map(conv => {
                  const ptDef = PROJECT_TYPES.find(t => t.id === conv.project_type) ?? PROJECT_TYPES[PROJECT_TYPES.length - 1];
                  const PtIcon = ptDef.icon;
                  const isActive = conversationId === conv.id;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv)}
                      className={`w-full text-left px-2.5 py-2 group flex items-start gap-2 transition-colors rounded-lg ${
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isActive ? "bg-primary/15" : "bg-secondary/50"}`}>
                        <PtIcon className={`w-3.5 h-3.5 ${ptDef.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate leading-tight">{conv.title || "Untitled"}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-semibold uppercase tracking-wide ${ptDef.color} opacity-70`}>{ptDef.label}</span>
                          <span className="text-[9px] text-muted-foreground/40">· {relativeTime(conv.updated_at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={e => deleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400 mt-0.5"
                        title="Delete project"
                      >
                        {deletingConvId === conv.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                      </button>
                    </button>
                  );
                })
              )}
            </div>

            {/* New Project CTA */}
            <div className="p-2.5 border-t border-border/20 shrink-0">
              <button
                onClick={newChat}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 border border-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Project
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
          {activeProject ? (
            <>
              {(() => {
                const ptDef = PROJECT_TYPES.find(t => t.id === activeProject.project_type) ?? PROJECT_TYPES[PROJECT_TYPES.length - 1];
                const PtIcon = ptDef.icon;
                return <PtIcon className={`w-3.5 h-3.5 ${ptDef.color}`} />;
              })()}
              <span className="font-display font-semibold text-foreground text-sm truncate max-w-[180px]">{activeProject.title}</span>
              <span className="text-[10px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-md border border-primary/15 font-semibold tracking-wide">BETA</span>
            </>
          ) : (
            <>
              <span className="font-display font-semibold text-foreground text-sm">Advantix Assistant</span>
              <span className="text-[10px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-md border border-primary/15 font-semibold tracking-wide">BETA</span>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Memory button — only when project is active */}
        {activeProject && (
          <button
            onClick={() => {
              setMemoryEditValue(activeProject.task_memory || "");
              setShowMemoryPanel(v => !v);
            }}
            title="Project Memory"
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${
              showMemoryPanel
                ? "bg-violet-500/15 text-violet-300 border-violet-500/25"
                : "bg-border/20 text-muted-foreground border-border/30 hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            Memory
          </button>
        )}

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

        {/* ── Memory Panel ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showMemoryPanel && activeProject && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="shrink-0 border-b border-violet-500/20 bg-violet-500/5 overflow-hidden"
            >
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-300">Project Memory</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">— আগের কাজের সারাংশ। AI এটা প্রতিটা message এ পড়বে।</span>
                  <div className="flex-1" />
                  <button
                    onClick={saveMemory}
                    disabled={savingMemory}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                  >
                    {savingMemory ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Save
                  </button>
                  <button onClick={() => setShowMemoryPanel(false)} className="p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={memoryEditValue}
                  onChange={e => setMemoryEditValue(e.target.value)}
                  placeholder="Project এ কী কী হয়েছে, কোন files আছে, কী করতে হবে — এখানে লেখো। AI প্রতিটা message এ এটা পড়বে।"
                  className="w-full h-28 bg-background/50 border border-violet-500/20 rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-foreground/40 resize-none focus:outline-none focus:border-violet-500/40 leading-relaxed"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto relative" ref={scrollContainerRef} onScroll={handleScrollContainer}>
          {/* Scroll-to-bottom floating button */}
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                key="scroll-btn"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={scrollToBottom}
                className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/60 shadow-lg text-xs text-foreground/80 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all backdrop-blur-sm"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                {hasNewMsg ? <span className="text-primary font-semibold">New message</span> : <span>Scroll to bottom</span>}
              </motion.button>
            )}
          </AnimatePresence>
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-6 pb-4">
                {/* Avatar + status */}
                <div className="relative">
                  {activeProject ? (
                    (() => {
                      const ptDef = PROJECT_TYPES.find(t => t.id === activeProject.project_type) ?? PROJECT_TYPES[PROJECT_TYPES.length - 1];
                      const PtIcon = ptDef.icon;
                      return (
                        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center`}>
                          <PtIcon className={`w-7 h-7 ${ptDef.color}`} />
                        </div>
                      );
                    })()
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-primary" />
                    </div>
                  )}
                  <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${agentStatus.connected ? "bg-green-500" : "bg-muted"}`} />
                </div>

                {/* Greeting / Project info */}
                {activeProject ? (
                  <div className="space-y-2 max-w-sm">
                    <h3 className="font-display font-semibold text-foreground text-lg">{activeProject.title}</h3>
                    {activeProject.instructions ? (
                      <div className="text-left bg-secondary/20 border border-border/30 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {activeProject.instructions}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {agentStatus.connected
                          ? `Connected to ${agentStatus.info?.hostname}. Start working on your project!`
                          : "Connect your local agent to work directly on this project."}
                      </p>
                    )}
                    {activeProject.task_memory && (
                      <div className="text-left mt-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BrainCircuit className="w-3 h-3 text-violet-400" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400/70">Memory</span>
                        </div>
                        <div className="bg-violet-500/5 border border-violet-500/15 rounded-lg p-2.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {activeProject.task_memory}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="font-display font-semibold text-foreground text-lg">
                      {user?.name ? `Hi, ${user.name.split(" ")[0]}` : "Advantix Assistant"}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                      Select a project from the sidebar or create a new one to get started.
                    </p>
                    <button onClick={newChat}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all mx-auto">
                      <FolderPlus className="w-3.5 h-3.5" /> New Project
                    </button>
                  </div>
                )}

                {!keyInfo?.exists && !activeProject && (
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
              {messages.map(msg => (
                <React.Fragment key={msg.id}>
                  <MessageBubble msg={msg} userName={user?.name ?? user?.email} />
                  {msg.interrupted && !sending && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start pl-10"
                    >
                      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-amber-300/80">Task was interrupted</span>
                        <button
                          onClick={() => sendMessage("আগের কাজটা continue করো — tool calls শেষ হয়েছে, এখন বাকি কাজ সম্পন্ন করো।")}
                          className="ml-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold transition-colors"
                        >
                          Resume →
                        </button>
                      </div>
                    </motion.div>
                  )}
                </React.Fragment>
              ))}
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
                {sending ? (
                  <button
                    onClick={stopGeneration}
                    title="Stop generation"
                    className="shrink-0 w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 flex items-center justify-center hover:bg-red-500/25 active:scale-95 transition-all"
                  >
                    <span className="w-3 h-3 rounded-sm bg-red-400 block" />
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() && attachedFiles.length === 0}
                    className="shrink-0 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
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

      {/* ── New Project Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewProjectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={e => { if (e.target === e.currentTarget) setShowNewProjectModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-lg bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderPlus className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-foreground text-sm">New Project</h2>
                  <p className="text-[11px] text-muted-foreground">Project তৈরি করো এবং instructions দাও</p>
                </div>
                <div className="flex-1" />
                <button onClick={() => setShowNewProjectModal(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Project name */}
                <div>
                  <label className="text-xs font-semibold text-foreground/80 mb-1.5 block">Project Name</label>
                  <input
                    type="text"
                    value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newProjName.trim()) createProject(); }}
                    placeholder="e.g. My Flutter App, Trading Bot, Portfolio Website"
                    className="w-full bg-background border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                    autoFocus
                  />
                </div>

                {/* Project type */}
                <div>
                  <label className="text-xs font-semibold text-foreground/80 mb-2 block">Project Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PROJECT_TYPES.map(pt => {
                      const PtIcon = pt.icon;
                      const isSelected = newProjType === pt.id;
                      return (
                        <button
                          key={pt.id}
                          onClick={() => {
                            setNewProjType(pt.id);
                            if (!newProjInstructions || newProjInstructions === (PROJECT_TYPES.find(t => t.id === newProjType)?.defaultInstructions ?? "")) {
                              setNewProjInstructions(pt.defaultInstructions);
                            }
                          }}
                          className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border transition-all text-center ${
                            isSelected
                              ? "bg-primary/10 border-primary/40 text-foreground"
                              : "bg-secondary/20 border-border/30 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                          }`}
                        >
                          <PtIcon className={`w-4 h-4 ${isSelected ? pt.color : ""}`} />
                          <span className="text-[11px] font-medium leading-tight">{pt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <label className="text-xs font-semibold text-foreground/80 mb-1.5 block">
                    Project Instructions
                    <span className="ml-1 text-muted-foreground/50 font-normal">(AI সবসময় এটা মনে রাখবে)</span>
                  </label>
                  <textarea
                    value={newProjInstructions}
                    onChange={e => setNewProjInstructions(e.target.value)}
                    rows={4}
                    placeholder="Project কী করবে, কোথায় files আছে, কোন stack use হচ্ছে, কী করতে হবে — এখানে লেখো।"
                    className="w-full bg-background border border-border/50 rounded-xl px-3 py-2.5 text-xs text-foreground placeholder-muted-foreground/40 resize-none focus:outline-none focus:border-primary/50 leading-relaxed transition-colors"
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/30 bg-secondary/5">
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createProject}
                  disabled={!newProjName.trim() || creatingProject}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingProject
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                    : <><FolderPlus className="w-3.5 h-3.5" /> Create Project</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
