import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";
import {
  Send, Copy, Download, Monitor, Smartphone,
  Sparkles, Code2, Eye, EyeOff, RotateCcw, Loader2, Check, Wand2,
  ChevronRight, Globe, Layers, Zap, Terminal, FileCode,
  CheckCircle2, Circle, Plus, Trash2, Clock, ArrowLeft, Pencil,
  Hammer,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type: "chat" | "build";
}

interface Project {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ActivityStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

// ─── Intent detection ─────────────────────────────────────────────────────────
const BUILD_VERBS = ["create", "build", "make", "generate", "design", "develop", "write", "code", "give me", "produce", "craft"];
const BUILD_NOUNS = ["landing page", "website", "web page", "page", "site", "lander", "homepage"];
const UPDATE_VERBS = ["change", "update", "add", "remove", "delete", "modify", "fix", "adjust", "replace", "switch", "move", "rename", "edit", "revise", "redo", "rewrite", "improve", "make it", "can you add", "also add", "now add", "put"];

function isBuildIntent(prompt: string, hasHtml: boolean): boolean {
  const lower = prompt.toLowerCase().trim();
  if (hasHtml) {
    for (const v of UPDATE_VERBS) if (lower.includes(v)) return true;
  }
  for (const v of BUILD_VERBS) {
    if (lower.includes(v)) {
      for (const n of BUILD_NOUNS) if (lower.includes(n)) return true;
      if (lower.length < 120 && (lower.includes("for") || lower.includes("with") || lower.includes("about"))) return true;
    }
  }
  if (/^(build|create|make|generate|design)\s/i.test(lower)) return true;
  return false;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function extractHtml(text: string): string {
  const d = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (d) return d[0];
  const h = text.match(/<html[\s\S]*<\/html>/i);
  if (h) return h[0];
  const f = text.match(/```html\n([\s\S]*?)```/i);
  if (f) return f[1];
  const g = text.match(/```\n([\s\S]*?)```/);
  if (g) return g[1];
  return text;
}

function extractProjectName(html: string, fallback = "Untitled Project"): string {
  const t = html.match(/<title[^>]*>([^<]{1,60})<\/title>/i);
  if (t) return t[1].trim();
  const h = html.match(/<h1[^>]*>([^<]{1,60})<\/h1>/i);
  if (h) return h[1].replace(/<[^>]+>/g, "").trim();
  return fallback;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Generation activity ──────────────────────────────────────────────────────
function buildSteps(content: string, done: boolean): ActivityStep[] {
  const hasDoctype = /<!DOCTYPE/i.test(content);
  const hasStyle = /<style/i.test(content);
  const hasBody = /<body/i.test(content);
  const hasSection = /<section|<div class="hero|<main/i.test(content);
  const hasFooter = /<footer/i.test(content);
  const hasClose = /<\/html>/i.test(content);

  function s(reached: boolean, next: boolean): ActivityStep["status"] {
    if (done && reached) return "done";
    if (reached && !next) return "active";
    if (reached) return "done";
    return "pending";
  }

  return [
    { id: "plan", label: "Analyzing request", status: done ? "done" : content.length > 0 ? "done" : "active", detail: "Understanding what you need" },
    { id: "structure", label: "Writing HTML structure", status: s(hasDoctype, hasStyle), detail: "<!DOCTYPE html>, <head>, metadata" },
    { id: "styles", label: "Designing CSS styles", status: s(hasStyle, hasBody), detail: "Colors, fonts, layout, animations" },
    { id: "hero", label: "Building hero section", status: s(hasBody, hasSection), detail: "Main banner and call-to-action" },
    { id: "sections", label: "Adding page sections", status: s(hasSection, hasFooter), detail: "Features, about, services, testimonials" },
    { id: "footer", label: "Adding footer & links", status: s(hasFooter, hasClose), detail: "Navigation, social links, contact" },
    { id: "done", label: "Page ready", status: done ? "done" : hasClose ? "active" : "pending", detail: "Your landing page is complete!" },
  ];
}

function StepIcon({ status }: { status: ActivityStep["status"] }) {
  if (status === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === "active") return <Loader2 className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />;
}

function GenerationActivity({ streamedContent, done }: { streamedContent: string; done: boolean }) {
  const steps = buildSteps(streamedContent, done);
  const codeRef = useRef<HTMLDivElement>(null);
  const lines = streamedContent.split("\n");
  const visible = lines.slice(Math.max(0, lines.length - 10));
  useEffect(() => { if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight; }, [streamedContent]);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/30">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Building your page</span>
        {done ? <span className="ml-auto text-[10px] text-emerald-400 font-medium">Complete ✓</span> : (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] text-muted-foreground">{streamedContent.length.toLocaleString()} chars</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        {steps.map(step => (
          <div key={step.id} className={`flex items-start gap-2 ${step.status === "pending" ? "opacity-35" : ""}`}>
            <div className="mt-0.5"><StepIcon status={step.status} /></div>
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-medium ${step.status === "active" ? "text-primary" : step.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              {step.status !== "pending" && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.detail}</p>}
            </div>
          </div>
        ))}
      </div>
      {streamedContent.length > 0 && (
        <div className="border-t border-border/30">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20">
            <FileCode className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 font-mono">landing-page.html</span>
            <div className="flex gap-1 ml-auto">{["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c,i)=><div key={i} className={`w-2 h-2 rounded-full ${c}`}/>)}</div>
          </div>
          <div ref={codeRef} className="bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed overflow-y-auto max-h-[110px] scrollbar-none">
            {visible.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground/30 select-none w-5 text-right shrink-0">{lines.length - visible.length + i + 1}</span>
                <span className={`break-all ${/<[a-z]/i.test(line) ? "text-blue-300/80" : /^\s*[\w-]+\s*\{/.test(line) ? "text-yellow-300/80" : /^\s*[\w-]+\s*:/.test(line) ? "text-emerald-300/70" : "text-foreground/70"}`}>{line || " "}</span>
              </div>
            ))}
            {!done && <div className="flex gap-2"><span className="text-muted-foreground/30 select-none w-5 text-right shrink-0">▶</span><span className="text-primary animate-pulse">█</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat message renderer ────────────────────────────────────────────────────
function ChatText({ text }: { text: string }) {
  return (
    <span>{text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/).map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2,-2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1,-1)}</em>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="text-[11px] px-1 py-0.5 bg-muted/60 rounded font-mono text-primary/90">{p.slice(1,-1)}</code>;
      return <span key={i}>{p}</span>;
    })}</span>
  );
}

function AssistantChatMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="space-y-1.5 text-sm text-foreground/90 leading-relaxed">
      {content.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("## ")) return <p key={i} className="font-semibold text-foreground mt-1">{line.slice(3)}</p>;
        if (/^[-•]\s/.test(line)) return <p key={i} className="flex gap-1.5"><span className="text-primary shrink-0 mt-0.5">•</span><ChatText text={line.replace(/^[-•]\s/,"")} /></p>;
        if (/^\d+\.\s/.test(line)) { const [n,...r]=line.split(/\.\s/); return <p key={i} className="flex gap-1.5"><span className="text-primary shrink-0 font-medium mt-0.5">{n}.</span><ChatText text={r.join(". ")} /></p>; }
        return <p key={i}><ChatText text={line} /></p>;
      })}
      {streaming && <span className="inline-block w-1.5 h-3.5 bg-primary/70 animate-pulse rounded-sm ml-0.5" />}
    </div>
  );
}

// ─── Projects Home Screen ─────────────────────────────────────────────────────
function ProjectsHome({
  projects, loading, onOpen, onNew, onDelete,
}: {
  projects: Project[];
  loading: boolean;
  onOpen: (p: Project) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">My Projects</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Pick up where you left off</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          New Page
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
            <Globe className="w-7 h-7 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "New Page" to create your first landing page</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => onOpen(p)}
              className="group flex items-center gap-3 px-3 py-3 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-primary/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-[11px] text-muted-foreground/60">{timeAgo(p.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) onDelete(p.id); }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPageBuilder() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  // Project list
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [view, setView] = useState<"projects" | "editor">("projects");

  // Active project
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [editingName, setEditingName] = useState(false);

  // Editor state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [html, setHtml] = useState("");
  const [streamedHtml, setStreamedHtml] = useState("");
  const [streamingChatIdx, setStreamingChatIdx] = useState<number | null>(null);

  // Preview
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!user) navigate("/auth"); }, [user]);
  useEffect(() => { if (user) fetchProjects(); }, [user]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── API helpers ────────────────────────────────────────────────────────────
  async function fetchProjects() {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/landing-page/projects", { credentials: "include" });
      if (res.ok) setProjects(await res.json());
    } catch {}
    setProjectsLoading(false);
  }

  async function createProject(name: string, htmlContent: string, msgs: ChatMessage[]) {
    const res = await fetch("/api/landing-page/projects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, html: htmlContent, messages: msgs }),
    });
    if (!res.ok) throw new Error("Save failed");
    const project = await res.json();
    setActiveProjectId(project.id);
    setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]);
    return project;
  }

  async function updateProject(id: number, patch: { name?: string; html?: string; messages?: ChatMessage[] }) {
    const res = await fetch(`/api/landing-page/projects/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Update failed");
    const updated = await res.json();
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    return updated;
  }

  async function deleteProject(id: number) {
    await fetch(`/api/landing-page/projects/${id}`, { method: "DELETE", credentials: "include" });
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  async function openProject(p: Project) {
    try {
      const res = await fetch(`/api/landing-page/projects/${p.id}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const full = await res.json();
      setActiveProjectId(full.id);
      setProjectName(full.name);
      setHtml(full.html || "");
      setMessages(Array.isArray(full.messages) ? full.messages : []);
      setStreamedHtml("");
      setView("editor");
    } catch {
      toast.error("Failed to open project");
    }
  }

  function openNewProject() {
    setActiveProjectId(null);
    setProjectName("Untitled Project");
    setHtml("");
    setMessages([]);
    setStreamedHtml("");
    setInput("");
    setView("editor");
  }

  // Auto-save (debounced) after html/messages change
  const scheduleSave = useCallback((currentHtml: string, currentMsgs: ChatMessage[], currentName: string, projectId: number | null) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (projectId) {
          await updateProject(projectId, { html: currentHtml, messages: currentMsgs, name: currentName });
        } else if (currentHtml) {
          await createProject(currentName, currentHtml, currentMsgs);
        }
      } catch {}
    }, 1500);
  }, []);

  // ── Messaging ──────────────────────────────────────────────────────────────
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  async function sendMessage(prompt: string) {
    if (!prompt.trim() || generating) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const userMsg: ChatMessage = { role: "user", content: prompt, type: "chat" };
    setMessages(prev => [...prev, userMsg]);
    if (isBuildIntent(prompt, html.length > 0)) await runBuild(prompt);
    else await runChat(prompt);
  }

  async function runChat(prompt: string) {
    setGenerating(true);
    const idx = messages.length + 1;
    setStreamingChatIdx(idx);
    setMessages(prev => [...prev, { role: "assistant", content: "", type: "chat" }]);

    try {
      const res = await fetch("/api/landing-page/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          messages: messages.slice(-8).map(m => ({
            role: m.role,
            content: m.type === "build" && m.content.length > 200 ? "[Previously generated landing page]" : m.content,
          })),
        }),
      });
      if (!res.ok || !res.body) throw new Error("Chat failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) { toast.error(d.error); break; }
            if (d.done) break;
            if (d.content) { full += d.content; setMessages(prev => { const c=[...prev]; c[c.length-1]={role:"assistant",content:full,type:"chat"}; return c; }); }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => prev.slice(0,-1));
    } finally {
      setGenerating(false);
      setStreamingChatIdx(null);
    }
  }

  async function runBuild(prompt: string) {
    setGenerating(true);
    setGenerationDone(false);
    setStreamedHtml("");
    setMessages(prev => [...prev, { role: "assistant", content: "", type: "build" }]);

    try {
      const res = await fetch("/api/landing-page/generate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentHtml: html || undefined,
          messages: messages.slice(-4).map(m => ({
            role: m.role,
            content: m.type === "build" && m.content.length > 200 ? "[Previously generated HTML]" : m.content,
          })),
        }),
      });
      if (!res.ok || !res.body) throw new Error("Generation failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) { toast.error(d.error); break; }
            if (d.done) break;
            if (d.content) { full += d.content; setStreamedHtml(full); }
          } catch {}
        }
      }
      const extracted = extractHtml(full);
      const autoName = extractProjectName(extracted, projectName === "Untitled Project" ? extractProjectName(extracted) : projectName);
      setHtml(extracted);
      setGenerationDone(true);
      const updatedMsgs: ChatMessage[] = [...messages, { role: "user", content: prompt, type: "chat" }, { role: "assistant", content: full, type: "build" }];
      setMessages(prev => { const c=[...prev]; c[c.length-1]={role:"assistant",content:full,type:"build"}; return c; });

      // Auto-name on first build
      if (projectName === "Untitled Project") setProjectName(autoName);

      // Auto-save
      scheduleSave(extracted, updatedMsgs, autoName, activeProjectId);

      setTimeout(() => { setStreamedHtml(""); setGenerationDone(false); }, 3000);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => prev.slice(0,-1));
    } finally {
      setGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  function copyHtml() {
    if (!html) return;
    navigator.clipboard.writeText(html);
    setCopied(true);
    toast.success("HTML copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${projectName.toLowerCase().replace(/\s+/g,"-")}.html`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded HTML file");
  }

  async function handleNameSave(newName: string) {
    setEditingName(false);
    if (!newName.trim() || newName === projectName) return;
    setProjectName(newName);
    if (activeProjectId) {
      try { await updateProject(activeProjectId, { name: newName }); } catch {}
    }
  }

  function goBack() {
    setView("projects");
    fetchProjects();
  }

  const hasContent = html.length > 0;
  const isBuilding = (generating || generationDone) && streamedHtml.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: "56px" }}>

        {/* ─── Left Panel ─────────────────────────────────────── */}
        <div className="w-[440px] shrink-0 flex flex-col border-r border-border/50 bg-background">

          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {view === "editor" && (
                <button onClick={goBack} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors mr-1">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Wand2 className="w-3.5 h-3.5 text-primary" />
              </div>
              {view === "projects" ? (
                <div>
                  <p className="text-sm font-semibold">Landing Page Builder</p>
                  <p className="text-[10px] text-muted-foreground">Chat + AI generation</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  {editingName ? (
                    <input
                      autoFocus
                      defaultValue={projectName}
                      onBlur={e => handleNameSave(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleNameSave((e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingName(false); }}
                      className="text-sm font-semibold bg-muted/30 border border-border/50 rounded px-2 py-0.5 outline-none focus:border-primary/50 min-w-0 max-w-[180px]"
                    />
                  ) : (
                    <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 group min-w-0">
                      <p className="text-sm font-semibold truncate max-w-[160px]">{projectName}</p>
                      <Pencil className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {view === "editor" && (
                <button onClick={() => setShowPreview(v => !v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title={showPreview ? "Hide preview" : "Show preview"}>
                  {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Content area */}
          {view === "projects" ? (
            <ProjectsHome
              projects={projects}
              loading={projectsLoading}
              onOpen={openProject}
              onNew={openNewProject}
              onDelete={async (id) => { await deleteProject(id); }}
            />
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 && !isBuilding ? (
                  <div className="space-y-4 pt-2">
                    <div className="text-center">
                      <p className="text-sm font-semibold">Ready to build</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Describe your page, ask for advice, or just chat.</p>
                    </div>
                    <div className="px-3 py-3 rounded-xl bg-muted/20 border border-border/30 space-y-2">
                      <p className="text-[11px] text-muted-foreground/70 font-medium">Examples</p>
                      {[
                        "Create a SaaS landing page for my project management tool",
                        "What sections should a good ecommerce landing page have?",
                        "Build a dark-themed portfolio page for a photographer",
                      ].map((ex, i) => (
                        <button key={i} onClick={() => sendMessage(ex)} disabled={generating}
                          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 flex items-start gap-2 group transition-colors disabled:opacity-50">
                          <ChevronRight className="w-3 h-3 text-primary/50 shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        {m.role === "user" ? (
                          <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed">{m.content}</div>
                        ) : m.type === "build" && m.content.length > 0 ? (
                          <div className="w-full space-y-1">
                            <div className="flex items-center gap-1.5 px-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20 font-medium ml-1">builder</span>
                            </div>
                            <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40">
                              <div className="flex items-center gap-2 text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">Page built ({m.content.length.toLocaleString()} chars) — see preview →</span>
                              </div>
                            </div>
                          </div>
                        ) : m.type === "chat" && m.content.length > 0 ? (
                          <div className="max-w-[92%] space-y-1 w-full">
                            <div className="flex items-center gap-1.5 px-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                            </div>
                            <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40">
                              <AssistantChatMessage content={m.content} streaming={streamingChatIdx === i && generating} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {isBuilding && (
                      <div className="space-y-2 w-full">
                        <div className="flex items-center gap-1.5 px-1">
                          <Sparkles className="w-3 h-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20 font-medium ml-1">builder</span>
                        </div>
                        <GenerationActivity streamedContent={streamedHtml} done={generationDone} />
                      </div>
                    )}

                    {generating && !isBuilding && messages[messages.length-1]?.content === "" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 px-1">
                          <Sparkles className="w-3 h-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                        </div>
                        <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40 inline-block">
                          <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-border/50 shrink-0 space-y-2">
                {hasContent && (
                  <div className="flex gap-1.5 items-center">
                    <button onClick={copyHtml} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all">
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy HTML"}
                    </button>
                    <button onClick={downloadHtml} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all">
                      <Download className="w-3 h-3" />Download
                    </button>
                    <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
                      <Code2 className="w-3 h-3" />{html.length.toLocaleString()} chars
                    </div>
                  </div>
                )}
                <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border/50 px-3 py-2 focus-within:border-primary/50 transition-colors">
                  <textarea ref={textareaRef} value={input}
                    onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                    onKeyDown={handleKeyDown}
                    placeholder={hasContent ? "Ask me anything, or describe changes to build…" : "Ask me anything, or describe a page to build…"}
                    disabled={generating} rows={1}
                    className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/50 min-h-[24px] max-h-[120px]"
                  />
                  <button onClick={() => sendMessage(input)} disabled={!input.trim() || generating}
                    className="shrink-0 w-7 h-7 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity">
                    {generating ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" /> : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/40 text-center">Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>

        {/* ─── Right: Preview ──────────────────────────────────── */}
        {(view === "editor") && showPreview && (
          <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between shrink-0 bg-background">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
                {generating && isBuilding && <div className="flex items-center gap-1 text-primary"><div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /><span className="text-[10px]">Generating…</span></div>}
                {!generating && hasContent && <div className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" /><span className="text-[10px]">Ready</span></div>}
              </div>
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                {(["desktop","mobile"] as const).map(d => (
                  <button key={d} onClick={() => setPreviewDevice(d)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${previewDevice===d?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
                    {d === "desktop" ? <Monitor className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                    {d.charAt(0).toUpperCase()+d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex items-start justify-center overflow-auto p-6 bg-[#1a1a2e]">
              {generating && isBuilding && !html ? (
                <div className="w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl" style={{ maxWidth: previewDevice==="mobile"?"390px":"1280px" }}>
                  <div className="bg-zinc-900 p-8 space-y-6" style={{ minHeight:"500px" }}>
                    <div className="space-y-3"><div className="h-8 bg-white/5 rounded-lg w-2/3 animate-pulse"/><div className="h-4 bg-white/5 rounded w-1/2 animate-pulse"/><div className="h-10 bg-primary/20 rounded-lg w-40 animate-pulse mt-4"/></div>
                    <div className="grid grid-cols-3 gap-4 pt-8">{[0,1,2].map(i=><div key={i} className="bg-white/5 rounded-xl p-4 space-y-2 animate-pulse"><div className="w-8 h-8 bg-white/10 rounded-lg"/><div className="h-3 bg-white/10 rounded w-3/4"/><div className="h-3 bg-white/10 rounded w-full"/></div>)}</div>
                  </div>
                </div>
              ) : !html ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4 -mt-10">
                  <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center"><Globe className="w-10 h-10 text-white/15"/></div>
                  <div><p className="text-white/30 text-sm font-medium">No page yet</p><p className="text-white/15 text-xs mt-1">Tell me what to build and it'll appear here</p></div>
                  <div className="flex items-center gap-2 text-white/15 text-xs"><Hammer className="w-3.5 h-3.5"/><span>Try: "Build a SaaS landing page"</span></div>
                </div>
              ) : (
                <div className="transition-all duration-300 shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/20"
                  style={{ width:previewDevice==="mobile"?"390px":"100%", maxWidth:previewDevice==="desktop"?"1280px":"390px", minHeight:"600px" }}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border-b border-white/10">
                    {["bg-red-500/60","bg-yellow-500/60","bg-green-500/60"].map((c,i)=><div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`}/>)}
                    <div className="flex-1 mx-2 bg-white/10 rounded text-[10px] text-white/30 px-2 py-0.5 font-mono">{projectName.toLowerCase().replace(/\s+/g,"-")}.html</div>
                  </div>
                  <iframe ref={iframeRef} srcDoc={html} title="Landing Page Preview"
                    sandbox="allow-scripts allow-forms" className="w-full border-0 bg-white"
                    style={{ height:"calc(100vh - 200px)", minHeight:"560px", display:"block" }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
