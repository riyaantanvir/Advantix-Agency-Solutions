import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, Trash2, Bot, User, Loader2, Sparkles, Settings as SettingsIcon, Save,
  Brain, MessageCircle, Plug, X, RefreshCw, Power, AlertCircle, CheckCircle2,
  Pin, PinOff, BookMarked, Plus, History, Search, Send as SendIcon, MessagesSquare,
  Download, Upload, Database, Bell, Clock, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Types ───────────────────────────────────────────────────────────────── */

type Personality = {
  facts: string[];
  habits: string[];
  likes: string[];
  dislikes: string[];
  style: string;
};

type Settings = {
  systemPrompt: string;
  personality: Personality;
  hasTelegramToken: boolean;
  telegramChatId: string | null;
  enabled: boolean;
  botRunning: boolean;
};

type Message = { id: string; role: "user" | "assistant"; content: string };

const EMPTY_PERSONALITY: Personality = {
  facts: [], habits: [], likes: [], dislikes: [], style: "",
};

const PERSONALITY_KEYS: { key: keyof Personality; label: string; color: string }[] = [
  { key: "facts",    label: "Facts",    color: "blue" },
  { key: "habits",   label: "Habits",   color: "purple" },
  { key: "likes",    label: "Likes",    color: "green" },
  { key: "dislikes", label: "Dislikes", color: "rose" },
];

const COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-300 border-blue-500/20",
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  green:  "bg-green-500/10 text-green-300 border-green-500/20",
  rose:   "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function PersonalGPT() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"chat" | "memory" | "reminders" | "insights" | "settings">("chat");

  /* Settings load */
  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ["personal-gpt-settings"],
    queryFn: () => fetch("/api/admin/personal-gpt/settings", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Load failed"); return r.json(); }),
    /* Refresh whenever the user returns to the page so personality auto-updates from
       Telegram conversations show up without a manual reload. */
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 border border-fuchsia-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Personal GPT</h1>
            <p className="text-xs text-muted-foreground">Your private assistant — learns you, mirrors your style.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
          <button
            onClick={() => setTab("chat")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="w-3.5 h-3.5" /> Chat
          </button>
          <button
            onClick={() => setTab("memory")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === "memory" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookMarked className="w-3.5 h-3.5" /> Memory
          </button>
          <button
            onClick={() => setTab("reminders")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === "reminders" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bell className="w-3.5 h-3.5" /> Reminders
          </button>
          <button
            onClick={() => setTab("insights")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === "insights" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <History className="w-3.5 h-3.5" /> Insights
          </button>
          <button
            onClick={() => setTab("settings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === "settings" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <SettingsIcon className="w-3.5 h-3.5" /> Settings
          </button>
        </div>
      </div>

      {settingsLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "chat" ? (
        <ChatPanel onPersonalityUpdated={() => qc.invalidateQueries({ queryKey: ["personal-gpt-settings"] })} toast={toast} />
      ) : tab === "memory" ? (
        <MemoryPanel toast={toast} />
      ) : tab === "reminders" ? (
        <RemindersPanel toast={toast} />
      ) : tab === "insights" ? (
        <InsightsPanel toast={toast} />
      ) : (
        <SettingsPanel settings={settings ?? null} toast={toast} qc={qc} />
      )}
    </div>
  );
}

/* ── Chat panel ──────────────────────────────────────────────────────────── */

function ChatPanel({ onPersonalityUpdated, toast }: {
  onPersonalityUpdated: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Restore the recent conversation window from the server on mount so the
     chat picks up exactly where it left off (across page reloads, and even
     including turns that happened on Telegram). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/personal-gpt/history", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { turns?: { role: "user" | "assistant"; content: string }[] };
        if (cancelled || !data.turns?.length) return;
        setMessages(data.turns.map((t, i) => ({
          id: `h${i}-${t.role}`,
          role: t.role,
          content: t.content,
        })));
      } catch { /* silent — empty chat is fine */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || sending) return;

    const assistantId = `a${Date.now()}`;
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: userText };
    /* Add an empty assistant bubble up-front so streamed chunks can land into
       it without a layout jump on every token. */
    const placeholder: Message = { id: assistantId, role: "assistant", content: "" };
    setMessages(prev => [...prev, userMsg, placeholder]);
    setInput("");
    setSending(true);

    let buffered = "";
    let personalityChanged = false;
    let errored = false;

    try {
      const res = await fetch("/api/admin/personal-gpt/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userText }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      /* Parse SSE: each event is `data: {...}\n\n`. We tolerate partial frames
         and ignore comment heartbeats (lines starting with `:`). */
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = sseBuf.indexOf("\n\n")) !== -1) {
          const frame = sseBuf.slice(0, nl);
          sseBuf = sseBuf.slice(nl + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload) as
                | { type: "chunk"; text: string }
                | { type: "done"; reply: string; personalityUpdated: boolean }
                | { type: "error"; error: string };

              if (evt.type === "chunk") {
                buffered += evt.text;
                /* Functional update so React batches with concurrent renders. */
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: buffered } : m,
                ));
              } else if (evt.type === "done") {
                personalityChanged = evt.personalityUpdated;
                /* Reconcile in case the server's final text differs slightly
                   from our chunk concatenation (whitespace, etc.). */
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: evt.reply } : m,
                ));
              } else if (evt.type === "error") {
                throw new Error(evt.error);
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message && !payload.startsWith(":")) {
                throw parseErr;
              }
            }
          }
        }
      }

      if (personalityChanged) onPersonalityUpdated();
    } catch (err) {
      errored = true;
      toast({
        variant: "destructive",
        title: "Chat failed",
        description: err instanceof Error ? err.message : "Try again",
      });
      /* Drop the empty placeholder if we never got any text. */
      if (!buffered) {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
    } finally {
      setSending(false);
      if (!errored) textareaRef.current?.focus();
    }
  }, [sending, toast, onPersonalityUpdated]);

  const clearWindow = async () => {
    try {
      await fetch("/api/admin/personal-gpt/clear-recent", { method: "POST", credentials: "include" });
      setMessages([]);
      toast({ title: "Short-term memory cleared" });
    } catch {
      toast({ variant: "destructive", title: "Clear failed" });
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-secondary/20 shrink-0">
        <p className="text-xs text-muted-foreground">
          Only the last 6 turns are kept for context. Personality updates happen automatically.
        </p>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearWindow} className="h-7 gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 border border-fuchsia-500/20 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-fuchsia-400" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-xl font-semibold">Talk to your Personal GPT</h2>
              <p className="text-sm text-muted-foreground">
                The more you chat — here or on Telegram — the better it understands your style, habits, likes, and dislikes.
              </p>
            </div>
          </div>
        ) : (
          messages.map(m => <ChatBubble key={m.id} msg={m} />)
        )}
        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-fuchsia-500/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end bg-card border border-border rounded-2xl px-4 py-3 shadow-sm focus-within:border-fuchsia-500/50 transition-colors">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              className="flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 min-h-[20px] max-h-[160px] shadow-none"
              rows={1}
              disabled={sending}
              autoFocus
            />
            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              size="icon"
              className={cn(
                "shrink-0 w-8 h-8 rounded-xl transition-colors",
                input.trim() && !sending ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-secondary" : "bg-fuchsia-500/10"
      )}>
        {isUser ? <User className="w-4 h-4 text-foreground" /> : <Bot className="w-4 h-4 text-fuchsia-400" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words",
        isUser
          ? "bg-fuchsia-600 text-white rounded-tr-sm"
          : "bg-card border border-border rounded-tl-sm"
      )}>
        {msg.content}
      </div>
    </div>
  );
}

/* ── Settings panel ──────────────────────────────────────────────────────── */

function SettingsPanel({ settings, toast, qc }: {
  settings: Settings | null;
  toast: ReturnType<typeof useToast>["toast"];
  qc: ReturnType<typeof useQueryClient>;
}) {
  /* Form buffers — initialised from server data, edited locally, saved on demand */
  const [systemPrompt, setSystemPrompt] = useState("");
  const [personality, setPersonality] = useState<Personality>(EMPTY_PERSONALITY);
  const [enabled, setEnabled] = useState(true);
  const [tgToken, setTgToken] = useState("");           // empty unless user types a new one
  const [tgChatId, setTgChatId] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingPersonality, setSavingPersonality] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [restartingBot, setRestartingBot] = useState(false);
  const [testingBot, setTestingBot] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSystemPrompt(settings.systemPrompt ?? "");
    setPersonality(settings.personality ?? EMPTY_PERSONALITY);
    setEnabled(settings.enabled);
    setTgChatId(settings.telegramChatId ?? "");
    /* tgToken intentionally NOT pre-filled — server never returns it */
  }, [settings]);

  const save = async (
    body: Record<string, unknown>,
    setSaving: (v: boolean) => void,
    successMsg: string,
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/personal-gpt/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["personal-gpt-settings"] });
      toast({ title: successMsg });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (key: keyof Personality, idx: number) => {
    if (key === "style") return;
    setPersonality(prev => ({ ...prev, [key]: (prev[key] as string[]).filter((_, i) => i !== idx) }));
  };

  const testBot = async () => {
    setTestingBot(true);
    try {
      const res = await fetch("/api/admin/personal-gpt/telegram/test", {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({
        title: "Test message sent",
        description: `Delivered to ${data.delivered} chat${data.delivered === 1 ? "" : "s"}. Check your Telegram.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setTestingBot(false);
    }
  };

  const restartBot = async () => {
    setRestartingBot(true);
    try {
      const res = await fetch("/api/admin/personal-gpt/telegram/restart", {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["personal-gpt-settings"] });
      toast({ title: data.running ? "Telegram bot started" : "Bot stopped (no token configured)" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Restart failed",
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setRestartingBot(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Enable toggle */}
        <Card className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              enabled ? "bg-green-500/10" : "bg-secondary"
            )}>
              <Power className={cn("w-5 h-5", enabled ? "text-green-400" : "text-muted-foreground")} />
            </div>
            <div>
              <p className="font-semibold text-sm">Personal GPT is {enabled ? "active" : "disabled"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When disabled, both web chat and the Telegram bot stop responding.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const next = !enabled;
              setEnabled(next);
              save({ enabled: next }, () => {}, next ? "Enabled" : "Disabled");
            }}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors shrink-0",
              enabled ? "bg-green-500" : "bg-secondary"
            )}
          >
            <span className={cn(
              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0.5"
            )} />
          </button>
        </Card>

        {/* System prompt */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">System Prompt</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sets the assistant's role and core behaviour.</p>
            </div>
          </div>
          <Textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder="You are Personal GPT…"
            className="text-sm font-mono"
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => save({ systemPrompt }, setSavingPrompt, "Prompt saved")}
              disabled={savingPrompt || systemPrompt === (settings?.systemPrompt ?? "")}
              className="gap-1.5"
            >
              {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Prompt
            </Button>
          </div>
        </Card>

        {/* Personality */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-fuchsia-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Auto-curated Personality</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Updated automatically from every conversation (web + Telegram). Click × to remove an item.
              </p>
            </div>
          </div>

          {/* Style */}
          <div className="mb-5">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Communication style</label>
            <input
              type="text"
              value={personality.style}
              onChange={e => setPersonality(p => ({ ...p, style: e.target.value }))}
              placeholder="(empty until learned)"
              className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-primary/50"
              maxLength={400}
            />
          </div>

          {/* Lists */}
          <div className="space-y-4">
            {PERSONALITY_KEYS.map(({ key, label, color }) => {
              const items = personality[key] as string[];
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{label} ({items.length})</label>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 italic px-2 py-1.5">Nothing learned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item, i) => (
                        <span key={i} className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs",
                          COLOR_CLASSES[color]
                        )}>
                          <span className="max-w-[280px] truncate">{item}</span>
                          <button
                            onClick={() => removeItem(key, i)}
                            className="hover:opacity-70 shrink-0"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              size="sm"
              onClick={() => save({ personality }, setSavingPersonality, "Personality saved")}
              disabled={savingPersonality}
              className="gap-1.5"
            >
              {savingPersonality ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Personality
            </Button>
          </div>
        </Card>

        {/* Backup & Restore */}
        <BackupRestoreCard toast={toast} qc={qc} />

        {/* Telegram */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Plug className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Telegram Connection</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use a separate bot from your main Advantix Telegram. All chats with this bot feed personality learning.
              </p>
            </div>
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              settings?.botRunning
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-secondary text-muted-foreground border border-border/50"
            )}>
              {settings?.botRunning
                ? <><CheckCircle2 className="w-3 h-3" /> Running</>
                : <><AlertCircle className="w-3 h-3" /> Stopped</>
              }
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Bot Token {settings?.hasTelegramToken && <span className="text-green-400">• saved</span>}
              </label>
              <input
                type="password"
                value={tgToken}
                onChange={e => setTgToken(e.target.value)}
                placeholder={settings?.hasTelegramToken ? "•••••••• (leave blank to keep)" : "123456789:ABC-DEF…"}
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm font-mono focus:outline-none focus:border-primary/50"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Create a new bot via @BotFather on Telegram, copy its token here.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Allowed Chat IDs</label>
              <input
                type="text"
                value={tgChatId}
                onChange={e => setTgChatId(e.target.value)}
                placeholder="e.g. 123456789, -1001234567890"
                className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm font-mono focus:outline-none focus:border-primary/50"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Comma-separated. Use your personal chat ID for DM, or a group ID
                (negative number, e.g. <code>-1001234567890</code>) to enable in a group.
                In groups, the bot only replies when you @mention or reply to it.
                Get IDs from <code>@userinfobot</code> (DM) or <code>@RawDataBot</code> (groups).
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={testBot}
              disabled={testingBot || !settings?.hasTelegramToken}
              className="gap-1.5"
              title={!settings?.hasTelegramToken ? "Save a bot token first" : "Send a test message to all configured chats"}
            >
              {testingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Test
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={restartBot}
              disabled={restartingBot}
              className="gap-1.5"
            >
              {restartingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Restart Bot
            </Button>
            {settings?.hasTelegramToken && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => save({ telegramBotToken: null }, setSavingTelegram, "Token cleared")}
                disabled={savingTelegram}
                className="gap-1.5 text-rose-400 hover:text-rose-300"
              >
                <X className="w-3.5 h-3.5" /> Clear Token
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                const body: Record<string, unknown> = { telegramChatId: tgChatId || null };
                if (tgToken.trim()) body.telegramBotToken = tgToken.trim();
                save(body, setSavingTelegram, "Telegram saved");
                setTgToken("");
              }}
              disabled={savingTelegram || (!tgToken && tgChatId === (settings?.telegramChatId ?? ""))}
              className="gap-1.5"
            >
              {savingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Telegram
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Memory panel (CRM/knowledge notes) ─────────────────────────────────── */

type Note = {
  id: number;
  category: "contact" | "deal" | "project" | "task" | "date" | "note";
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

const NOTE_CATS: Note["category"][] = ["contact", "deal", "project", "task", "date", "note"];

const CAT_STYLES: Record<Note["category"], string> = {
  contact: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  deal:    "bg-amber-500/10 text-amber-300 border-amber-500/20",
  project: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  task:    "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  date:    "bg-rose-500/10 text-rose-300 border-rose-500/20",
  note:    "bg-secondary text-muted-foreground border-border/50",
};

function MemoryPanel({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | Note["category"]>("all");
  const [draft, setDraft] = useState<{ category: Note["category"]; title: string; body: string }>({
    category: "note", title: "", body: "",
  });
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery<{ notes: Note[] }>({
    queryKey: ["personal-gpt-notes"],
    queryFn: () => fetch("/api/admin/personal-gpt/notes", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Load failed"); return r.json(); }),
  });

  const notes = (data?.notes ?? []).filter(n => filter === "all" || n.category === filter);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title required");
      const r = await fetch("/api/admin/personal-gpt/notes", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => {
      setDraft({ category: "note", title: "", body: "" });
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["personal-gpt-notes"] });
      toast({ title: "Note saved" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Save failed", description: err.message }),
  });

  const togglePin = async (n: Note) => {
    await fetch(`/api/admin/personal-gpt/notes/${n.id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !n.pinned }),
    });
    qc.invalidateQueries({ queryKey: ["personal-gpt-notes"] });
  };

  const remove = async (n: Note) => {
    if (!confirm(`Delete "${n.title}"?`)) return;
    await fetch(`/api/admin/personal-gpt/notes/${n.id}`, {
      method: "DELETE", credentials: "include",
    });
    qc.invalidateQueries({ queryKey: ["personal-gpt-notes"] });
    toast({ title: "Deleted" });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <BookMarked className="w-5 h-5 text-fuchsia-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Knowledge base</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Save contacts, deals, projects, tasks and dates here. The bot reads this on every reply,
              so it always knows your business context. From Telegram, use{" "}
              <code className="text-foreground">/remember &lt;category&gt; &lt;title&gt; | &lt;body&gt;</code>.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(v => !v)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        {adding && (
          <div className="space-y-2 mb-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex gap-2">
              <select
                value={draft.category}
                onChange={e => setDraft(d => ({ ...d, category: e.target.value as Note["category"] }))}
                className="px-2 py-1.5 bg-secondary/70 border border-border/50 rounded-md text-xs"
              >
                {NOTE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Title (e.g. Sajjad — CTO at Foo)"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                className="flex-1 px-3 py-1.5 bg-secondary/70 border border-border/50 rounded-md text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <Textarea
              placeholder="Optional details — phone, status, deadline, notes…"
              value={draft.body}
              onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
              className="min-h-[80px] text-sm bg-secondary/70 border-border/50"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !draft.title.trim()}>
                {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap mb-3">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "text-xs px-2.5 py-1 rounded-md border transition-colors",
              filter === "all" ? "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-200" : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            All ({data?.notes.length ?? 0})
          </button>
          {NOTE_CATS.map(c => {
            const count = (data?.notes ?? []).filter(n => n.category === c).length;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md border transition-colors",
                  filter === c ? "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-200" : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {c} ({count})
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No notes yet. Add one above or use <code>/remember</code> in Telegram.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map(n => (
              <li key={n.id} className="p-3 rounded-lg bg-secondary/30 border border-border/50 flex gap-3 items-start">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono uppercase border shrink-0 mt-0.5", CAT_STYLES[n.category])}>
                  {n.category}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {n.pinned && <Pin className="w-3 h-3 text-fuchsia-400 inline-block" />}
                    <span className="font-medium text-sm">{n.title}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">#{n.id}</span>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{n.body}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => togglePin(n)} className="p-1.5 text-muted-foreground hover:text-fuchsia-400 transition-colors" title={n.pinned ? "Unpin" : "Pin"}>
                    {n.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => remove(n)} className="p-1.5 text-muted-foreground hover:text-rose-400 transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── Insights panel — full permanent archive of every conversation ────── */
type ArchiveTurn = { id: number; role: "user" | "assistant"; content: string; source: string; createdAt: string };
type ArchiveStats = {
  total: number; userTurns: number; assistantTurns: number;
  bySource: Record<string, number>; firstAt: string | null; lastAt: string | null;
};

/* ── Reminders Panel ─────────────────────────────────────────────────────── */

type Reminder = {
  id: number;
  message: string;
  remindAt: string;
  chatId: number | null;
  source: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  createdAt: string;
  firedAt: string | null;
};

/* Render an ISO timestamp in Asia/Dhaka so the admin sees the same wall clock
   time the bot will actually fire at, regardless of the browser's locale. */
function formatDhaka(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

/* Human-friendly "in 5 min" / "in 2 hours" / "3 min ago" string. */
function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60_000);
  const hr = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  let body: string;
  if (min < 1) body = "now";
  else if (min < 60) body = `${min} min`;
  else if (hr < 24) body = `${hr} hr`;
  else body = `${day} day${day === 1 ? "" : "s"}`;
  if (body === "now") return "now";
  return past ? `${body} ago` : `in ${body}`;
}

/* Build a `YYYY-MM-DDTHH:mm` value for <input type="datetime-local"> set to
   "now + 1h" expressed in Asia/Dhaka wall time, so the prefilled value is
   consistent with how we interpret submissions (Dhaka, not browser local). */
function defaultRemindAtLocal(): string {
  const target = new Date(Date.now() + 60 * 60_000);
  /* en-CA gives the YYYY-MM-DD HH:mm format we want; we only swap the space
     for a `T` to match the input element's expected value format. */
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(target);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function RemindersPanel({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [remindAtLocal, setRemindAtLocal] = useState(defaultRemindAtLocal());

  const { data, isLoading } = useQuery<{ reminders: Reminder[] }>({
    queryKey: ["personal-gpt-reminders"],
    queryFn: () => fetch("/api/admin/personal-gpt/reminders", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Load failed"); return r.json(); }),
    /* Auto-refresh so countdowns and newly-added reminders (from Telegram)
       appear without a manual reload. */
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Message is empty");
      if (!remindAtLocal) throw new Error("Pick a date & time");
      /* `datetime-local` is a TZ-naive `YYYY-MM-DDTHH:mm` string. We always
         interpret it as Asia/Dhaka wall time (UTC+6, no DST) regardless of
         the browser's local TZ — this matches the Dhaka labels shown in the
         list and what the bot uses for natural-language reminders. */
      const iso = new Date(`${remindAtLocal}:00+06:00`).toISOString();
      if (isNaN(new Date(iso).getTime())) throw new Error("Invalid date/time");
      const r = await fetch("/api/admin/personal-gpt/reminders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, remindAt: iso }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      return j;
    },
    onSuccess: () => {
      toast({ title: "Reminder set", description: "It will fire at the scheduled time." });
      setMessage("");
      setRemindAtLocal(defaultRemindAtLocal());
      qc.invalidateQueries({ queryKey: ["personal-gpt-reminders"] });
    },
    onError: (err: Error) => toast({ title: "Could not create reminder", description: err.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/personal-gpt/reminders/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Failed"); }
    },
    onSuccess: () => {
      toast({ title: "Reminder cancelled" });
      qc.invalidateQueries({ queryKey: ["personal-gpt-reminders"] });
    },
    onError: (err: Error) => toast({ title: "Could not cancel", description: err.message, variant: "destructive" }),
  });

  const reminders = data?.reminders ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Create card */}
        <Card className="p-5 bg-card/50 border-border">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-fuchsia-400" />
            <h2 className="text-sm font-semibold text-foreground">New reminder</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Set a one-off reminder. Times are in <span className="text-foreground/80">Asia/Dhaka</span>.
            From Telegram you can also just say <span className="text-foreground/80">"kal sokal 9 tay meeting er kotha mone koraio"</span>.
          </p>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
            <input
              type="text"
              placeholder="What to remind you about…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
              maxLength={500}
            />
            <input
              type="datetime-local"
              value={remindAtLocal}
              onChange={e => setRemindAtLocal(e.target.value)}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
            />
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !message.trim()}
              className="bg-fuchsia-500/90 hover:bg-fuchsia-500 text-white"
            >
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
            </Button>
          </div>
        </Card>

        {/* List card */}
        <Card className="p-5 bg-card/50 border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-foreground">Reminders</h2>
              <span className="text-xs text-muted-foreground">
                ({reminders.filter(r => r.status === "pending").length} pending · last 24h)
              </span>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["personal-gpt-reminders"] })}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No reminders yet. Ask the bot on Telegram (e.g. <span className="text-foreground/80">"5 min pore mone koray dio"</span>) or add one above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {reminders.map(r => {
                const isPending = r.status === "pending";
                const overdue = isPending && new Date(r.remindAt).getTime() < Date.now();
                const statusMeta: Record<string, { label: string; cls: string }> = {
                  pending:   { label: "pending",   cls: "bg-violet-500/15 text-violet-300" },
                  sent:      { label: "fired",     cls: "bg-emerald-500/15 text-emerald-300" },
                  cancelled: { label: "cancelled", cls: "bg-secondary/60 text-muted-foreground" },
                  failed:    { label: "failed",    cls: "bg-rose-500/15 text-rose-300" },
                };
                const meta = statusMeta[r.status] ?? statusMeta.pending;
                return (
                  <li key={r.id} className={cn("py-3 flex items-start gap-3", !isPending && "opacity-70")}>
                    <div className={cn(
                      "mt-0.5 w-8 h-8 rounded-md flex items-center justify-center shrink-0 border",
                      r.status === "sent"      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                      r.status === "cancelled" ? "bg-secondary/40 border-border text-muted-foreground" :
                      r.status === "failed"    ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                      overdue                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                                                  "bg-violet-500/10 border-violet-500/20 text-violet-300"
                    )}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground break-words">{r.message}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className={cn("px-1.5 py-0.5 rounded font-medium", meta.cls)}>{meta.label}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDhaka(r.remindAt)}
                        </span>
                        {isPending && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded",
                            overdue ? "bg-amber-500/15 text-amber-300" : "bg-secondary/60 text-foreground/70"
                          )}>
                            {relativeTime(r.remindAt)}
                          </span>
                        )}
                        {!isPending && r.firedAt && (
                          <span className="text-muted-foreground/70">{relativeTime(r.firedAt)}</span>
                        )}
                        <span className="text-muted-foreground/70">via {r.source}</span>
                        <span className="text-muted-foreground/70">#{r.id}</span>
                      </div>
                    </div>
                    {isPending && (
                      <button
                        onClick={() => cancel.mutate(r.id)}
                        disabled={cancel.isPending}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                        title="Cancel reminder"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function InsightsPanel({ toast }: { toast: (o: { title: string; description?: string; variant?: "default" | "destructive" }) => void }) {
  const PAGE = 50;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: stats } = useQuery<ArchiveStats>({
    queryKey: ["pgpt-archive-stats"],
    queryFn: () => fetch("/api/admin/personal-gpt/archive/stats", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Stats failed"); return r.json(); }),
    refetchInterval: 30_000,
  });

  const { data, isLoading, isFetching, error } = useQuery<{ items: ArchiveTurn[]; total: number }>({
    queryKey: ["pgpt-archive", debounced, page],
    queryFn: () => {
      const u = new URL("/api/admin/personal-gpt/archive", window.location.origin);
      u.searchParams.set("limit", String(PAGE));
      u.searchParams.set("offset", String(page * PAGE));
      if (debounced) u.searchParams.set("search", debounced);
      return fetch(u.toString(), { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error("Load failed"); return r.json(); });
    },
    placeholderData: prev => prev,
  });

  useEffect(() => {
    if (error) toast({ title: "Couldn't load history", description: String(error), variant: "destructive" });
  }, [error, toast]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString() : "—";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <MessagesSquare className="w-3.5 h-3.5" /> Total turns
          </div>
          <div className="text-2xl font-semibold text-foreground">{stats?.total ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-1">never pruned</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <User className="w-3.5 h-3.5" /> You
          </div>
          <div className="text-2xl font-semibold text-foreground">{stats?.userTurns ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-1">messages from you</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Bot className="w-3.5 h-3.5" /> AI
          </div>
          <div className="text-2xl font-semibold text-foreground">{stats?.assistantTurns ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-1">replies generated</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <History className="w-3.5 h-3.5" /> Window
          </div>
          <div className="text-xs text-foreground leading-tight">First: {fmt(stats?.firstAt ?? null)}</div>
          <div className="text-xs text-foreground leading-tight mt-1">Last: {fmt(stats?.lastAt ?? null)}</div>
        </Card>
      </div>

      {/* Source breakdown */}
      {stats && Object.keys(stats.bySource).length > 0 && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-2">By source</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.bySource).map(([src, n]) => (
              <span key={src} className="px-2.5 py-1 rounded-md bg-secondary/60 text-xs text-foreground">
                <span className="text-muted-foreground">{src}</span> · {n}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Search + pagination */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search every message ever exchanged…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{total.toLocaleString()} {debounced ? "match" + (total === 1 ? "" : "es") : "turns"}</span>
            <Button size="sm" variant="ghost" disabled={page === 0 || isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</Button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={page + 1 >= pages || isFetching} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {debounced ? "No matches in your archive yet." : "Nothing here yet — start chatting and your AI copy will grow."}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map(t => (
              <li key={t.id} className={cn(
                "rounded-md border p-3 text-sm",
                t.role === "user"
                  ? "bg-fuchsia-500/5 border-fuchsia-500/15"
                  : "bg-secondary/40 border-border"
              )}>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
                  {t.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  <span className="font-medium text-foreground/80">{t.role === "user" ? "You" : "AI"}</span>
                  <span>·</span>
                  <span>{t.source}</span>
                  <span>·</span>
                  <span>{fmt(t.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">{t.content}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── Backup & Restore card — export everything, import to restore ───────── */
function BackupRestoreCard({ toast, qc }: {
  toast: ReturnType<typeof useToast>["toast"];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/personal-gpt/export", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      /* Trigger a browser download of the JSON file. */
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m?.[1] ?? `personal-gpt-backup-${new Date().toISOString().slice(0, 19)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded", description: "Keep this file safe — it's your AI's brain." });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setExporting(false);
    }
  };

  const doImport = async (file: File) => {
    if (mode === "replace") {
      const ok = window.confirm(
        "Restore mode: REPLACE\n\nThis will wipe everything the AI has learned (personality, all notes, full conversation archive) and restore it to exactly what's in this backup file.\n\nContinue?"
      );
      if (!ok) return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch { throw new Error("File is not valid JSON"); }
      const res = await fetch("/api/admin/personal-gpt/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, backup: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({
        title: `Restored (${data.mode})`,
        description: `Personality ${data.personalityRestored ? "✓" : "—"} · Notes: ${data.notesImported} · Archive turns: ${data.archiveImported}`,
      });
      /* Refresh everything that could have changed. */
      qc.invalidateQueries({ queryKey: ["personal-gpt-settings"] });
      qc.invalidateQueries({ queryKey: ["pgpt-archive"] });
      qc.invalidateQueries({ queryKey: ["pgpt-archive-stats"] });
      qc.invalidateQueries({ queryKey: ["personal-gpt-notes"] });
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Database className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Backup & Restore</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Export everything the AI knows about you (personality, knowledge base, full chat history) as one JSON file. Import any time to bring it back — no retraining needed.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" disabled={exporting} onClick={doExport} className="gap-1.5">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export backup (.json)
          </Button>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-foreground mb-2">Restore mode</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={cn(
                  "flex-1 text-left px-3 py-2 rounded-md border text-xs transition-colors",
                  mode === "replace"
                    ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="font-semibold">Replace (recommended)</div>
                <div className="opacity-80 mt-0.5">Wipe and restore the AI to exactly the snapshot.</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("merge")}
                className={cn(
                  "flex-1 text-left px-3 py-2 rounded-md border text-xs transition-colors",
                  mode === "merge"
                    ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="font-semibold">Merge</div>
                <div className="opacity-80 mt-0.5">Add to what's already there. Keeps current data.</div>
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import backup…
          </Button>
        </div>
      </div>
    </Card>
  );
}
