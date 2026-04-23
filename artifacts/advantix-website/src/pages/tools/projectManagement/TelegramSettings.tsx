import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Send, Save } from "lucide-react";
import { workspaceApi, type WorkspaceTelegramSettings as Settings } from "@/lib/workspaceApi";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";

export function TelegramSettings() {
  const { current } = useWorkspace();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = current?.role === "owner";

  async function load() {
    if (!current) return;
    try { const r = await workspaceApi.getTelegram(current.id); setS(r.settings); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  async function save() {
    if (!current || !s) return;
    setBusy(true);
    try {
      await workspaceApi.updateTelegram(current.id, {
        chatIds: s.chatIds,
        enabled: s.enabled,
        taskRemindIntervalHours: s.taskRemindIntervalHours,
        workHoursStart: s.workHoursStart,
        workHoursEnd: s.workHoursEnd,
        notifyOnCreate: s.notifyOnCreate,
        notifyOnStatusChange: s.notifyOnStatusChange,
        notifyOnComment: s.notifyOnComment,
      });
      toast.success("Settings saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function test() {
    if (!current) return;
    setBusy(true);
    try { const r = await workspaceApi.testTelegram(current.id);
      if (r.ok) toast.success("Test alert sent — check your chat");
      else toast.error(r.error ?? "Failed");
    } finally { setBusy(false); }
  }

  if (!current || !s) return <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Telegram Alerts</h3>
          <p className="text-xs text-muted-foreground">Get notifications when tasks are created, status changes, or comments are posted. Uses the shared Advantix platform bot — no setup on your end except adding the bot to your chat.</p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Step 1 — Add Bot</Label>
          <p className="text-xs text-muted-foreground mt-1">Add the Advantix Telegram bot to your group chat (or message it directly).</p>
        </div>

        <div>
          <Label>Step 2 — Chat IDs (comma-separated)</Label>
          <Input
            disabled={!isOwner}
            value={s.chatIds ?? ""}
            onChange={e => setS({ ...s, chatIds: e.target.value })}
            placeholder="e.g. -1001234567890, 123456789"
            className="font-mono text-sm" />
          <p className="text-xs text-muted-foreground mt-1.5">Find your chat ID by messaging <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary underline">@userinfobot</a> on Telegram. Group IDs start with a minus sign.</p>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div>
            <Label className="font-medium">Enable alerts</Label>
            <p className="text-xs text-muted-foreground">Master switch for all Telegram notifications</p>
          </div>
          <Switch checked={s.enabled} disabled={!isOwner} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Event triggers</Label>
          {[
            { k: "notifyOnCreate" as const, label: "When a task is created" },
            { k: "notifyOnStatusChange" as const, label: "When task status changes" },
            { k: "notifyOnComment" as const, label: "When a comment is added" },
          ].map(item => (
            <div key={item.k} className="flex items-center justify-between p-2.5 border border-border/40 rounded">
              <span className="text-sm">{item.label}</span>
              <Switch checked={s[item.k]} disabled={!isOwner} onCheckedChange={(v) => setS({ ...s, [item.k]: v })} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Reminder interval (hours)</Label>
            <Input type="number" min={1} disabled={!isOwner}
              value={s.taskRemindIntervalHours}
              onChange={e => setS({ ...s, taskRemindIntervalHours: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
          </div>
          <div>
            <Label>Active hours start</Label>
            <Input type="number" min={0} max={23} disabled={!isOwner}
              value={s.workHoursStart}
              onChange={e => setS({ ...s, workHoursStart: Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)) })} />
          </div>
          <div>
            <Label>Active hours end</Label>
            <Input type="number" min={0} max={23} disabled={!isOwner}
              value={s.workHoursEnd}
              onChange={e => setS({ ...s, workHoursEnd: Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)) })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Overdue task digests are sent only during active hours. Set start = end to allow 24/7.</p>

        {isOwner && (
          <div className="flex gap-2 pt-2 border-t border-border/40">
            <Button onClick={save} disabled={busy}><Save className="w-4 h-4 mr-1" /> Save</Button>
            <Button variant="outline" onClick={test} disabled={busy}><Send className="w-4 h-4 mr-1" /> Send test</Button>
          </div>
        )}
        {!isOwner && <p className="text-xs text-muted-foreground italic">Only the workspace owner can change these settings.</p>}
      </Card>
    </div>
  );
}
