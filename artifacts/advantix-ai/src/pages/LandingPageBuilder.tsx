import { useState, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";
import {
  Send, Copy, Download, Monitor, Smartphone,
  Sparkles, Code2, Eye, EyeOff, RotateCcw, Loader2, Check, Wand2,
  ChevronRight, Globe, Layers, Zap, Terminal, FileCode,
  CheckCircle2, Circle, MessageSquare, Hammer,
} from "lucide-react";
import { useLocation } from "wouter";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type: "chat" | "build";
}

interface ActivityStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

const STARTER_PROMPTS = [
  { icon: <Globe className="w-4 h-4" />, label: "Business Website", prompt: "Create a professional business website for a digital marketing agency called 'Nova Digital'. Include a hero section, services (SEO, Social Media, Web Design), why choose us, and a contact form. Navy blue and gold theme." },
  { icon: <Layers className="w-4 h-4" />, label: "SaaS Landing Page", prompt: "Create a modern SaaS landing page for a project management tool called 'TaskFlow'. Hero with CTA, 6 features, pricing (Free, Pro $29/mo, Business $79/mo), testimonials, footer. Purple gradient theme." },
  { icon: <Zap className="w-4 h-4" />, label: "Restaurant", prompt: "Create a stunning landing page for 'Bella Italia' Italian restaurant. Full-screen hero, menu highlights, about us, gallery, reservations form, contact. Warm red and cream colors." },
  { icon: <Sparkles className="w-4 h-4" />, label: "Portfolio", prompt: "Create a creative portfolio for freelance designer Alex Chen. Hero with tagline, 6-project portfolio grid, skills, about me, contact. Dark theme with cyan accent." },
];

// ─── Intent detection ────────────────────────────────────────────────────────
const BUILD_VERBS = ["create", "build", "make", "generate", "design", "develop", "write", "code", "give me", "produce", "craft"];
const BUILD_NOUNS = ["landing page", "website", "web page", "page", "site", "lander", "homepage"];
const UPDATE_VERBS = ["change", "update", "add", "remove", "delete", "modify", "fix", "adjust", "replace", "switch", "move", "rename", "edit", "revise", "redo", "rewrite", "improve", "make it", "can you add", "also add", "now add", "put"];

function isBuildIntent(prompt: string, hasHtml: boolean): boolean {
  const lower = prompt.toLowerCase().trim();

  // Update intent (only counts if page already exists)
  if (hasHtml) {
    for (const verb of UPDATE_VERBS) {
      if (lower.includes(verb)) return true;
    }
  }

  // Build intent — verb + noun
  for (const verb of BUILD_VERBS) {
    if (lower.includes(verb)) {
      for (const noun of BUILD_NOUNS) {
        if (lower.includes(noun)) return true;
      }
      // Short prompts that just describe what to build without explicit noun
      if (lower.length < 120 && (lower.includes("for") || lower.includes("with") || lower.includes("about"))) return true;
    }
  }

  // Quick explicit phrases
  if (/^(build|create|make|generate|design)\s/i.test(lower)) return true;

  return false;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function extractHtml(text: string): string {
  const doctypeMatch = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doctypeMatch) return doctypeMatch[0];
  const htmlTagMatch = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlTagMatch) return htmlTagMatch[0];
  const fenceMatch = text.match(/```html\n([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1];
  const genericFence = text.match(/```\n([\s\S]*?)```/);
  if (genericFence) return genericFence[1];
  return text;
}

// ─── Generation activity panel ───────────────────────────────────────────────
function buildSteps(content: string, done: boolean): ActivityStep[] {
  const hasDoctype = /<!DOCTYPE/i.test(content);
  const hasStyle = /<style/i.test(content);
  const hasBody = /<body/i.test(content);
  const hasSection = /<section|<div class="hero|<main/i.test(content);
  const hasFooter = /<footer/i.test(content);
  const hasHtmlClose = /<\/html>/i.test(content);

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
    { id: "footer", label: "Adding footer & links", status: s(hasFooter, hasHtmlClose), detail: "Navigation, social links, contact" },
    { id: "done", label: "Page ready", status: done ? "done" : hasHtmlClose ? "active" : "pending", detail: "Your landing page is complete!" },
  ];
}

function StepIcon({ status }: { status: ActivityStep["status"] }) {
  if (status === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === "active") return <Loader2 className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />;
}

function GenerationActivity({ streamedContent, done }: { streamedContent: string; done: boolean }) {
  const steps = buildSteps(streamedContent, done);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const lines = streamedContent.split("\n");
  const visibleLines = lines.slice(Math.max(0, lines.length - 10));

  useEffect(() => {
    if (codeScrollRef.current) codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
  }, [streamedContent]);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/30">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Building your page</span>
        {!done ? (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] text-muted-foreground">{streamedContent.length.toLocaleString()} chars</span>
          </div>
        ) : (
          <span className="ml-auto text-[10px] text-emerald-400 font-medium">Complete</span>
        )}
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        {steps.map((step) => (
          <div key={step.id} className={`flex items-start gap-2 ${step.status === "pending" ? "opacity-35" : ""}`}>
            <div className="mt-0.5"><StepIcon status={step.status} /></div>
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-medium ${step.status === "active" ? "text-primary" : step.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {step.status !== "pending" && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {streamedContent.length > 0 && (
        <div className="border-t border-border/30">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20">
            <FileCode className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60 font-mono">landing-page.html</span>
            <div className="flex gap-1 ml-auto">
              {["bg-red-500/40", "bg-yellow-500/40", "bg-green-500/40"].map((c, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${c}`} />
              ))}
            </div>
          </div>
          <div ref={codeScrollRef} className="bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed overflow-y-auto max-h-[110px] scrollbar-none">
            {visibleLines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground/30 select-none w-5 text-right shrink-0">
                  {lines.length - visibleLines.length + i + 1}
                </span>
                <span className={`break-all ${/<[a-z]/i.test(line) ? "text-blue-300/80" : /^\s*[\w-]+\s*\{/.test(line) ? "text-yellow-300/80" : /^\s*[\w-]+\s*:/.test(line) ? "text-emerald-300/70" : "text-foreground/70"}`}>
                  {line || " "}
                </span>
              </div>
            ))}
            {!done && <div className="flex gap-2"><span className="text-muted-foreground/30 select-none w-5 text-right shrink-0">▶</span><span className="text-primary animate-pulse">█</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Simple markdown renderer ────────────────────────────────────────────────
function ChatText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="text-[11px] px-1 py-0.5 bg-muted/60 rounded font-mono text-primary/90">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function AssistantChatMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-sm text-foreground/90 leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("## ")) return <p key={i} className="font-semibold text-foreground mt-1">{line.slice(3)}</p>;
        if (line.startsWith("# ")) return <p key={i} className="font-bold text-foreground mt-1">{line.slice(2)}</p>;
        if (/^[-•]\s/.test(line)) return <p key={i} className="flex gap-1.5"><span className="text-primary shrink-0 mt-0.5">•</span><ChatText text={line.replace(/^[-•]\s/, "")} /></p>;
        if (/^\d+\.\s/.test(line)) {
          const [num, ...rest] = line.split(/\.\s/);
          return <p key={i} className="flex gap-1.5"><span className="text-primary shrink-0 font-medium mt-0.5">{num}.</span><ChatText text={rest.join(". ")} /></p>;
        }
        return <p key={i}><ChatText text={line} /></p>;
      })}
      {streaming && <span className="inline-block w-1.5 h-3.5 bg-primary/70 animate-pulse rounded-sm ml-0.5" />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPageBuilder() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [html, setHtml] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);
  const [streamedHtml, setStreamedHtml] = useState("");
  const [streamingChatId, setStreamingChatId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { if (!user) navigate("/auth"); }, [user]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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

    const buildMode = isBuildIntent(prompt, html.length > 0);

    if (buildMode) {
      await runBuild(prompt);
    } else {
      await runChat(prompt);
    }
  }

  async function runChat(prompt: string) {
    setGenerating(true);
    const placeholderIdx = messages.length + 1;
    const placeholder: ChatMessage = { role: "assistant", content: "", type: "chat" };
    setMessages(prev => [...prev, placeholder]);
    setStreamingChatId(placeholderIdx);

    try {
      const res = await fetch("/api/landing-page/chat", {
        method: "POST",
        credentials: "include",
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
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { toast.error(data.error); break; }
            if (data.done) break;
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: fullContent, type: "chat" };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setGenerating(false);
      setStreamingChatId(null);
    }
  }

  async function runBuild(prompt: string) {
    setGenerating(true);
    setGenerationDone(false);
    setStreamedHtml("");
    const buildPlaceholder: ChatMessage = { role: "assistant", content: "", type: "build" };
    setMessages(prev => [...prev, buildPlaceholder]);

    try {
      const res = await fetch("/api/landing-page/generate", {
        method: "POST",
        credentials: "include",
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
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { toast.error(data.error); break; }
            if (data.done) break;
            if (data.content) {
              fullContent += data.content;
              setStreamedHtml(fullContent);
            }
          } catch {}
        }
      }

      const extracted = extractHtml(fullContent);
      setHtml(extracted);
      setGenerationDone(true);
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: fullContent, type: "build" };
        return copy;
      });
      setTimeout(() => {
        setStreamedHtml("");
        setGenerationDone(false);
      }, 3000);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => prev.slice(0, -1));
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
    const a = document.createElement("a");
    a.href = url; a.download = "landing-page.html"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded landing-page.html");
  }

  function resetAll() {
    if (!confirm("Reset everything? Your generated page will be lost.")) return;
    setMessages([]); setHtml(""); setStreamedHtml(""); setInput("");
  }

  const hasContent = html.length > 0;
  const isBuilding = (generating || generationDone) && streamedHtml.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: "56px" }}>

        {/* ─── Left: Chat Panel ─────────────────────────────── */}
        <div className="w-[440px] shrink-0 flex flex-col border-r border-border/50 bg-background">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Landing Page Builder</p>
                <p className="text-[10px] text-muted-foreground">Chat + AI generation</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {hasContent && (
                <button onClick={resetAll} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title="Reset">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setShowPreview(v => !v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title={showPreview ? "Hide preview" : "Show preview"}>
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && !isBuilding ? (
              <div className="space-y-5">
                <div className="text-center pt-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Wand2 className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">Advantix AI — Landing Page Builder</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[300px] mx-auto">
                    Ask me anything about landing pages, or describe what you want and I'll build it instantly.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium px-1">Build a page instantly</p>
                  {STARTER_PROMPTS.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s.prompt)} disabled={generating}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group flex items-center gap-2.5 disabled:opacity-50">
                      <span className="text-primary/70 group-hover:text-primary transition-colors shrink-0">{s.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{s.prompt.substring(0, 55)}…</p>
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>

                <div className="px-3 py-2.5 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    <span className="text-foreground/50 font-medium">Tip:</span> You can also just chat — ask about best practices, design tips, or what sections to include.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "user" ? (
                      <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed">
                        {m.content}
                      </div>
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
                          <AssistantChatMessage content={m.content} streaming={streamingChatId === i && generating} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {/* Active build activity */}
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

                {/* Thinking spinner (before first chunk) */}
                {generating && !isBuilding && messages.length > 0 && messages[messages.length - 1].content === "" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 px-1">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                    </div>
                    <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40 inline-block">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom toolbar + input */}
          <div className="px-4 py-3 border-t border-border/50 shrink-0 space-y-2">
            {hasContent && (
              <div className="flex gap-1.5 items-center">
                <button onClick={copyHtml} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy HTML"}
                </button>
                <button onClick={downloadHtml} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all">
                  <Download className="w-3 h-3" />
                  Download
                </button>
                <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
                  <Code2 className="w-3 h-3" />
                  {html.length.toLocaleString()} chars
                </div>
              </div>
            )}

            <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border/50 px-3 py-2 focus-within:border-primary/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                onKeyDown={handleKeyDown}
                placeholder={hasContent ? "Ask me anything, or describe changes to build…" : "Ask me anything, or describe a page to build…"}
                disabled={generating}
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/50 min-h-[24px] max-h-[120px]"
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || generating}
                className="shrink-0 w-7 h-7 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity">
                {generating ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" /> : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/40 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* ─── Right: Preview Panel ──────────────────────────── */}
        {showPreview && (
          <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between shrink-0 bg-background">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
                {generating && isBuilding && (
                  <div className="flex items-center gap-1 text-primary">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px]">Generating…</span>
                  </div>
                )}
                {!generating && hasContent && (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-[10px]">Ready</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                <button onClick={() => setPreviewDevice("desktop")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${previewDevice === "desktop" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Monitor className="w-3 h-3" />Desktop
                </button>
                <button onClick={() => setPreviewDevice("mobile")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${previewDevice === "mobile" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Smartphone className="w-3 h-3" />Mobile
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-start justify-center overflow-auto p-6 bg-[#1a1a2e]">
              {generating && isBuilding && !html ? (
                <div className="w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl" style={{ maxWidth: previewDevice === "mobile" ? "390px" : "1280px" }}>
                  <div className="h-1.5 bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary/60 w-1/3 animate-[pulse_1.5s_ease-in-out_infinite]" style={{ animation: "slideRight 2s ease-in-out infinite" }} />
                  </div>
                  <div className="bg-zinc-900 p-8 space-y-6" style={{ minHeight: "500px" }}>
                    <div className="space-y-3">
                      <div className="h-8 bg-white/5 rounded-lg w-2/3 animate-pulse" />
                      <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse" />
                      <div className="h-10 bg-primary/20 rounded-lg w-40 animate-pulse mt-4" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-8">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="bg-white/5 rounded-xl p-4 space-y-2 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}>
                          <div className="w-8 h-8 bg-white/10 rounded-lg" />
                          <div className="h-3 bg-white/10 rounded w-3/4" />
                          <div className="h-3 bg-white/10 rounded w-full" />
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 space-y-2">
                      {[0, 1, 2].map(i => <div key={i} className="h-3 bg-white/5 rounded animate-pulse" />)}
                    </div>
                  </div>
                </div>
              ) : !html ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4 -mt-10">
                  <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Globe className="w-10 h-10 text-white/15" />
                  </div>
                  <div>
                    <p className="text-white/30 text-sm font-medium">No page generated yet</p>
                    <p className="text-white/15 text-xs mt-1">Tell me what to build and it'll appear here instantly</p>
                  </div>
                  <div className="flex items-center gap-2 text-white/15 text-xs">
                    <Hammer className="w-3.5 h-3.5" />
                    <span>Try: "Build a SaaS landing page for my startup"</span>
                  </div>
                </div>
              ) : (
                <div className="transition-all duration-300 shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/20"
                  style={{ width: previewDevice === "mobile" ? "390px" : "100%", maxWidth: previewDevice === "desktop" ? "1280px" : "390px", minHeight: "600px" }}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border-b border-white/10">
                    {["bg-red-500/60", "bg-yellow-500/60", "bg-green-500/60"].map((c, i) => (
                      <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
                    ))}
                    <div className="flex-1 mx-2 bg-white/10 rounded text-[10px] text-white/30 px-2 py-0.5 font-mono">
                      landing-page.html
                    </div>
                  </div>
                  <iframe
                    ref={iframeRef}
                    srcDoc={html}
                    title="Landing Page Preview"
                    sandbox="allow-scripts allow-forms"
                    className="w-full border-0 bg-white"
                    style={{ height: "calc(100vh - 200px)", minHeight: "560px", display: "block" }}
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
