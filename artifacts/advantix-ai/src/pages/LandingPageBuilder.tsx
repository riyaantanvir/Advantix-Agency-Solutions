import { useState, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";
import {
  Send, Copy, Download, RefreshCw, Monitor, Smartphone,
  Sparkles, Code2, Eye, EyeOff, RotateCcw, Loader2, Check, Wand2,
  ChevronRight, Globe, Layers, Zap,
} from "lucide-react";
import { useLocation } from "wouter";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  { icon: <Globe className="w-4 h-4" />, label: "Business Website", prompt: "Create a professional business website for a digital marketing agency called 'Nova Digital'. Include a hero section with a bold headline, services section (SEO, Social Media, Web Design), why choose us section, and a contact form. Use a navy blue and gold color scheme." },
  { icon: <Layers className="w-4 h-4" />, label: "SaaS Product", prompt: "Create a modern SaaS landing page for a project management tool called 'TaskFlow'. Include a hero with a CTA, features section with 6 features, pricing table with 3 tiers (Free, Pro $29/mo, Business $79/mo), testimonials, and footer. Use a purple gradient theme." },
  { icon: <Zap className="w-4 h-4" />, label: "Restaurant", prompt: "Create a stunning restaurant landing page for 'Bella Italia' Italian restaurant. Include a full-screen hero with appetizing background, menu highlights section, about us, gallery section, reservations form, and contact info. Use warm red and cream colors." },
  { icon: <Sparkles className="w-4 h-4" />, label: "Portfolio", prompt: "Create a creative portfolio landing page for a freelance graphic designer named Alex Chen. Include a hero with name and tagline, portfolio grid showing 6 projects, skills section, about me, and contact section. Use a dark theme with cyan accent color." },
];

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

export default function LandingPageBuilder() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [html, setHtml] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);
  const [streamedHtml, setStreamedHtml] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!user) navigate("/auth");
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  async function generate(prompt: string) {
    if (!prompt.trim() || generating) return;

    const newUserMsg: ChatMessage = { role: "user", content: prompt };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setGenerating(true);
    setStreamedHtml("");

    const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      const res = await fetch("/api/landing-page/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentHtml: html || undefined,
          messages: messages.slice(-6),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Generation failed");
      }

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
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              toast.error(data.error);
              break;
            }
            if (data.done) break;
            if (data.content) {
              fullContent += data.content;
              setStreamedHtml(fullContent);
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: fullContent };
                return copy;
              });
            }
          } catch {}
        }
      }

      const extracted = extractHtml(fullContent);
      setHtml(extracted);
      setStreamedHtml("");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generate(input);
    }
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
    a.href = url;
    a.download = "landing-page.html";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded landing-page.html");
  }

  function resetAll() {
    if (!confirm("Reset everything? Your generated page will be lost.")) return;
    setMessages([]);
    setHtml("");
    setStreamedHtml("");
    setInput("");
  }

  const hasContent = html.length > 0;
  const isStreaming = generating && streamedHtml.length > 0;
  const previewHtml = isStreaming ? extractHtml(streamedHtml) : html;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Navbar />

      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: "56px" }}>
        {/* ─── Left: Chat Panel ─────────────────────────────── */}
        <div className="w-[420px] shrink-0 flex flex-col border-r border-border/50 bg-background">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Landing Page Builder</p>
                <p className="text-[10px] text-muted-foreground">Powered by Claude</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {hasContent && (
                <button
                  onClick={resetAll}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowPreview(v => !v)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                title={showPreview ? "Hide preview" : "Show preview"}
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center pt-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Globe className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">Describe your landing page</p>
                  <p className="text-xs text-muted-foreground mt-1">Tell the AI what kind of page you need, and it'll generate the HTML instantly</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium px-1">Quick starts</p>
                  {STARTER_PROMPTS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => generate(s.prompt)}
                      disabled={generating}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group flex items-center gap-2.5"
                    >
                      <span className="text-primary/70 group-hover:text-primary transition-colors shrink-0">
                        {s.icon}
                      </span>
                      <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">{s.label}</span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] space-y-1">
                      <div className="flex items-center gap-1.5 px-1">
                        <Sparkles className="w-3 h-3 text-primary" />
                        <span className="text-[10px] text-muted-foreground font-medium">Advantix AI</span>
                      </div>
                      <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40 text-sm leading-relaxed">
                        {m.content ? (
                          m.content.includes("<!DOCTYPE") || m.content.includes("<html") ? (
                            <div className="flex items-center gap-2 text-emerald-400">
                              <Code2 className="w-3.5 h-3.5" />
                              <span className="text-xs font-medium">HTML generated — check the preview →</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{m.content}</span>
                          )
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="text-xs">Generating your landing page...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border/50 shrink-0">
            {hasContent && (
              <div className="flex gap-1.5 mb-2">
                <button
                  onClick={copyHtml}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy HTML"}
                </button>
                <button
                  onClick={downloadHtml}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-border/40 transition-all"
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border/50 px-3 py-2 focus-within:border-primary/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                onKeyDown={handleKeyDown}
                placeholder={hasContent ? "Describe changes (e.g. 'change the color to green', 'add a FAQ section')…" : "Describe your landing page…"}
                disabled={generating}
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/50 min-h-[24px] max-h-[120px]"
              />
              <button
                onClick={() => generate(input)}
                disabled={!input.trim() || generating}
                className="shrink-0 w-7 h-7 rounded-lg bg-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-primary-foreground" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

        {/* ─── Right: Preview Panel ──────────────────────────── */}
        {showPreview && (
          <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
            {/* Preview toolbar */}
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between shrink-0 bg-background">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Live Preview</span>
                {generating && (
                  <div className="flex items-center gap-1 text-primary">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span className="text-[10px]">Generating…</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${
                      previewDevice === "desktop"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Monitor className="w-3 h-3" />
                    Desktop
                  </button>
                  <button
                    onClick={() => setPreviewDevice("mobile")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${
                      previewDevice === "mobile"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Smartphone className="w-3 h-3" />
                    Mobile
                  </button>
                </div>
              </div>
            </div>

            {/* Preview area */}
            <div className="flex-1 flex items-start justify-center overflow-auto p-6 bg-[#1a1a2e]">
              {!previewHtml ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-white/20" />
                  </div>
                  <div>
                    <p className="text-white/40 text-sm font-medium">No page generated yet</p>
                    <p className="text-white/20 text-xs mt-1">Describe your landing page in the chat to get started</p>
                  </div>
                </div>
              ) : (
                <div
                  className="transition-all duration-300 shadow-2xl rounded-lg overflow-hidden bg-white"
                  style={{
                    width: previewDevice === "mobile" ? "390px" : "100%",
                    maxWidth: previewDevice === "desktop" ? "1280px" : "390px",
                    minHeight: "600px",
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    srcDoc={previewHtml}
                    title="Landing Page Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    className="w-full border-0"
                    style={{ height: "calc(100vh - 170px)", minHeight: "600px" }}
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
