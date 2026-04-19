import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Loader2, CheckCircle2, RefreshCw, LogOut, Plus, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

type Status = "disconnected" | "connecting" | "qr" | "connected" | "error";

interface WaState {
  status: Status;
  phone: string | null;
  displayName: string | null;
  error: string | null;
  triggerWord: string;
  autoReplyDm: boolean;
  autoReplyGroups: boolean;
  allowedJids: string[];
  blockedJids: string[];
  connectedAt: string | null;
  qr: string | null;
}

const DEFAULT_STATE: WaState = {
  status: "disconnected", phone: null, displayName: null, error: null,
  triggerWord: "@bot", autoReplyDm: true, autoReplyGroups: false,
  allowedJids: [], blockedJids: [], connectedAt: null, qr: null,
};

export default function WhatsAppPage() {
  const { toast } = useToast();
  const [state, setState] = useState<WaState>(DEFAULT_STATE);
  const [busy, setBusy] = useState(false);
  const [newJid, setNewJid] = useState("");
  const [newBlockJid, setNewBlockJid] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/tools/whatsapp/status", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setState(s => ({ ...s, ...d }));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadStatus();
    /* SSE for live QR + status */
    let pollTimer: number | null = null;
    let sseConnected = false;
    const es = new EventSource("/api/tools/whatsapp/stream", { withCredentials: true } as any);
    esRef.current = es;
    es.onopen = () => { sseConnected = true; };
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        setState(s => ({ ...s, ...d }));
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      /* Fallback: if SSE isn't working (proxy, network), poll status every 2s */
      if (!sseConnected && !pollTimer) {
        pollTimer = window.setInterval(loadStatus, 2000);
      }
    };
    /* Also poll every 3s while connecting/qr — defence-in-depth in case SSE
       drops a message (status moves but QR misses) */
    const stateTick = window.setInterval(() => {
      setState(curr => {
        if (curr.status === "connecting" || curr.status === "qr") loadStatus();
        return curr;
      });
    }, 3000);
    return () => {
      es.close();
      if (pollTimer) clearInterval(pollTimer);
      clearInterval(stateTick);
    };
  }, []);

  const startConnect = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/tools/whatsapp/connect", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Connect failed");
      toast({ title: "Connecting…", description: "QR code coming up — scan it from your WhatsApp app." });
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const doDisconnect = async (logout: boolean) => {
    setBusy(true);
    try {
      await fetch("/api/tools/whatsapp/disconnect", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logout }),
      });
      toast({ title: logout ? "Logged out" : "Disconnected", description: logout ? "WhatsApp session removed." : "Will reconnect when you click Connect again." });
    } finally { setBusy(false); }
  };

  const saveSettings = async (patch: Partial<WaState>) => {
    setSavingSettings(true);
    try {
      const next = { ...state, ...patch };
      setState(next);
      await fetch("/api/tools/whatsapp/settings", {
        method: "PUT", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          triggerWord: next.triggerWord,
          autoReplyDm: next.autoReplyDm,
          autoReplyGroups: next.autoReplyGroups,
          allowedJids: next.allowedJids,
          blockedJids: next.blockedJids,
        }),
      });
    } finally { setSavingSettings(false); }
  };

  const addJid = (raw: string, kind: "allow" | "block") => {
    const v = raw.trim();
    if (!v) return;
    /* Accept "880171...", "880171...@s.whatsapp.net", "xxxxx@g.us" */
    let jid = v;
    if (!v.includes("@")) {
      jid = `${v.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    }
    if (kind === "allow") {
      saveSettings({ allowedJids: Array.from(new Set([...state.allowedJids, jid])) });
      setNewJid("");
    } else {
      saveSettings({ blockedJids: Array.from(new Set([...state.blockedJids, jid])) });
      setNewBlockJid("");
    }
  };

  const removeJid = (jid: string, kind: "allow" | "block") => {
    if (kind === "allow") saveSettings({ allowedJids: state.allowedJids.filter(j => j !== jid) });
    else saveSettings({ blockedJids: state.blockedJids.filter(j => j !== jid) });
  };

  const StatusBadge = () => {
    if (state.status === "connected")  return <Badge className="bg-green-500/20 text-green-300 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
    if (state.status === "qr")         return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Scan QR</Badge>;
    if (state.status === "connecting") return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting…</Badge>;
    if (state.status === "error")      return <Badge className="bg-red-500/20 text-red-300 border-red-500/30"><AlertTriangle className="w-3 h-3 mr-1" /> Error</Badge>;
    return <Badge className="bg-zinc-500/20 text-zinc-300 border-zinc-500/30">Disconnected</Badge>;
  };

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">WhatsApp Assistant</h1>
              <p className="text-sm text-muted-foreground">Chat with the assistant from any phone or group</p>
            </div>
          </div>
        </motion.div>

        {/* Connection card */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Connection</h2>
              <StatusBadge />
            </div>
            {state.status === "connected" && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => doDisconnect(false)} disabled={busy}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Reconnect later
                </Button>
                <Button variant="destructive" size="sm" onClick={() => doDisconnect(true)} disabled={busy}>
                  <LogOut className="w-4 h-4 mr-1" /> Log out
                </Button>
              </div>
            )}
          </div>

          {state.status === "connected" && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Connected as</div>
              <div className="text-lg font-semibold">{state.displayName || state.phone}</div>
              {state.phone && <div className="text-sm font-mono text-muted-foreground">+{state.phone}</div>}
            </div>
          )}

          {state.status === "qr" && state.qr && (
            <div className="flex flex-col items-center gap-4 py-4">
              <img src={state.qr} alt="WhatsApp QR" className="w-64 h-64 rounded-lg bg-white p-2" />
              <div className="text-center text-sm text-muted-foreground max-w-md">
                <p className="font-medium text-foreground mb-1">কীভাবে scan করবেন:</p>
                <ol className="text-left space-y-1">
                  <li>1. ফোনে WhatsApp খুলুন</li>
                  <li>2. <b>Settings → Linked Devices → Link a Device</b> এ যান</li>
                  <li>3. উপরের QR code টি scan করুন</li>
                </ol>
                <Button variant="outline" size="sm" className="mt-3" onClick={startConnect} disabled={busy}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh QR
                </Button>
              </div>
            </div>
          )}

          {state.status === "qr" && !state.qr && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">QR expired or server restarted. Click below to get a fresh code.</p>
              <Button onClick={startConnect} disabled={busy} size="lg" className="bg-green-500 hover:bg-green-600">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Generate New QR
              </Button>
            </div>
          )}

          {state.status === "connecting" && !state.qr && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Initializing connection…
            </div>
          )}

          {state.status === "error" && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
              <div className="text-sm text-red-400">{state.error || "Connection error"}</div>
            </div>
          )}

          {(state.status === "disconnected" || state.status === "error") && (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4">WhatsApp connect করতে নিচের button এ click করুন। QR code আসবে।</p>
              <Button onClick={startConnect} disabled={busy} size="lg" className="bg-green-500 hover:bg-green-600">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
                Connect WhatsApp
              </Button>
            </div>
          )}
        </Card>

        {/* Settings */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Reply Settings</h2>

          <div className="space-y-5">
            <div>
              <Label htmlFor="trigger">Trigger word (for groups)</Label>
              <p className="text-xs text-muted-foreground mb-2">Group এ message এর শুরুতে এই word থাকলে assistant reply দিবে। DM এর জন্য optional।</p>
              <Input
                id="trigger" value={state.triggerWord}
                onChange={e => setState(s => ({ ...s, triggerWord: e.target.value }))}
                onBlur={() => saveSettings({ triggerWord: state.triggerWord })}
                placeholder="@bot"
                className="max-w-xs"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Auto-reply in DMs</Label>
                <p className="text-xs text-muted-foreground">Direct message এ আসা সব text এ assistant reply দিবে।</p>
              </div>
              <Switch checked={state.autoReplyDm} onCheckedChange={v => saveSettings({ autoReplyDm: v })} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Auto-reply in allowed groups</Label>
                <p className="text-xs text-muted-foreground">Allowed group এ trigger word ছাড়াও সব message এ reply দিবে।</p>
              </div>
              <Switch checked={state.autoReplyGroups} onCheckedChange={v => saveSettings({ autoReplyGroups: v })} />
            </div>
          </div>
        </Card>

        {/* Allow / block lists */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-1">Allowed chats</h3>
            <p className="text-xs text-muted-foreground mb-3">যদি কোন chat এই list এ থাকে, শুধু এদের message এ reply দিবে। Empty list = সব chat allowed।</p>
            <div className="flex gap-2 mb-3">
              <Input value={newJid} onChange={e => setNewJid(e.target.value)} placeholder="880171234567 or xxx@g.us" />
              <Button size="sm" onClick={() => addJid(newJid, "allow")}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-1.5">
              {state.allowedJids.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">All chats allowed</p>
              ) : state.allowedJids.map(j => (
                <div key={j} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-sm">
                  <span className="font-mono text-xs truncate">{j}</span>
                  <button onClick={() => removeJid(j, "allow")} className="text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-1">Blocked chats</h3>
            <p className="text-xs text-muted-foreground mb-3">এই list এর কোন chat থেকে message এলে assistant ignore করবে।</p>
            <div className="flex gap-2 mb-3">
              <Input value={newBlockJid} onChange={e => setNewBlockJid(e.target.value)} placeholder="880171234567" />
              <Button size="sm" variant="outline" onClick={() => addJid(newBlockJid, "block")}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-1.5">
              {state.blockedJids.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No blocked chats</p>
              ) : state.blockedJids.map(j => (
                <div key={j} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-sm">
                  <span className="font-mono text-xs truncate">{j}</span>
                  <button onClick={() => removeJid(j, "block")} className="text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Examples */}
        <Card className="p-6 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
          <h3 className="font-semibold mb-3">যা যা WhatsApp এ বলতে পারবেন:</h3>
          <ul className="space-y-2 text-sm">
            <li>• <i>"আজকে lunch এ ৩০০ টাকা খরচ হইসে"</i> → entry add হবে</li>
            <li>• <i>"এই মাসে কত খরচ হইসে?"</i> → finance summary</li>
            <li>• <i>"google.com short link বানাও"</i> → short URL</li>
            <li>• <i>"facebook এ কত followers আছে?"</i> → SMM stats</li>
            <li>• <i>"transport এ কত গেছে this month?"</i> → category-wise expense</li>
          </ul>
          {savingSettings && <div className="mt-3 text-xs text-muted-foreground">Saving…</div>}
        </Card>
      </div>
    </div>
  );
}
