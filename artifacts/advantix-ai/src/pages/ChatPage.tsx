import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { MessageRenderer } from "@/components/MessageRenderer";
import { toast } from "sonner";
import {
  Plus, Trash2, LogOut, ChevronLeft, Send, ThumbsUp, ThumbsDown,
  Sparkles, Code, Image, Brain, MessageSquare, Menu, X, Zap
} from "lucide-react";
import { Navbar } from "@/components/Navbar";

interface Session {
  id: number;
  title: string;
  updatedAt: string;
}

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  intentType?: string;
  feedback?: string | null;
  isStreaming?: boolean;
}

interface Routing {
  provider: string;
  model: string;
  label: string;
  intent: string;
}

const INTENT_ICONS: Record<string, React.ReactNode> = {
  image: <Image className="w-3 h-3" />,
  code: <Code className="w-3 h-3" />,
  reasoning: <Brain className="w-3 h-3" />,
  realtime: <Zap className="w-3 h-3" />,
  general: <Sparkles className="w-3 h-3" />,
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "text-emerald-400",
  anthropic: "text-orange-400",
  gemini: "text-blue-400",
  grok: "text-violet-400",
};

export default function ChatPage() {
  const { user, logout } = useUser();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [usage, setUsage] = useState<{ tokensUsed: number; costUsd: number; monthlyLimit: number | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSessions();
    loadUsage();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions", { credentials: "include" });
    if (res.ok) setSessions(await res.json());
  }

  async function loadUsage() {
    const res = await fetch("/api/ai/usage/me", { credentials: "include" });
    if (res.ok) setUsage(await res.json());
  }

  async function newSession() {
    const res = await fetch("/api/ai/sessions", { method: "POST", credentials: "include" });
    if (res.ok) {
      const s = await res.json();
      setSessions(prev => [s, ...prev]);
      selectSession(s);
    }
  }

  async function selectSession(s: Session) {
    setActiveSession(s);
    setMessages([]);
    const res = await fetch(`/api/ai/sessions/${s.id}/messages`, { credentials: "include" });
    if (res.ok) {
      const msgs = await res.json();
      setMessages(msgs.map((m: any) => ({
        id: m.id, role: m.role, content: m.content,
        provider: m.provider, model: m.model, intentType: m.intentType, feedback: m.feedback,
      })));
    }
  }

  async function deleteSession(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/ai/sessions/${id}`, { method: "DELETE", credentials: "include" });
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.id === id) { setActiveSession(null); setMessages([]); }
  }

  async function sendFeedback(messageId: number, feedback: "up" | "down") {
    await fetch("/api/ai/feedback", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, feedback }),
    });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback } : m));
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    if (!activeSession) { await newSession(); }

    const session = activeSession;
    if (!session) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const assistantMsg: Message = { role: "assistant", content: "", isStreaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    const currentInput = userMsg.content;

    try {
      const res = await fetch(`/api/ai/chat/${session.id}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let savedMsgId: number | undefined;
      // Buffer accumulates data across network chunks (critical for large image payloads)
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        // Process only complete lines — leave incomplete last line in buffer
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          processSSELine(line);
        }
      }
      // Flush any remaining buffer after stream ends
      if (sseBuffer) {
        for (const line of sseBuffer.split("\n")) {
          processSSELine(line);
        }
      }

      function processSSELine(line: string) {
        if (!line.startsWith("data: ")) return;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") return;
        let data: any;
        try { data = JSON.parse(raw); } catch { return; }

        if (data.content) {
          fullContent += data.content;
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last.isStreaming) copy[copy.length - 1] = { ...last, content: fullContent };
            return copy;
          });
        } else if (data.image) {
          fullContent = `[IMAGE:${data.image.mimeType}:${data.image.b64_json}]`;
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: fullContent };
            return copy;
          });
        } else if (data.routing) {
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last.isStreaming) {
              copy[copy.length - 1] = {
                ...last,
                provider: data.routing.provider,
                model: data.routing.model,
                intentType: data.routing.intent,
              };
            }
            return copy;
          });
        } else if (data.done) {
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], isStreaming: false };
            return copy;
          });
          loadUsage();
          loadSessions();
        } else if (data.error) {
          throw new Error(data.error);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Sorry, something went wrong. Please try again.", isStreaming: false };
        return copy;
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function startNewChat() {
    const res = await fetch("/api/ai/sessions", { method: "POST", credentials: "include" });
    if (res.ok) {
      const s = await res.json();
      setSessions(prev => [s, ...prev]);
      setActiveSession(s);
      setMessages([]);
    }
  }

  return (
    <div className="flex flex-col bg-background" style={{ height: "100dvh" }}>
      <Navbar />
    <div className="flex overflow-hidden flex-1 pt-14">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-60" : "w-0"} shrink-0 transition-all duration-200 overflow-hidden flex flex-col border-r border-border/50 bg-sidebar`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3.5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/90 flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-xs font-bold">✦</span>
            </div>
            <span className="text-sm font-medium text-sidebar-foreground">Advantix AI</span>
          </div>
          <button
            onClick={startNewChat}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-3">No chats yet. Start a new one!</p>
          )}
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => selectSession(s)}
              className={`w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2 group transition-colors ${
                activeSession?.id === s.id
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="text-xs truncate flex-1">{s.title}</span>
              <button
                onClick={e => deleteSession(s.id, e)}
                className="opacity-0 group-hover:opacity-100 shrink-0 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))}
        </div>

        {/* Usage + User */}
        <div className="border-t border-border/30 p-3 space-y-2">
          {usage && (
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div className="flex justify-between">
                <span>Tokens this month</span>
                <span className="text-foreground/70">{usage.tokensUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated cost</span>
                <span className="text-foreground/70">${usage.costUsd.toFixed(4)}</span>
              </div>
              {usage.monthlyLimit && (
                <>
                  <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usage.tokensUsed / usage.monthlyLimit > 0.8 ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, (usage.tokensUsed / usage.monthlyLimit) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span>Limit</span>
                    <span>{usage.monthlyLimit.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-[10px] font-semibold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <span className="text-xs text-sidebar-foreground/80 truncate flex-1">{user?.name}</span>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground transition-colors" title="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <span className="text-sm text-muted-foreground truncate">
            {activeSession?.title || "New conversation"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="max-w-lg mx-auto text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">✦</span>
              </div>
              <h2 className="text-base font-medium text-foreground mb-2">Advantix AI</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Ask me anything — I'll route your request to the best model automatically.
              </p>
              <div className="grid grid-cols-2 gap-2 text-left">
                {[
                  { icon: <Code className="w-3.5 h-3.5" />, label: "Write code", ex: "Build a React hook for...", color: "text-orange-400" },
                  { icon: <Image className="w-3.5 h-3.5" />, label: "Generate image", ex: "Draw a futuristic city at...", color: "text-blue-400" },
                  { icon: <Brain className="w-3.5 h-3.5" />, label: "Deep analysis", ex: "Analyze the trade-offs of...", color: "text-purple-400" },
                  { icon: <Zap className="w-3.5 h-3.5" />, label: "Live search", ex: "What's the latest news on...", color: "text-violet-400" },
                  { icon: <Sparkles className="w-3.5 h-3.5" />, label: "General chat", ex: "Explain quantum computing...", color: "text-emerald-400" },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => setInput(item.ex)}
                    className="p-3 rounded-lg bg-card border border-border/40 hover:border-border text-left transition-colors group"
                  >
                    <div className={`${item.color} mb-1.5`}>{item.icon}</div>
                    <div className="text-xs font-medium text-foreground/80 mb-0.5">{item.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{item.ex}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`message-in flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-primary text-xs">✦</span>
                  </div>
                )}
                <div className={`max-w-[85%] ${msg.role === "user" ? "order-first" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="bg-card border border-border/40 rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm text-foreground">
                      {msg.content}
                    </div>
                  ) : (
                    <div>
                      {/* Provider tag */}
                      {msg.provider && (
                        <div className={`flex items-center gap-1 text-[10px] mb-1.5 ${PROVIDER_COLORS[msg.provider] || "text-muted-foreground"}`}>
                          {msg.intentType && INTENT_ICONS[msg.intentType]}
                          <span>{msg.model}</span>
                        </div>
                      )}
                      <div className="text-foreground/90">
                        <MessageRenderer content={msg.content} isStreaming={msg.isStreaming} />
                        {msg.isStreaming && !msg.content && (
                          <div className="flex gap-1 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                          </div>
                        )}
                      </div>
                      {/* Feedback */}
                      {!msg.isStreaming && msg.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => sendFeedback(msg.id!, "up")}
                            className={`transition-colors ${msg.feedback === "up" ? "text-emerald-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => sendFeedback(msg.id!, "down")}
                            className={`transition-colors ${msg.feedback === "down" ? "text-destructive" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-4 pb-4 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-card border border-border/50 rounded-2xl px-3 py-2.5 focus-within:border-primary/40 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                placeholder="Message Advantix AI..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed max-h-40 min-h-[1.5rem]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
              Routes to GPT-4o, Claude Sonnet, Gemini, or Grok (live search) based on your request
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
