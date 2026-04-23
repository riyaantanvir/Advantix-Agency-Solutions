import { useEffect, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, FolderKanban, LogIn } from "lucide-react";
import { workspaceApi } from "@/lib/workspaceApi";
import { useToolsUser } from "@/context/ToolsUserContext";
import { toast } from "sonner";

/* Quick-join via short code (/tools/workspace/join/:code) */
export function WorkspaceQuickJoin() {
  const [, params] = useRoute("/tools/workspace/join/:code");
  const code = params?.code ?? "";
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [wsName, setWsName] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return; /* Redirect handled below */
    if (!code) { setStatus("error"); setError("Invalid link"); return; }
    setStatus("joining");
    workspaceApi.joinByCode(code).then(r => {
      setStatus("joined");
      setWsName(r.workspaceName ?? null);
      try { window.localStorage.setItem("advantix:current-workspace-id", String(r.workspaceId)); } catch {}
    }).catch((e: Error) => { setStatus("error"); setError(e.message); });
  }, [code, user, loading]);

  if (loading) return <Loading />;
  if (!user) return <SignInPrompt next={`/tools/workspace/join/${code}`} />;

  return (
    <CenteredCard>
      {status === "joining" && <p className="text-sm text-muted-foreground">Joining workspace…</p>}
      {status === "joined" && (
        <>
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <h1 className="text-xl font-bold mb-2">You're in!</h1>
          <p className="text-sm text-muted-foreground mb-5">{wsName ? `Welcome to ${wsName}.` : "Welcome aboard."}</p>
          <Button onClick={() => navigate("/tools/project-management")}>Open workspace</Button>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
          <h1 className="text-xl font-bold mb-2">Couldn't join</h1>
          <p className="text-sm text-muted-foreground mb-5">{error ?? "The invite code is invalid or expired."}</p>
          <Link href="/tools"><Button variant="outline">Back to Tools</Button></Link>
        </>
      )}
    </CenteredCard>
  );
}

/* Email invite token (/tools/workspace/invite/:token) */
export function WorkspaceEmailInvite() {
  const [, params] = useRoute("/tools/workspace/invite/:token");
  const token = params?.token ?? "";
  const { user, loading } = useToolsUser();
  const [, navigate] = useLocation();
  const [preview, setPreview] = useState<{ email: string; workspaceName: string; accepted: boolean; expired: boolean } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ workspaceId: number; workspaceName?: string | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    workspaceApi.invitePreview(token)
      .then(setPreview)
      .catch(e => setPreviewError((e as Error).message));
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const r = await workspaceApi.joinByToken(token);
      setDone({ workspaceId: r.workspaceId, workspaceName: r.workspaceName });
      try { window.localStorage.setItem("advantix:current-workspace-id", String(r.workspaceId)); } catch {}
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  if (previewError) return (
    <CenteredCard>
      <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
      <h1 className="text-xl font-bold mb-2">Invalid invitation</h1>
      <p className="text-sm text-muted-foreground mb-5">{previewError}</p>
      <Link href="/tools"><Button variant="outline">Back to Tools</Button></Link>
    </CenteredCard>
  );
  if (!preview) return <Loading />;

  if (done) return (
    <CenteredCard>
      <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
      <h1 className="text-xl font-bold mb-2">You've joined!</h1>
      <p className="text-sm text-muted-foreground mb-5">Welcome to {done.workspaceName ?? preview.workspaceName}.</p>
      <Button onClick={() => navigate("/tools/project-management")}>Open workspace</Button>
    </CenteredCard>
  );

  if (preview.accepted) return (
    <CenteredCard>
      <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-3" />
      <h1 className="text-xl font-bold mb-2">Invitation already used</h1>
      <p className="text-sm text-muted-foreground mb-5">This invite link has already been redeemed.</p>
      <Link href="/tools/project-management"><Button>Open Project Manager</Button></Link>
    </CenteredCard>
  );
  if (preview.expired) return (
    <CenteredCard>
      <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-3" />
      <h1 className="text-xl font-bold mb-2">Invitation expired</h1>
      <p className="text-sm text-muted-foreground mb-5">Ask the workspace owner to send you a new one.</p>
    </CenteredCard>
  );

  if (!user) return <SignInPrompt next={`/tools/workspace/invite/${token}`} email={preview.email} />;

  return (
    <CenteredCard>
      <FolderKanban className="w-12 h-12 mx-auto text-primary mb-3" />
      <h1 className="text-xl font-bold mb-1">Join {preview.workspaceName}</h1>
      <p className="text-sm text-muted-foreground mb-5">You've been invited to collaborate. Sent to <span className="text-foreground">{preview.email}</span>.</p>
      <Button onClick={accept} disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</Button>
    </CenteredCard>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */
function Loading() {
  return <CenteredCard><p className="text-sm text-muted-foreground">Loading…</p></CenteredCard>;
}
function SignInPrompt({ next, email }: { next: string; email?: string }) {
  return (
    <CenteredCard>
      <LogIn className="w-12 h-12 mx-auto text-primary mb-3" />
      <h1 className="text-xl font-bold mb-2">Sign in to continue</h1>
      <p className="text-sm text-muted-foreground mb-5">{email ? `Use the email ${email} to accept this invitation.` : "Sign in to your Advantix Tools account to join this workspace."}</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`}><Button>Sign in</Button></Link>
    </CenteredCard>
  );
}
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-28 pb-20 min-h-screen container mx-auto px-4 max-w-md">
      <Card className="p-8 text-center">{children}</Card>
    </div>
  );
}
