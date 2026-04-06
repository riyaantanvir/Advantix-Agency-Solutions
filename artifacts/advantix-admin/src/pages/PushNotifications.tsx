import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, Users, Trash2, RefreshCw, Loader2, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Subscriber = {
  id: number; endpoint: string; user_agent: string | null; subscribed_at: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatAgent(ua: string | null) {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return ua.slice(0, 30);
}

export default function PushNotifications() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [url, setUrl]       = useState("/");
  const [sent, setSent]     = useState<{ sent: number; failed: number; cleaned: number } | null>(null);

  const { data, isLoading } = useQuery<{ count: number; subscribers: Subscriber[] }>({
    queryKey: ["push-subscribers"],
    queryFn: () => fetch("/api/admin/push/subscribers", { credentials: "include" }).then(r => r.json()),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/push/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url }),
      });
      if (!r.ok) throw new Error("Send failed");
      return r.json();
    },
    onSuccess: (result) => {
      setSent(result);
      qc.invalidateQueries({ queryKey: ["push-subscribers"] });
      toast({ title: "Notification sent!", description: `Delivered to ${result.sent} subscriber(s).` });
    },
    onError: () => toast({ variant: "destructive", title: "Send failed" }),
  });

  const count = data?.count ?? 0;
  const subscribers = data?.subscribers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Push Notifications</h1>
          <p className="text-sm text-muted-foreground">Send browser push notifications to all subscribers</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Subscribers</p>
              <p className="text-2xl font-bold text-foreground">{count}</p>
            </div>
          </div>
        </Card>
        {sent && (
          <>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Sent</p>
                  <p className="text-2xl font-bold text-foreground">{sent.sent}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed / Cleaned</p>
                  <p className="text-2xl font-bold text-foreground">{sent.failed} / {sent.cleaned}</p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Send Form */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" /> Send Notification
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="New Blog Post: 5 Growth Hacks for 2025"
              className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Body message *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder="Click to read the latest insights from Advantix Agency..."
              className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Click URL (optional)</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="/blog/my-post"
              className="w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">Will be sent to {count} subscriber(s)</p>
            <button
              onClick={() => { setSent(null); sendMutation.mutate(); }}
              disabled={!title.trim() || !body.trim() || sendMutation.isPending || count === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendMutation.isPending ? "Sending…" : "Send to All"}
            </button>
          </div>
        </div>
      </Card>

      {/* Subscribers List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Subscribers ({count})
          </h2>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["push-subscribers"] })} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : subscribers.length === 0 ? (
          <div className="text-center py-10">
            <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No push subscribers yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Subscribers will appear once users opt in on the website.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subscribers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 bg-secondary/30 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate font-mono">{s.endpoint.slice(0, 55)}…</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatAgent(s.user_agent)} · {formatDate(s.subscribed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
