import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Copy, RefreshCw, Mail, Link2, Crown } from "lucide-react";
import { workspaceApi, type WorkspaceMember, type WorkspaceInvite } from "@/lib/workspaceApi";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";

export function MembersPage() {
  const { current, refresh } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = current?.role === "owner";

  async function load() {
    if (!current) return;
    try {
      const [m, i] = await Promise.all([
        workspaceApi.members(current.id),
        isOwner ? workspaceApi.invites(current.id) : Promise.resolve({ invites: [] as WorkspaceInvite[] }),
      ]);
      setMembers(m.members); setInvites(i.invites);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  async function add() {
    if (!current || !email.trim()) return;
    setBusy(true);
    try {
      const r = await workspaceApi.addMember(current.id, email.trim());
      if (r.status === "added") toast.success("Member added directly");
      else if (r.status === "already_member") toast.info("Already a member");
      else if (r.status === "invited") {
        toast.success("Invitation email sent");
        if (r.inviteLink) {
          await navigator.clipboard.writeText(r.inviteLink).catch(() => {});
        }
      }
      setEmail(""); setAddOpen(false);
      load(); refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(m: WorkspaceMember) {
    if (!current) return;
    if (!confirm(`Remove ${m.name ?? m.email} from this workspace?`)) return;
    try { await workspaceApi.removeMember(current.id, m.id); toast.success("Member removed"); load(); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function revoke(i: WorkspaceInvite) {
    if (!current) return;
    if (!confirm(`Revoke invite for ${i.email}?`)) return;
    try { await workspaceApi.revokeInvite(current.id, i.id); load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function regenCode() {
    if (!current) return;
    if (!confirm("Regenerate quick-join code? The old code will stop working.")) return;
    try { await workspaceApi.regenerateInviteCode(current.id); await refresh(); toast.success("New code generated"); }
    catch (e) { toast.error((e as Error).message); }
  }

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => toast.success("Copied")).catch(() => toast.error("Copy failed"));
  }

  if (!current) return null;
  const quickLink = `${window.location.origin}/tools/workspace/join/${current.invite_code}`;

  return (
    <div className="space-y-5">
      {isOwner && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Quick Join Link</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Share this link — anyone signed-in to Advantix Tools can join instantly.</p>
          <div className="flex gap-2">
            <Input readOnly value={quickLink} className="text-xs font-mono" />
            <Button variant="outline" size="icon" onClick={() => copy(quickLink)}><Copy className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={regenCode}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Members ({members.length})</h3>
          {isOwner && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add member</Button>}
        </div>
        <Card className="divide-y divide-border/40">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{m.name ?? m.email}</span>
                    {m.role === "owner" && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400"><Crown className="w-2.5 h-2.5 mr-0.5" /> Owner</Badge>}
                  </div>
                  {m.name && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                </div>
              </div>
              {isOwner && m.role !== "owner" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => remove(m)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </Card>
      </div>

      {isOwner && invites.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Pending Email Invites</h3>
          <Card className="divide-y divide-border/40">
            {invites.map(i => (
              <div key={i.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{i.email}</div>
                    <p className="text-[11px] text-muted-foreground">Expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(i.link)}><Copy className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => revoke(i)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email address</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") add(); }} placeholder="user@example.com" />
              <p className="text-xs text-muted-foreground mt-1.5">If they already have an Advantix Tools account, they'll be added instantly. Otherwise we'll send them an invitation email.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={busy || !email.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
