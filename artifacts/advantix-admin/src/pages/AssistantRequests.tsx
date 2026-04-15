import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { HeadphonesIcon, MessageSquare, Send, User, Bot, CheckCircle, Clock, X, Loader2, RefreshCw, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 3000;

function handle401(res: Response) {
  if (res.status === 401) { window.dispatchEvent(new CustomEvent("admin-unauthorized")); return true; }
  return false;
}

type Session = {
  id: number;
  visitorName: string | null;
  visitorEmail: string | null;
  status: string;
  hasUnreadVisitor: boolean;
  hasUnreadAdmin: boolean;
  createdAt: string;
  updatedAt: string;
};

type Msg = {
  id: number;
  role: "user" | "assistant" | "admin";
  content: string;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "pending_human") return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/25 hover:bg-amber-500/20">Waiting</Badge>;
  if (status === "human") return <Badge className="bg-green-500/15 text-green-500 border-green-500/25 hover:bg-green-500/20">Live</Badge>;
  if (status === "closed") return <Badge className="bg-secondary text-muted-foreground border-border/40">Closed</Badge>;
  return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/25">AI</Badge>;
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const isAdmin = msg.role === "admin";
  return (
    <div className={`flex items-end gap-2 ${isAdmin ? "justify-end" : "justify-start"}`}>
      {!isAdmin && (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-0.5 ${isUser ? "bg-secondary" : "bg-primary/15"}`}>
          {isUser ? <User className="w-3 h-3 text-muted-foreground" /> : <Bot className="w-3 h-3 text-primary" />}
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
        isAdmin ? "bg-primary text-primary-foreground rounded-tr-none" :
        isUser ? "bg-secondary text-foreground rounded-tl-none" :
        "bg-card border border-border/50 text-muted-foreground rounded-tl-none italic text-xs"
      }`}>
        {!isAdmin && !isUser && <span className="text-[10px] text-primary font-semibold block mb-0.5">AI</span>}
        {isAdmin && <span className="text-[10px] text-primary-foreground/70 font-semibold block mb-0.5">You</span>}
        {msg.content}
      </div>
      {isAdmin && (
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 mb-0.5">
          <HeadphonesIcon className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}

export default function AssistantRequests() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    try {
      const url = showAll ? `/api/admin/chat/sessions/all` : `/api/admin/chat/sessions`;
      const res = await fetch(url, { credentials: "include" });
      if (handle401(res)) return;
      if (res.ok) setSessions(await res.json() as Session[]);
    } catch { /* ignore */ }
  }, [showAll]);

  const fetchMsgs = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/admin/chat/sessions/${id}/messages`, { credentials: "include" });
      if (handle401(res)) return;
      if (res.ok) {
        setMsgs(await res.json() as Msg[]);
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions();
      if (selectedId) fetchMsgs(selectedId);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchMsgs, selectedId]);

  useEffect(() => {
    if (selectedId !== null) {
      setLoadingMsgs(true);
      fetchMsgs(selectedId).finally(() => setLoadingMsgs(false));
    }
  }, [selectedId, fetchMsgs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const handleSelectSession = (id: number) => {
    setSelectedId(id);
    setMsgs([]);
    setReplyInput("");
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedId || sending) return;
    const content = replyInput.trim();
    setSending(true);
    setReplyInput("");
    try {
      const res = await fetch(`/api/admin/chat/sessions/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (handle401(res)) return;
      if (!res.ok) throw new Error("Failed to send");
      await Promise.all([fetchMsgs(selectedId), fetchSessions()]);
    } catch {
      toast({ variant: "destructive", title: "Failed to send reply" });
      setReplyInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleClose = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/chat/sessions/${id}/end`, {
        method: "POST",
        credentials: "include",
      });
      if (handle401(res)) return;
      fetchSessions();
      if (selectedId === id) fetchMsgs(id);
      toast({ title: "Chat ended", description: "The user has been notified." });
    } catch {
      toast({ variant: "destructive", title: "Failed to end chat" });
    }
  };

  const selected = sessions.find(s => s.id === selectedId);

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Assistant Requests</h1>
          <p className="text-muted-foreground mt-1">Manage live chat sessions from website visitors.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowAll(v => !v); setSelectedId(null); }}
            className="gap-2 border-border/60"
          >
            {showAll ? "Show Requests Only" : "Show All Chats"}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 border-border/60" onClick={fetchSessions}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Session list */}
        <div className="w-72 shrink-0 bg-card border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border/50 shrink-0">
            <p className="text-sm font-semibold text-muted-foreground">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <HeadphonesIcon className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No {showAll ? "" : "human request"} sessions yet.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Sessions appear when visitors request a human.</p>
              </div>
            ) : (
              sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/30 last:border-0 hover:bg-secondary/40 transition-colors ${selectedId === s.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-foreground truncate">{s.visitorName ?? "Anonymous"}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.hasUnreadVisitor && <span className="w-2 h-2 rounded-full bg-primary" title="New message" />}
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{s.visitorEmail ?? "No email"}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{format(new Date(s.updatedAt), "MMM d, h:mm a")}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 bg-card border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageSquare className="w-16 h-16 text-muted-foreground/15 mb-4" />
              <p className="text-lg font-semibold text-muted-foreground">Select a session</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Choose a conversation from the list to reply</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between shrink-0 bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{selected.visitorName ?? "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground">{selected.visitorEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  {selected.status !== "closed" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleClose(selected.id)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <PhoneOff className="w-3.5 h-3.5" /> End Chat
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex justify-center pt-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : msgs.length === 0 ? (
                  <div className="flex justify-center pt-8">
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  </div>
                ) : (
                  msgs.map(m => <MessageBubble key={m.id} msg={m} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              {selected.status !== "closed" ? (
                <div className="p-4 border-t border-border/50 bg-background shrink-0">
                  {selected.status === "pending_human" && (
                    <p className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Replying will connect you as a live agent.
                    </p>
                  )}
                  <form onSubmit={handleReply} className="flex items-center gap-2">
                    <Input
                      value={replyInput}
                      onChange={e => setReplyInput(e.target.value)}
                      placeholder="Type your reply..."
                      className="rounded-xl border-border/60 bg-secondary/50 focus-visible:ring-primary/50"
                      disabled={sending}
                    />
                    <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={!replyInput.trim() || sending}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="p-4 border-t border-border/50 bg-background text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" /> This session is closed.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
