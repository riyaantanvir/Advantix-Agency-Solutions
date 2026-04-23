import { db, integrationsTable, workspaceTelegramSettingsTable, workspacesTable, workspaceTasksTable } from "@workspace/db";
import { and, eq, sql, lte, isNull, or, gt } from "drizzle-orm";

let cachedToken: { value: string | null; expires: number } = { value: null, expires: 0 };

async function getBotToken(): Promise<string | null> {
  if (cachedToken.value && cachedToken.expires > Date.now()) return cachedToken.value;
  const rows = await db.select({ value: integrationsTable.value })
    .from(integrationsTable)
    .where(eq(integrationsTable.name, "TELEGRAM_BOT_TOKEN"))
    .limit(1);
  const tok = rows[0]?.value?.trim() || null;
  cachedToken = { value: tok, expires: Date.now() + 60_000 };
  return tok;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseChatIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

async function sendToChats(token: string, chatIds: string[], html: string): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (const cid of chatIds) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cid, text: html, parse_mode: "HTML" }),
      });
      if (r.ok) { ok++; } else { failed++; }
    } catch { failed++; }
  }
  return { ok, failed };
}

/** Send a Telegram message to a workspace's configured chats. Silently no-ops
 *  if disabled, no token, or no chat IDs. Honours per-event opt-outs. */
export async function notifyWorkspace(
  workspaceId: number,
  html: string,
  event: "create" | "status" | "comment" | "overdue" | "test",
): Promise<void> {
  const rows = await db.select().from(workspaceTelegramSettingsTable)
    .where(eq(workspaceTelegramSettingsTable.workspaceId, workspaceId)).limit(1);
  const s = rows[0];
  if (!s || !s.enabled) return;
  if (event === "create" && !s.notifyOnCreate) return;
  if (event === "status" && !s.notifyOnStatusChange) return;
  if (event === "comment" && !s.notifyOnComment) return;

  const chatIds = parseChatIds(s.chatIds);
  if (!chatIds.length) return;
  const token = await getBotToken();
  if (!token) return;
  await sendToChats(token, chatIds, html);
}

export async function sendWorkspaceTestMessage(workspaceId: number): Promise<{ ok: boolean; error?: string }> {
  const rows = await db.select().from(workspaceTelegramSettingsTable)
    .where(eq(workspaceTelegramSettingsTable.workspaceId, workspaceId)).limit(1);
  const s = rows[0];
  if (!s) return { ok: false, error: "Settings not initialised" };
  const chatIds = parseChatIds(s.chatIds);
  if (!chatIds.length) return { ok: false, error: "No chat IDs configured" };
  const token = await getBotToken();
  if (!token) return { ok: false, error: "Platform Telegram bot token not configured" };
  const wsRows = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).limit(1);
  const wsName = wsRows[0]?.name ?? `#${workspaceId}`;
  const html = `✅ <b>Test alert</b>\nWorkspace: <b>${escapeHtml(wsName)}</b>\nIf you can read this, your alerts are working.`;
  const r = await sendToChats(token, chatIds, html);
  if (r.ok > 0) return { ok: true };
  return { ok: false, error: `Sent to 0 of ${chatIds.length} chats. Make sure the platform bot is added to your group/chat.` };
}

/* ── Message builders ────────────────────────────────────────────────── */

const PRIORITY_EMOJI: Record<string, string> = { low: "🟢", medium: "🔵", high: "🟠", urgent: "🔴" };
const STATUS_LABEL: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", review: "In Review", done: "Done", cancelled: "Cancelled",
};

export function buildTaskCreatedHtml(args: {
  workspaceName: string; projectName?: string | null;
  title: string; priority: string; assignedToName?: string | null;
  dueDate?: Date | null; description?: string | null; createdByName?: string;
}): string {
  const pe = PRIORITY_EMOJI[args.priority] ?? "⚪";
  const lines = [
    `🆕 <b>New Task</b> in <b>${escapeHtml(args.workspaceName)}</b>`,
    ``,
    `📌 <b>${escapeHtml(args.title)}</b>`,
    `${pe} Priority: <b>${args.priority}</b>`,
  ];
  if (args.projectName) lines.push(`📁 Project: <b>${escapeHtml(args.projectName)}</b>`);
  if (args.assignedToName) lines.push(`👤 Assigned: <b>${escapeHtml(args.assignedToName)}</b>`);
  if (args.dueDate) lines.push(`📅 Due: <b>${new Date(args.dueDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</b>`);
  if (args.description) lines.push(``, `📝 ${escapeHtml(args.description.slice(0, 200))}${args.description.length > 200 ? "…" : ""}`);
  if (args.createdByName) lines.push(``, `<i>by ${escapeHtml(args.createdByName)}</i>`);
  return lines.join("\n");
}

export function buildStatusChangedHtml(args: {
  workspaceName: string; title: string; from: string; to: string; byName?: string;
}): string {
  return [
    `🔄 <b>Status changed</b> · <b>${escapeHtml(args.workspaceName)}</b>`,
    ``,
    `📌 <b>${escapeHtml(args.title)}</b>`,
    `${STATUS_LABEL[args.from] ?? args.from} → <b>${STATUS_LABEL[args.to] ?? args.to}</b>`,
    args.byName ? `\n<i>by ${escapeHtml(args.byName)}</i>` : "",
  ].filter(Boolean).join("\n");
}

export function buildCommentHtml(args: {
  workspaceName: string; taskTitle: string; authorName: string; content: string;
}): string {
  return [
    `💬 <b>New comment</b> · <b>${escapeHtml(args.workspaceName)}</b>`,
    ``,
    `📌 ${escapeHtml(args.taskTitle)}`,
    `<b>${escapeHtml(args.authorName)}:</b> ${escapeHtml(args.content.slice(0, 400))}${args.content.length > 400 ? "…" : ""}`,
  ].join("\n");
}

export function buildOverdueDigestHtml(args: {
  workspaceName: string; tasks: Array<{ title: string; priority: string; dueDate: Date | null; assignedToName?: string | null }>;
}): string {
  const lines = [
    `⏰ <b>Overdue tasks</b> in <b>${escapeHtml(args.workspaceName)}</b>`,
    `(${args.tasks.length} pending)`,
    ``,
  ];
  for (const t of args.tasks.slice(0, 15)) {
    const pe = PRIORITY_EMOJI[t.priority] ?? "⚪";
    const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—";
    const assigned = t.assignedToName ? ` · ${escapeHtml(t.assignedToName)}` : "";
    lines.push(`${pe} <b>${escapeHtml(t.title)}</b> · due ${due}${assigned}`);
  }
  if (args.tasks.length > 15) lines.push(``, `…and ${args.tasks.length - 15} more.`);
  return lines.join("\n");
}

/* ── Overdue scheduler ───────────────────────────────────────────────── */

let schedulerInterval: NodeJS.Timeout | null = null;

async function runOverduePass(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();

  const settings = await db.select().from(workspaceTelegramSettingsTable)
    .where(eq(workspaceTelegramSettingsTable.enabled, true));

  for (const s of settings) {
    /* Active hours window — supports wrap-around like Personal GPT */
    const start = s.workHoursStart;
    const end = s.workHoursEnd;
    const inWindow = start === end ? true
      : start < end ? (hour >= start && hour < end)
      : (hour >= start || hour < end);
    if (!inWindow) continue;

    /* Throttle by interval */
    const intervalMs = Math.max(1, s.taskRemindIntervalHours) * 60 * 60 * 1000;
    if (s.lastOverdueRunAt && (Date.now() - s.lastOverdueRunAt.getTime()) < intervalMs) continue;

    const chatIds = parseChatIds(s.chatIds);
    if (!chatIds.length) continue;

    /* Fetch overdue tasks (status not done/cancelled, due_date < now) */
    const rows = await db.execute(sql`
      SELECT t.id, t.title, t.priority, t.due_date, u.name AS assigned_name
      FROM workspace_tasks t
      LEFT JOIN tool_users u ON u.id = t.assigned_to_tool_user_id
      WHERE t.workspace_id = ${s.workspaceId}
        AND t.status NOT IN ('done','cancelled')
        AND t.due_date IS NOT NULL
        AND t.due_date < NOW()
      ORDER BY t.due_date ASC
      LIMIT 50
    `);
    const tasks = rows.rows as Array<{ title: string; priority: string; due_date: Date | null; assigned_name: string | null }>;
    if (!tasks.length) {
      /* Update last run anyway to avoid hammering */
      await db.update(workspaceTelegramSettingsTable)
        .set({ lastOverdueRunAt: new Date() })
        .where(eq(workspaceTelegramSettingsTable.workspaceId, s.workspaceId));
      continue;
    }

    const wsRows = await db.select({ name: workspacesTable.name })
      .from(workspacesTable).where(eq(workspacesTable.id, s.workspaceId)).limit(1);
    const wsName = wsRows[0]?.name ?? `#${s.workspaceId}`;
    const token = await getBotToken();
    if (!token) continue;

    const html = buildOverdueDigestHtml({
      workspaceName: wsName,
      tasks: tasks.map(t => ({ title: t.title, priority: t.priority, dueDate: t.due_date, assignedToName: t.assigned_name })),
    });
    await sendToChats(token, chatIds, html);

    await db.update(workspaceTelegramSettingsTable)
      .set({ lastOverdueRunAt: new Date() })
      .where(eq(workspaceTelegramSettingsTable.workspaceId, s.workspaceId));
  }
}

export function startWorkspaceTaskScheduler(): void {
  if (schedulerInterval) return;
  /* Run every 5 minutes */
  schedulerInterval = setInterval(() => {
    runOverduePass().catch(err => console.error("workspace overdue pass failed:", err));
  }, 5 * 60 * 1000);
  /* First run after 60 seconds (let server settle) */
  setTimeout(() => runOverduePass().catch(err => console.error("workspace overdue first-pass failed:", err)), 60_000);
}
