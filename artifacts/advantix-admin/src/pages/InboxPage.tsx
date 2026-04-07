import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Inbox, Send, Loader2, ArrowLeft, Mail, MailOpen,
  RefreshCw, Trash2, Clock, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) { window.location.href = "/admin/"; throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

type Thread = {
  threadId: string;
  id: number;
  direction: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  preview: string;
  isRead: boolean;
  receivedAt: string;
};

type InboxMsg = {
  id: number;
  threadId: string;
  direction: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isRead: boolean;
  campaignId: number | null;
  resendId: string | null;
  receivedAt: string;
  createdAt: string;
};

export default function InboxPage() {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: threads = [], isLoading, isFetching, refetch } = useQuery<Thread[]>({
    queryKey: ["inbox-threads"],
    queryFn: () => apiFetch("/api/inbox/threads"),
    refetchInterval: 30000,
  });

  if (selectedThread) {
    return (
      <ThreadView
        threadId={selectedThread}
        threads={threads}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" />
            Inbox
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Client replies and incoming messages</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          {isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : threads.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-16 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Replies Yet</h3>
          <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
            When a client replies to your email or sends a message to any @advantix.digital address, it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {threads.map((t) => (
              <div
                key={t.threadId}
                onClick={() => setSelectedThread(t.threadId)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/20 ${!t.isRead && t.direction === "inbound" ? "bg-primary/5" : ""}`}
              >
                <div className="flex-shrink-0">
                  {t.direction === "inbound" ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${!t.isRead ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <ArrowDownLeft className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${!t.isRead && t.direction === "inbound" ? "font-semibold" : "font-medium"}`}>
                      {t.direction === "inbound" ? (t.fromName || t.fromEmail) : t.toEmail}
                    </span>
                    {!t.isRead && t.direction === "inbound" && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-0">NEW</Badge>
                    )}
                  </div>
                  <p className={`text-sm truncate ${!t.isRead && t.direction === "inbound" ? "text-foreground" : "text-muted-foreground"}`}>
                    {t.subject}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{t.preview}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(t.receivedAt)}
                  </span>
                  <div className="mt-0.5">
                    <Badge variant="outline" className={`text-[10px] ${t.direction === "inbound" ? "border-blue-500/30 text-blue-400" : "border-green-500/30 text-green-400"}`}>
                      {t.direction === "inbound" ? "received" : "sent"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadView({ threadId, threads, onBack }: { threadId: string; threads: Thread[]; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [showAddReply, setShowAddReply] = useState(false);
  const [clientReplyBody, setClientReplyBody] = useState("");
  const [addingReply, setAddingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<InboxMsg[]>({
    queryKey: ["inbox-thread", threadId],
    queryFn: () => apiFetch(`/api/inbox/threads/${threadId}`),
  });

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const thread = threads.find(t => t.threadId === threadId);
  const inboundMsg = messages.find(m => m.direction === "inbound");
  const outboundMsg = messages.find(m => m.direction === "outbound");
  const clientEmail = inboundMsg?.fromEmail || outboundMsg?.toEmail || thread?.toEmail || "";
  const clientName = inboundMsg?.fromName || "";
  const lastSubject = messages[messages.length - 1]?.subject || thread?.subject || "";

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/inbox/threads/${threadId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-threads"] });
      toast({ title: "Thread deleted" });
      onBack();
    },
  });

  async function handleReply() {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      await apiFetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          to: clientEmail,
          subject: lastSubject.startsWith("Re:") ? lastSubject : `Re: ${lastSubject}`,
          body: replyBody,
        }),
      });
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["inbox-thread", threadId] });
      queryClient.invalidateQueries({ queryKey: ["inbox-threads"] });
      toast({ title: "Reply sent!" });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setReplying(false);
    }
  }

  async function handleAddClientReply() {
    if (!clientReplyBody.trim()) return;
    setAddingReply(true);
    try {
      const outbound = messages.find(m => m.direction === "outbound");
      await apiFetch("/api/inbox/add-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          fromEmail: clientEmail,
          fromName: clientName,
          toEmail: outbound?.fromEmail || "noreply@advantix.digital",
          subject: lastSubject.startsWith("Re:") ? lastSubject : `Re: ${lastSubject}`,
          body: clientReplyBody,
        }),
      });
      setClientReplyBody("");
      setShowAddReply(false);
      queryClient.invalidateQueries({ queryKey: ["inbox-thread", threadId] });
      queryClient.invalidateQueries({ queryKey: ["inbox-threads"] });
      toast({ title: "Client reply logged" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setAddingReply(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{lastSubject || "Conversation"}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              <span>{clientEmail}{clientName ? ` (${clientName})` : ""}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddReply(true)}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 mr-1" />
            Log Client Reply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl border p-4 ${
                msg.direction === "outbound"
                  ? "bg-card border-border ml-8"
                  : "bg-primary/5 border-primary/20 mr-8"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {msg.direction === "outbound" ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
                  )}
                  <span className="text-sm font-medium">
                    {msg.direction === "outbound" ? "You" : (msg.fromName || msg.fromEmail)}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className="text-xs text-muted-foreground">{msg.toEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.receivedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-2">
                <span className="font-medium">Subject:</span> {msg.subject}
              </div>

              {msg.bodyHtml ? (
                <div
                  className="text-sm text-foreground/90 prose prose-invert prose-sm max-w-none [&_a]:text-primary"
                  dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                />
              ) : msg.bodyText ? (
                <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-sans">{msg.bodyText}</pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">(No content)</p>
              )}

              {msg.direction === "outbound" && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                  <span className="text-[10px] text-muted-foreground">From: {msg.fromEmail}</span>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {showAddReply && (
        <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Log a reply received from {clientEmail}</span>
            </div>
            <button onClick={() => { setShowAddReply(false); setClientReplyBody(""); }} className="text-muted-foreground hover:text-foreground text-xs">Cancel</button>
          </div>
          <textarea
            value={clientReplyBody}
            onChange={(e) => setClientReplyBody(e.target.value)}
            placeholder="Paste the client's reply here..."
            rows={4}
            className="w-full rounded-lg border border-blue-500/20 bg-background text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleAddClientReply}
              disabled={!clientReplyBody.trim() || addingReply}
              size="sm"
              variant="outline"
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              {addingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ArrowDownLeft className="w-3.5 h-3.5 mr-1" />}
              Save Client Reply
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Send className="w-3.5 h-3.5" />
          <span>Reply to {clientEmail}{clientName ? ` (${clientName})` : ""}</span>
        </div>
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Type your reply..."
          rows={4}
          className="w-full rounded-lg border border-border bg-background text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleReply}
            disabled={!replyBody.trim() || replying}
            size="sm"
          >
            {replying ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Send Reply
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m ago`;
  if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
  if (diffHrs < 48) return "Yesterday";
  return d.toLocaleDateString();
}
