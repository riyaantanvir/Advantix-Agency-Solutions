import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  workspacesTable,
  workspaceMembersTable,
  workspaceInvitesTable,
  workspaceTelegramSettingsTable,
  toolUsersTable,
} from "@workspace/db";
import { requireToolUser } from "../middleware/toolAuth.js";
import { sendEmail } from "../services/resendMailer.js";

const router = Router();

/* ── Helpers ────────────────────────────────────────────────────────────── */

function getToolUserId(req: Request): number | null {
  const internal = (req as unknown as { internalToolUserId?: number }).internalToolUserId;
  if (typeof internal === "number") return internal;
  const sess = req.session as { toolUserId?: number } | undefined;
  return sess?.toolUserId ?? null;
}

async function getMembership(workspaceId: number, toolUserId: number) {
  const rows = await db
    .select()
    .from(workspaceMembersTable)
    .where(and(
      eq(workspaceMembersTable.workspaceId, workspaceId),
      eq(workspaceMembersTable.toolUserId, toolUserId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

async function assertMember(workspaceId: number, toolUserId: number, res: Response): Promise<boolean> {
  const m = await getMembership(workspaceId, toolUserId);
  if (!m) {
    res.status(403).json({ error: "Not a member of this workspace" });
    return false;
  }
  return true;
}

async function assertOwner(workspaceId: number, toolUserId: number, res: Response): Promise<boolean> {
  const m = await getMembership(workspaceId, toolUserId);
  if (!m || m.role !== "owner") {
    res.status(403).json({ error: "Owner permission required" });
    return false;
  }
  return true;
}

function makeInviteCode(len = 10): string {
  return randomBytes(Math.ceil(len * 0.75)).toString("base64url").slice(0, len);
}

function publicSiteOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/* ── List my workspaces ─────────────────────────────────────────────────── */

router.get("/tools/workspaces", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db.execute(sql`
    SELECT w.id, w.name, w.slug, w.invite_code, w.owner_tool_user_id,
           w.created_at, w.updated_at,
           m.role,
           (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
           (SELECT COUNT(*) FROM workspace_projects p WHERE p.workspace_id = w.id AND p.status = 'active') AS project_count
    FROM workspaces w
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.tool_user_id = ${uid}
    ORDER BY w.created_at DESC
  `);
  res.json({ workspaces: rows.rows });
});

/* ── Create workspace ───────────────────────────────────────────────────── */

router.post("/tools/workspaces", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const name = String((req.body?.name ?? "")).trim();
  if (!name || name.length > 80) {
    res.status(400).json({ error: "Name required (1-80 chars)" });
    return;
  }
  const inviteCode = makeInviteCode(12);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  const inserted = await db.insert(workspacesTable).values({
    name,
    slug,
    ownerToolUserId: uid,
    inviteCode,
  }).returning();
  const ws = inserted[0];

  await db.insert(workspaceMembersTable).values({
    workspaceId: ws.id,
    toolUserId: uid,
    role: "owner",
  });

  await db.insert(workspaceTelegramSettingsTable).values({
    workspaceId: ws.id,
  }).onConflictDoNothing();

  res.json({ workspace: ws });
});

/* ── Get workspace detail ───────────────────────────────────────────────── */

router.get("/tools/workspaces/:id", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertMember(wid, uid, res))) return;

  const rows = await db.select().from(workspacesTable).where(eq(workspacesTable.id, wid)).limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Workspace not found" }); return; }
  const m = await getMembership(wid, uid);
  res.json({ workspace: rows[0], myRole: m?.role ?? null });
});

/* ── Rename / update workspace ──────────────────────────────────────────── */

router.patch("/tools/workspaces/:id", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  if (!name || name.length > 80) { res.status(400).json({ error: "Name required (1-80 chars)" }); return; }

  await db.update(workspacesTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspacesTable.id, wid));
  res.json({ ok: true });
});

/* ── Delete workspace (owner only, cascades) ────────────────────────────── */

router.delete("/tools/workspaces/:id", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  await db.execute(sql`DELETE FROM workspace_task_comments WHERE task_id IN (SELECT id FROM workspace_tasks WHERE workspace_id = ${wid})`);
  await db.execute(sql`DELETE FROM workspace_tasks WHERE workspace_id = ${wid}`);
  await db.execute(sql`DELETE FROM workspace_projects WHERE workspace_id = ${wid}`);
  await db.execute(sql`DELETE FROM workspace_invites WHERE workspace_id = ${wid}`);
  await db.execute(sql`DELETE FROM workspace_members WHERE workspace_id = ${wid}`);
  await db.execute(sql`DELETE FROM workspace_telegram_settings WHERE workspace_id = ${wid}`);
  await db.delete(workspacesTable).where(eq(workspacesTable.id, wid));
  res.json({ ok: true });
});

/* ── Members ────────────────────────────────────────────────────────────── */

router.get("/tools/workspaces/:id/members", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertMember(wid, uid, res))) return;

  const rows = await db.execute(sql`
    SELECT m.id, m.tool_user_id, m.role, m.joined_at,
           u.name, u.email
    FROM workspace_members m
    LEFT JOIN tool_users u ON u.id = m.tool_user_id
    WHERE m.workspace_id = ${wid}
    ORDER BY (m.role = 'owner') DESC, m.joined_at ASC
  `);
  res.json({ members: rows.rows });
});

/* Add member: if account exists → add; else create invite + email link */
router.post("/tools/workspaces/:id/members", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  const email = String((req.body?.email ?? "")).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const wsRows = await db.select().from(workspacesTable).where(eq(workspacesTable.id, wid)).limit(1);
  const ws = wsRows[0];
  if (!ws) { res.status(404).json({ error: "Workspace not found" }); return; }

  /* Find existing tool user */
  const userRows = await db.select().from(toolUsersTable).where(eq(toolUsersTable.email, email)).limit(1);
  const existingUser = userRows[0];

  if (existingUser) {
    /* Already a member? */
    const already = await getMembership(wid, existingUser.id);
    if (already) { res.json({ status: "already_member", memberId: already.id }); return; }

    await db.insert(workspaceMembersTable).values({
      workspaceId: wid,
      toolUserId: existingUser.id,
      role: "member",
    });
    res.json({ status: "added", userId: existingUser.id, name: existingUser.name, email: existingUser.email });
    return;
  }

  /* No account → create invite token + email link */
  const token = makeInviteCode(32);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(workspaceInvitesTable).values({
    workspaceId: wid,
    email,
    token,
    invitedByToolUserId: uid,
    expiresAt,
  });
  const link = `${publicSiteOrigin(req)}/tools/workspace/invite/${token}`;
  /* Best-effort email send; ignore failure (link still usable from UI) */
  try {
    await sendEmail({
      to: email,
      from: "Advantix Project Manager <noreply@advantix.digital>",
      subject: `You're invited to join "${ws.name}" on Advantix`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0a0f;color:#fff;border-radius:16px">
          <h2 style="margin:0 0 12px;font-size:20px">You're invited to a workspace</h2>
          <p style="color:#aaa;line-height:1.6">A workspace owner invited you to join <strong style="color:#fff">${ws.name}</strong> on Advantix Project Manager.</p>
          <p style="margin:24px 0">
            <a href="${link}" style="display:inline-block;padding:12px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Accept invitation</a>
          </p>
          <p style="color:#666;font-size:12px">Or copy this link: ${link}</p>
          <p style="color:#666;font-size:12px">Link expires in 14 days.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Invite email failed:", err);
  }
  res.json({ status: "invited", email, inviteLink: link });
});

router.delete("/tools/workspaces/:id/members/:memberId", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isFinite(wid) || !Number.isFinite(memberId)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  const rows = await db.select().from(workspaceMembersTable).where(eq(workspaceMembersTable.id, memberId)).limit(1);
  const m = rows[0];
  if (!m || m.workspaceId !== wid) { res.status(404).json({ error: "Member not found" }); return; }
  if (m.role === "owner") { res.status(400).json({ error: "Cannot remove the owner" }); return; }

  await db.delete(workspaceMembersTable).where(eq(workspaceMembersTable.id, memberId));
  res.json({ ok: true });
});

/* ── Pending invites ────────────────────────────────────────────────────── */

router.get("/tools/workspaces/:id/invites", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  const invites = await db.select()
    .from(workspaceInvitesTable)
    .where(and(eq(workspaceInvitesTable.workspaceId, wid), eq(workspaceInvitesTable.accepted, false)))
    .orderBy(desc(workspaceInvitesTable.createdAt));
  const origin = publicSiteOrigin(req);
  res.json({
    invites: invites.map(i => ({
      id: i.id, email: i.email, expiresAt: i.expiresAt, createdAt: i.createdAt,
      link: `${origin}/tools/workspace/invite/${i.token}`,
    })),
  });
});

router.delete("/tools/workspaces/:id/invites/:inviteId", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  const iid = parseInt(req.params.inviteId, 10);
  if (!Number.isFinite(wid) || !Number.isFinite(iid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  await db.delete(workspaceInvitesTable)
    .where(and(eq(workspaceInvitesTable.id, iid), eq(workspaceInvitesTable.workspaceId, wid)));
  res.json({ ok: true });
});

/* ── Quick join code ────────────────────────────────────────────────────── */

router.post("/tools/workspaces/:id/regenerate-invite-code", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const wid = parseInt(req.params.id, 10);
  if (!Number.isFinite(wid)) { res.status(400).json({ error: "Bad id" }); return; }
  if (!(await assertOwner(wid, uid, res))) return;

  const newCode = makeInviteCode(12);
  await db.update(workspacesTable).set({ inviteCode: newCode }).where(eq(workspacesTable.id, wid));
  res.json({ inviteCode: newCode });
});

router.post("/tools/workspaces/join/by-code", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const code = String((req.body?.code ?? "")).trim();
  if (!code) { res.status(400).json({ error: "Code required" }); return; }

  const rows = await db.select().from(workspacesTable).where(eq(workspacesTable.inviteCode, code)).limit(1);
  const ws = rows[0];
  if (!ws) { res.status(404).json({ error: "Invalid invite code" }); return; }

  const already = await getMembership(ws.id, uid);
  if (already) { res.json({ status: "already_member", workspaceId: ws.id }); return; }

  await db.insert(workspaceMembersTable).values({
    workspaceId: ws.id,
    toolUserId: uid,
    role: "member",
  });
  res.json({ status: "joined", workspaceId: ws.id, workspaceName: ws.name });
});

router.post("/tools/workspaces/join/by-token", requireToolUser, async (req: Request, res: Response) => {
  const uid = getToolUserId(req);
  if (!uid) { res.status(401).json({ error: "Not authenticated" }); return; }
  const token = String((req.body?.token ?? "")).trim();
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const rows = await db.select().from(workspaceInvitesTable).where(eq(workspaceInvitesTable.token, token)).limit(1);
  const inv = rows[0];
  if (!inv) { res.status(404).json({ error: "Invalid invite token" }); return; }
  if (inv.accepted) { res.status(400).json({ error: "Invite already used" }); return; }
  if (inv.expiresAt.getTime() < Date.now()) { res.status(400).json({ error: "Invite expired" }); return; }

  const already = await getMembership(inv.workspaceId, uid);
  if (!already) {
    await db.insert(workspaceMembersTable).values({
      workspaceId: inv.workspaceId,
      toolUserId: uid,
      role: "member",
    });
  }
  await db.update(workspaceInvitesTable)
    .set({ accepted: true })
    .where(eq(workspaceInvitesTable.id, inv.id));

  const wsRows = await db.select().from(workspacesTable).where(eq(workspacesTable.id, inv.workspaceId)).limit(1);
  res.json({ status: "joined", workspaceId: inv.workspaceId, workspaceName: wsRows[0]?.name ?? null });
});

/* ── Public invite preview (no auth) ────────────────────────────────────── */

router.get("/tools/workspaces/invite-preview/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  const rows = await db.execute(sql`
    SELECT i.email, i.accepted, i.expires_at, w.name AS workspace_name
    FROM workspace_invites i
    JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.token = ${token}
    LIMIT 1
  `);
  const r = rows.rows[0] as { email: string; accepted: boolean; expires_at: Date; workspace_name: string } | undefined;
  if (!r) { res.status(404).json({ error: "Invalid invite" }); return; }
  res.json({
    email: r.email,
    workspaceName: r.workspace_name,
    accepted: r.accepted,
    expired: new Date(r.expires_at).getTime() < Date.now(),
  });
});

export default router;
