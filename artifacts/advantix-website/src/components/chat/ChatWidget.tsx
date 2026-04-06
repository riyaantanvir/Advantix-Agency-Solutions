import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Bot, User, HeadphonesIcon, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToolsUser } from "@/context/ToolsUserContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "adv_chat_token";
const POLL_INTERVAL = 3500;

type ChatPhase = "idle" | "ask_name" | "ask_email" | "chatting" | "pending_human" | "human" | "agent_busy" | "ended";

type Msg = {
  id?: number;
  role: "user" | "assistant" | "admin" | "system";
  content: string;
  pending?: boolean;
};

const expo = [0.22, 1, 0.36, 1] as const;

function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-4 py-3 rounded-2xl rounded-tl-none bg-secondary text-secondary-foreground">
      {[0, 150, 300].map(d => (
        <span key={d} className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const isAdmin = msg.role === "admin";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-1 ${isAdmin ? "bg-green-500/20" : "bg-primary/15"}`}>
          {isAdmin ? <HeadphonesIcon className="w-3.5 h-3.5 text-green-500" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : isAdmin
            ? "bg-green-500/10 border border-green-500/20 text-foreground rounded-tl-none"
            : "bg-secondary text-secondary-foreground rounded-tl-none"
        } ${msg.pending ? "opacity-60" : ""}`}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mb-1">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </motion.div>
  );
}

export function ChatWidget() {
  const { user } = useToolsUser();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastMsgId, setLastMsgId] = useState(0);
  const [hasNewMsg, setHasNewMsg] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingStartRef = useRef<number | null>(null);

  const AGENT_WAIT_TIMEOUT_SECS = 300; // 5 minutes

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { if (isOpen) scrollToBottom(); }, [messages, isOpen]);

  /* Wait timer — counts up while pending_human; triggers timeout after AGENT_WAIT_TIMEOUT_SECS */
  useEffect(() => {
    if (phase === "pending_human") {
      pendingStartRef.current = Date.now();
      setWaitElapsed(0);
      waitTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (pendingStartRef.current ?? Date.now())) / 1000);
        setWaitElapsed(elapsed);
        if (elapsed >= AGENT_WAIT_TIMEOUT_SECS) {
          clearInterval(waitTimerRef.current!);
          waitTimerRef.current = null;
          setPhase("agent_busy");
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "All agents are currently busy. You can leave a message below and our team will get back to you soon, or continue chatting with our AI assistant.",
          }]);
        }
      }, 1000);
    } else {
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      pendingStartRef.current = null;
      setWaitElapsed(0);
    }
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* Listen for external open event (e.g. from tools dashboard) */
  useEffect(() => {
    const handler = () => { setIsOpen(true); setHasNewMsg(false); };
    window.addEventListener("open-chat-widget", handler);
    return () => window.removeEventListener("open-chat-widget", handler);
  }, []);

  /* Auto-start flow whenever widget opens while still idle */
  useEffect(() => {
    if (!isOpen || phase !== "idle") return;
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      restoreSession(saved);
    } else if (user) {
      startLoggedInFlow(user.name, user.email);
    } else {
      startFlow();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* Open chat — start flow */
  const handleOpen = () => {
    setIsOpen(true);
    setHasNewMsg(false);
    if (phase === "idle") {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) {
        restoreSession(saved);
      } else if (user) {
        startLoggedInFlow(user.name, user.email);
      } else {
        startFlow();
      }
    }
  };

  const startFlow = () => {
    setPhase("ask_name");
    setMessages([{ role: "assistant", content: "Hi there! 👋 Welcome to Advantix. What's your name?" }]);
  };

  const startLoggedInFlow = async (userName: string, userEmail: string) => {
    setName(userName);
    setEmail(userEmail);
    setIsLoading(true);
    setMessages([{ role: "assistant", content: `Hi ${userName}! 👋 How can we help you today?` }]);
    setPhase("chatting");
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${BASE}/api/chat/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: userName, email: userEmail, token: savedToken }),
      });
      const data = await res.json() as { sessionId: number; token: string; status: string };
      localStorage.setItem(TOKEN_KEY, data.token);
      setSessionToken(data.token);
      const mRes = await fetch(`${BASE}/api/chat/session/${data.token}/messages`, { credentials: "include" });
      const mData = await mRes.json() as { messages: Array<{ id: number; role: string; content: string }>; status: string };
      const msgs: Msg[] = mData.messages.map(m => ({ id: m.id, role: m.role as Msg["role"], content: m.content }));
      setMessages(msgs);
      if (msgs.length > 0) setLastMsgId(msgs[msgs.length - 1].id ?? 0);
      if (mData.status === "human") setPhase("human");
      else if (mData.status === "pending_human") setPhase("pending_human");
    } catch {
      setMessages([{ role: "assistant", content: `Hi ${userName}! 👋 How can we help you today?` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const restoreSession = async (token: string) => {
    try {
      const res = await fetch(`${BASE}/api/chat/session/${token}/messages`, { credentials: "include" });
      if (!res.ok) { startFlow(); return; }
      const data = await res.json() as { messages: Array<{ id: number; role: string; content: string }>; status: string };
      const msgs: Msg[] = data.messages.map(m => ({ id: m.id, role: m.role as Msg["role"], content: m.content }));
      setMessages(msgs);
      setSessionToken(token);
      if (msgs.length > 0) setLastMsgId(msgs[msgs.length - 1].id ?? 0);
      if (data.status === "closed") setPhase("ended");
      else if (data.status === "human") setPhase("human");
      else if (data.status === "pending_human") setPhase("pending_human");
      else setPhase("chatting");
    } catch {
      startFlow();
    }
  };

  /* Poll for new messages in human mode */
  const poll = useCallback(async (token: string, since: number) => {
    try {
      const res = await fetch(`${BASE}/api/chat/session/${token}/messages?since=${since}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { messages: Array<{ id: number; role: string; content: string }>; status: string };
      if (data.messages.length > 0) {
        const newMsgs = data.messages.map(m => ({ id: m.id, role: m.role as Msg["role"], content: m.content }));
        setMessages(prev => [...prev, ...newMsgs]);
        const lastId = newMsgs[newMsgs.length - 1].id ?? since;
        setLastMsgId(lastId);
        if (!isOpen) setHasNewMsg(true);
      }
      if (data.status === "closed") setPhase("ended");
      else if (data.status === "human") setPhase("human");
    } catch { /* ignore */ }
  }, [isOpen]);

  useEffect(() => {
    if (!sessionToken) return;
    if (phase === "pending_human" || phase === "human") {
      pollRef.current = setInterval(() => poll(sessionToken, lastMsgId), POLL_INTERVAL);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionToken, phase, poll, lastMsgId]);

  /* Handle input submit */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const val = input.trim();
    setInput("");

    if (phase === "ask_name") {
      setName(val);
      setMessages(prev => [...prev, { role: "user", content: val }, { role: "assistant", content: `Nice to meet you, ${val}! 😊 What's your email address? We'll use it to follow up if needed.` }]);
      setPhase("ask_email");
      return;
    }

    if (phase === "ask_email") {
      if (!val.includes("@")) {
        setMessages(prev => [...prev, { role: "user", content: val }, { role: "assistant", content: "That doesn't look like a valid email. Please enter your email address (e.g. you@example.com)." }]);
        return;
      }
      setEmail(val);
      setMessages(prev => [...prev, { role: "user", content: val }]);
      setIsLoading(true);
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const res = await fetch(`${BASE}/api/chat/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, email: val, token: savedToken }),
        });
        const data = await res.json() as { sessionId: number; token: string; status: string };
        localStorage.setItem(TOKEN_KEY, data.token);
        setSessionToken(data.token);
        setPhase("chatting");
        // Load messages
        const mRes = await fetch(`${BASE}/api/chat/session/${data.token}/messages`, { credentials: "include" });
        const mData = await mRes.json() as { messages: Array<{ id: number; role: string; content: string }>; status: string };
        const msgs: Msg[] = mData.messages.map(m => ({ id: m.id, role: m.role as Msg["role"], content: m.content }));
        setMessages(msgs);
        if (msgs.length > 0) setLastMsgId(msgs[msgs.length - 1].id ?? 0);
      } catch {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (phase === "chatting" && sessionToken) {
      setMessages(prev => [...prev, { role: "user", content: val, pending: true }]);
      const assistantIdx = messages.length + 1;
      setMessages(prev => [...prev, { role: "assistant", content: "", pending: true }]);
      setIsLoading(true);
      try {
        const res = await fetch(`${BASE}/api/chat/session/${sessionToken}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: val }),
        });
        const data = await res.json() as { message: { id: number; content: string }; aiReply: { id: number; content: string } | null };
        setMessages(prev => {
          const next = [...prev];
          const uIdx = next.findIndex(m => m.pending && m.role === "user");
          if (uIdx >= 0) next[uIdx] = { id: data.message.id, role: "user", content: val };
          const aIdx = next.findIndex(m => m.pending && m.role === "assistant");
          if (aIdx >= 0) next[aIdx] = data.aiReply
            ? { id: data.aiReply.id, role: "assistant", content: data.aiReply.content }
            : { role: "assistant", content: "Message sent." };
          return next;
        });
        if (data.aiReply) setLastMsgId(data.aiReply.id);
      } catch {
        setMessages(prev => {
          const next = [...prev];
          const aIdx = next.findIndex(m => m.pending && m.role === "assistant");
          if (aIdx >= 0) next[aIdx] = { role: "assistant", content: "Sorry, I'm having trouble right now." };
          return next;
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if ((phase === "pending_human" || phase === "human" || phase === "agent_busy") && sessionToken) {
      setMessages(prev => [...prev, { role: "user", content: val }]);
      try {
        const res = await fetch(`${BASE}/api/chat/session/${sessionToken}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: val }),
        });
        const data = await res.json() as { message: { id: number; content: string } };
        setMessages(prev => {
          const next = [...prev];
          const idx = next.findLastIndex(m => m.role === "user" && !m.id);
          if (idx >= 0) next[idx] = { id: data.message.id, role: "user", content: val };
          return next;
        });
        setLastMsgId(data.message.id);
      } catch { /* best effort */ }
    }
  };

  const handleStartNewChat = () => {
    localStorage.removeItem(TOKEN_KEY);
    setSessionToken(null);
    setMessages([]);
    setLastMsgId(0);
    setInput("");
    setPhase("idle");
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    // kick off fresh flow
    if (user) {
      startLoggedInFlow(user.name, user.email);
    } else {
      startFlow();
    }
  };

  const handleRequestHuman = async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    try {
      await fetch(`${BASE}/api/chat/session/${sessionToken}/request-human`, {
        method: "POST",
        credentials: "include",
      });
      setPhase("pending_human");
      setMessages(prev => [...prev, { role: "assistant", content: "You've requested to speak with a human agent. We'll connect you shortly! Feel free to leave a message here." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const placeholder =
    phase === "ask_name" ? "Enter your name..." :
    phase === "ask_email" ? "Enter your email..." :
    phase === "pending_human" ? "Leave a message for our team..." :
    phase === "human" ? "Message our agent..." :
    phase === "agent_busy" ? "Leave a message for our team..." :
    "Ask a question...";

  const waitMinsLeft = Math.max(0, Math.ceil((AGENT_WAIT_TIMEOUT_SECS - waitElapsed) / 60));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: expo }}
            className="w-[340px] sm:w-[380px] h-[520px] flex flex-col bg-background border border-border rounded-2xl shadow-2xl shadow-black/20 overflow-hidden"
          >
            {/* Header */}
            <div className={`px-4 py-3.5 flex items-center gap-3 shrink-0 ${phase === "human" ? "bg-green-600" : phase === "agent_busy" ? "bg-slate-600" : phase === "ended" ? "bg-slate-700" : "bg-primary"}`}>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                {phase === "human" || phase === "pending_human"
                  ? <HeadphonesIcon className="w-4 h-4 text-white" />
                  : <Bot className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm leading-none">
                  {phase === "human" ? "Live Agent" : phase === "pending_human" ? "Connecting..." : phase === "agent_busy" ? "Agents Unavailable" : phase === "ended" ? "Chat Ended" : "Advantix Assistant"}
                </p>
                <p className="text-white/70 text-xs mt-0.5">
                  {phase === "human" ? "You're chatting with our team" : phase === "pending_human" ? "An agent will be with you soon" : phase === "agent_busy" ? "All agents are currently busy" : phase === "ended" ? "This conversation has been closed" : "AI-powered support"}
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
              {messages.map((msg, i) => (
                msg.content === "" && msg.pending
                  ? <div key={i} className="flex items-end gap-2 justify-start">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mb-1">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <TypingDots />
                    </div>
                  : <MessageBubble key={i} msg={msg} />
              ))}
              {isLoading && phase === "chatting" && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mb-1">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <TypingDots />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Human request button */}
            {phase === "chatting" && (
              <div className="px-4 pb-2 flex justify-center">
                <button
                  onClick={handleRequestHuman}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors py-1"
                >
                  <HeadphonesIcon className="w-3.5 h-3.5" /> Talk to a human agent
                </button>
              </div>
            )}

            {/* Pending human status */}
            {phase === "pending_human" && (
              <div className="px-4 pb-2 space-y-1.5">
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-600 font-medium">Waiting for an agent...</p>
                    <p className="text-[10px] text-amber-500/70 mt-0.5">
                      Estimated wait: ~{waitMinsLeft} min{waitMinsLeft !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Agent busy — timed out */}
            {phase === "agent_busy" && (
              <div className="px-4 pb-2 space-y-2">
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-500 font-medium">All agents are busy. Please try later.</p>
                </div>
                <button
                  onClick={() => setPhase("chatting")}
                  className="w-full text-xs text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 transition-colors font-medium"
                >
                  Continue with AI assistant instead
                </button>
              </div>
            )}

            {/* Human mode indicator */}
            {phase === "human" && (
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <p className="text-xs text-green-600 font-medium">Connected to a live agent</p>
                </div>
              </div>
            )}

            {/* Ended state footer */}
            {phase === "ended" ? (
              <div className="p-3 border-t border-border bg-background shrink-0">
                <button
                  onClick={handleStartNewChat}
                  className="w-full text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full py-2.5 transition-colors"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              /* Input */
              <div className="p-3 border-t border-border bg-background shrink-0">
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={placeholder}
                    className="rounded-full border-border bg-secondary/50 focus-visible:ring-primary/50 text-sm"
                    disabled={isLoading && phase !== "pending_human" && phase !== "human" && phase !== "agent_busy"}
                    autoFocus={isOpen}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-full shrink-0 bg-primary hover:bg-primary/90"
                    disabled={!input.trim() || (isLoading && phase === "chatting")}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors relative ${
          isOpen ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && hasNewMsg && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background" />
        )}
      </motion.button>
    </div>
  );
}
