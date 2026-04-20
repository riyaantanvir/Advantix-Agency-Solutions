import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, Trash2, Bot, User, Loader2, Sparkles, Settings as SettingsIcon, Save,
  Brain, MessageCircle, Plug, X, RefreshCw, Power, AlertCircle, CheckCircle2,
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

  const [tab, setTab] = useState<"chat" | "settings">("chat");

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
