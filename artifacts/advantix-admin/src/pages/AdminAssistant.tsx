import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Bot, User, ChevronDown, Wrench, CheckCircle2, Loader2, AlertCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Types ───────────────────────────────────────────────────────────────── */
type ToolStatus = "running" | "done" | "error";

interface ToolEvent {
  id: string;
  name: string;
  status: ToolStatus;
  result?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
  error?: string;
}

/* ── Tool name formatter ─────────────────────────────────────────────────── */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Markdown-ish renderer (no extra dep) ────────────────────────────────── */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^#{1,2} (.+)$/gm, '<h2 class="text-base font-semibold mt-3 mb-1">$1</h2>')
    .replace(/^#{3,} (.+)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-0.5">$1</h3>')
    .replace(/^---+$/gm, '<hr class="border-border my-2" />')
    .replace(/\n/g, "<br />");
}

/* ── Copy button ─────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Tool card ───────────────────────────────────────────────────────────── */
function ToolCard({ event }: { event: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden transition-colors",
      event.status === "running" && "border-blue-500/30 bg-blue-500/5",
      event.status === "done" && "border-green-500/30 bg-green-500/5",
      event.status === "error" && "border-red-500/30 bg-red-500/5",
    )}>
      <button
        onClick={() => event.result && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {event.status === "running" && <Loader2 className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" />}
        {event.status === "done"    && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
        {event.status === "error"   && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
        <Wrench className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground">{formatToolName(event.name)}</span>
        {event.status === "running" && <span className="text-muted-foreground ml-auto">Running…</span>}
        {event.result && (
          <ChevronDown className={cn("w-3 h-3 ml-auto text-muted-foreground transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && event.result && (
        <div className="px-3 pb-2 border-t border-border/50">
          <pre className="mt-1.5 whitespace-pre-wrap text-muted-foreground font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto">
            {event.result}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Message bubble ──────────────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-500"
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={cn("flex flex-col gap-1.5 max-w-[85%]", isUser && "items-end")}>
        {/* Tool events */}
        {msg.toolEvents && msg.toolEvents.length > 0 && (
          <div className="flex flex-col gap-1 w-full min-w-[260px]">
            {msg.toolEvents.map(ev => <ToolCard key={ev.id} event={ev} />)}
          </div>
        )}

        {/* Text content */}
        {msg.content && (
          <div className={cn(
            "group relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border text-card-foreground rounded-tl-sm",
          )}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div
                className="prose-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
            )}
            {!isUser && (
              <div className="absolute top-2 right-2">
                <CopyButton text={msg.content} />
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {msg.error && (
          <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {msg.error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Suggested prompts ───────────────────────────────────────────────────── */
const SUGGESTIONS = [
  "Show me the dashboard overview",
  "List all pending tasks",
  "Show recent contacts and leads",
  "List unread inbox messages",
  "Show published blog posts",
  "Generate an invoice for a client",
];

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function AdminAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const clearHistory = async () => {
    try {
      await fetch("/api/admin/assistant/history", { method: "DELETE", credentials: "include" });
      setMessages([]);
      toast({ title: "Conversation cleared" });
    } catch {
      toast({ title: "Failed to clear history", variant: "destructive" });
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || streaming) return;

    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: userText };
    const assistantId = `a${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", toolEvents: [] };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/admin/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));

            if (ev.type === "text_delta") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + ev.text } : m
              ));
            } else if (ev.type === "tool_start") {
              const toolId = `t${Date.now()}-${ev.tool}`;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolEvents: [...(m.toolEvents ?? []), { id: toolId, name: ev.tool, status: "running" }] }
                  : m
              ));
            } else if (ev.type === "tool_result") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                    ...m,
                    toolEvents: (m.toolEvents ?? []).map(t =>
                      t.name === ev.tool && t.status === "running"
                        ? { ...t, status: "done" as ToolStatus, result: ev.result }
                        : t
                    ),
                  }
                  : m
              ));
            } else if (ev.type === "error") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, error: ev.message } : m
              ));
            }
          } catch { /**/ }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, error: String(err) } : m
      ));
    } finally {
      setStreaming(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [streaming, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Admin Assistant</h1>
            <p className="text-xs text-muted-foreground">Full access to all admin operations</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory} className="gap-2 text-muted-foreground">
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto">
                <Bot className="w-7 h-7 text-violet-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Advantix Admin Assistant</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                I can manage tasks, blog, portfolio, team, users, inbox, leads, analytics, and more. Just ask.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-2xl w-full">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-violet-500/30 transition-colors text-sm text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}

        {/* Streaming indicator (tool running but no text yet) */}
        {streaming && messages.at(-1)?.role === "assistant" && !messages.at(-1)?.content && !messages.at(-1)?.toolEvents?.length && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-violet-500" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end bg-card border border-border rounded-2xl px-4 py-3 shadow-sm focus-within:border-violet-500/50 transition-colors">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything — manage tasks, blog posts, team members, send emails…"
              className="flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 min-h-[20px] max-h-[160px] shadow-none"
              rows={1}
              disabled={streaming}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              size="icon"
              className={cn(
                "shrink-0 w-8 h-8 rounded-xl transition-colors",
                input.trim() && !streaming ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> to send &nbsp;·&nbsp; <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </div>
  );
}
