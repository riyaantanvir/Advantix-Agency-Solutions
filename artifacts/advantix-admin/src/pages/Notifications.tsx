import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bell, BotMessageSquare, Send, CheckCircle2, XCircle, Loader2,
  Eye, EyeOff, Save, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Setting = {
  id: number;
  value: string;
  label: string;
  description: string | null;
};

type Settings = Record<string, Setting>;

const TOGGLE_KEYS = [
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TELEGRAM_NOTIFY_TASK_CREATED",
  "TELEGRAM_NOTIFY_TASK_ASSIGNED",
  "TELEGRAM_NOTIFY_TASK_STATUS",
] as const;

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  TELEGRAM_NOTIFY_TASK_CREATED: {
    label: "Task Created",
    description: "Send a notification when a new task is added",
  },
  TELEGRAM_NOTIFY_TASK_ASSIGNED: {
    label: "Task Assigned",
    description: "Send a notification when a task is assigned to a team member",
  },
  TELEGRAM_NOTIFY_TASK_STATUS: {
    label: "Task Status Changed",
    description: "Send a notification when a task moves to a new status",
  },
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  return res.json();
}

export default function Notifications() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data: Settings = await apiFetch(`/api/admin/notifications/settings`);
      setSettings(data);
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  async function saveSetting(key: string, value: string) {
    setSaving(key);
    try {
      await apiFetch(`/api/admin/notifications/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      setSettings(prev => ({
        ...prev,
        [key]: { ...(prev[key] ?? { id: 0, label: key, description: null }), value },
      }));
      toast({ title: "Saved" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Save failed", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function toggleSetting(key: string) {
    const current = settings[key]?.value;
    const next = current === "false" ? "true" : "false";
    setSaving(key);
    try {
      await apiFetch(`/api/admin/notifications/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      setSettings(prev => ({ ...prev, [key]: { ...(prev[key] ?? { id: 0, label: key, description: null }), value: next } }));
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Toggle failed", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function sendTestNotification() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch(`/api/admin/notifications/telegram/test`, { method: "POST" });
      setTestResult(result);
      if (result.ok) toast({ title: "Test notification sent!" });
      else toast({ title: result.error ?? "Test failed", variant: "destructive" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Test failed";
      setTestResult({ ok: false, error: msg });
      toast({ title: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  const masterEnabled = settings["TELEGRAM_NOTIFICATIONS_ENABLED"]?.value !== "false";
  const hasConfig = !!(settings["TELEGRAM_BOT_TOKEN"]?.value && settings["TELEGRAM_CHAT_ID"]?.value);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground text-sm">Configure where and when to receive alerts</p>
          </div>
        </div>
      </div>

      {/* Telegram Card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
          <div className="w-9 h-9 rounded-xl bg-[#229ED9]/10 flex items-center justify-center">
            <BotMessageSquare className="w-5 h-5 text-[#229ED9]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Telegram</p>
            <p className="text-xs text-muted-foreground">Send alerts to a Telegram group or channel</p>
          </div>
          {/* Master toggle */}
          <button
            onClick={() => toggleSetting("TELEGRAM_NOTIFICATIONS_ENABLED")}
            disabled={saving === "TELEGRAM_NOTIFICATIONS_ENABLED"}
            className="flex items-center gap-2 text-sm font-medium transition-colors"
          >
            {saving === "TELEGRAM_NOTIFICATIONS_ENABLED" ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : masterEnabled ? (
              <ToggleRight className="w-8 h-8 text-primary" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-muted-foreground" />
            )}
            <span className={masterEnabled ? "text-primary" : "text-muted-foreground"}>
              {masterEnabled ? "Enabled" : "Disabled"}
            </span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* How to set up guide */}
          <div className="flex gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">How to set up</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Message <span className="font-mono text-foreground">@BotFather</span> on Telegram → create a bot → copy the token</li>
                <li>Add your bot to the group/channel as an admin</li>
                <li>Get your group's Chat ID (use <span className="font-mono text-foreground">@username_to_id_bot</span> or send a message and check the API)</li>
                <li>Paste both below and click Save</li>
              </ol>
            </div>
          </div>

          {/* Bot Token */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Bot Token</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? "text" : "password"}
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder={settings["TELEGRAM_BOT_TOKEN"]?.value || "123456789:ABCdef..."}
                  className="rounded-xl pr-10 font-mono text-sm"
                />
                <button onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={() => { if (botToken.trim()) { saveSetting("TELEGRAM_BOT_TOKEN", botToken.trim()); setBotToken(""); } }}
                disabled={!botToken.trim() || saving === "TELEGRAM_BOT_TOKEN"}
                className="rounded-xl gap-2 shrink-0"
              >
                {saving === "TELEGRAM_BOT_TOKEN" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
            </div>
            {settings["TELEGRAM_BOT_TOKEN"]?.value && (
              <p className="text-xs text-muted-foreground mt-1">
                Current: <span className="font-mono">{settings["TELEGRAM_BOT_TOKEN"].value}</span>
              </p>
            )}
          </div>

          {/* Chat ID */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Chat / Group ID</label>
            <div className="flex gap-2">
              <Input
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder={settings["TELEGRAM_CHAT_ID"]?.value || "-1001234567890"}
                className="rounded-xl font-mono text-sm flex-1"
              />
              <Button
                onClick={() => { if (chatId.trim()) { saveSetting("TELEGRAM_CHAT_ID", chatId.trim()); setChatId(""); } }}
                disabled={!chatId.trim() || saving === "TELEGRAM_CHAT_ID"}
                className="rounded-xl gap-2 shrink-0"
              >
                {saving === "TELEGRAM_CHAT_ID" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
            </div>
            {settings["TELEGRAM_CHAT_ID"]?.value && (
              <p className="text-xs text-muted-foreground mt-1">
                Current: <span className="font-mono">{settings["TELEGRAM_CHAT_ID"].value}</span>
              </p>
            )}
          </div>

          {/* Test notification */}
          <div className="flex items-center gap-3">
            <Button
              onClick={sendTestNotification}
              disabled={testing || !hasConfig}
              variant="outline"
              className="rounded-xl gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test Notification
            </Button>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-1.5 text-sm font-medium ${testResult.ok ? "text-green-500" : "text-red-500"}`}
              >
                {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.ok ? "Delivered!" : testResult.error ?? "Failed"}
              </motion.div>
            )}
            {!hasConfig && (
              <p className="text-xs text-muted-foreground">Configure bot token and chat ID first</p>
            )}
          </div>
        </div>
      </div>

      {/* Event toggles */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/20">
          <p className="font-semibold">Notification Events</p>
          <p className="text-xs text-muted-foreground mt-0.5">Choose which events trigger a Telegram message</p>
        </div>
        <div className="divide-y divide-border">
          {Object.entries(EVENT_LABELS).map(([key, { label, description }]) => {
            const isOn = settings[key]?.value !== "false";
            const isLoading = saving === key;
            return (
              <div key={key} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <button
                  onClick={() => toggleSetting(key)}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-sm transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  ) : isOn ? (
                    <ToggleRight className="w-8 h-8 text-primary" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-card border border-border rounded-xl px-4 py-3">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <p>More notification channels (Email, Slack) can be added in the future. All notification settings are stored securely.</p>
      </div>
    </div>
  );
}
