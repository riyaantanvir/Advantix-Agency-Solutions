import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

export const SETTING_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TELEGRAM_NOTIFY_TASK_CREATED",
  "TELEGRAM_NOTIFY_TASK_ASSIGNED",
  "TELEGRAM_NOTIFY_TASK_STATUS",
  "TELEGRAM_NOTIFY_TASK_COMMENT",
  "TELEGRAM_NOTIFY_ASSISTANT_REQUEST",
  "TELEGRAM_NOTIFY_NEW_CONTACT",
  "TELEGRAM_NOTIFY_NEW_LEAD",
  "TELEGRAM_NOTIFY_BUG_REPORT",
] as const;

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db
    .select({ name: integrationsTable.name, value: integrationsTable.value })
    .from(integrationsTable)
    .where(inArray(integrationsTable.name, [...SETTING_KEYS]));
  const s: Record<string, string> = {};
  for (const r of rows) s[r.name] = r.value;
  return s;
}

export async function sendTelegramMessage(
  text: string,
  eventKey?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = await getSettings();

    const token = s["TELEGRAM_BOT_TOKEN"];
    const chatId = s["TELEGRAM_CHAT_ID"];
    const masterEnabled = s["TELEGRAM_NOTIFICATIONS_ENABLED"] !== "false";

    if (!masterEnabled) return { ok: false, error: "Notifications disabled" };
    if (!token || !chatId) return { ok: false, error: "Bot token or chat ID not configured" };

    if (eventKey && s[eventKey] === "false") {
      return { ok: false, error: `Event ${eventKey} notifications disabled` };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data?.description ?? `Telegram error ${res.status}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

// ── Emoji helpers ─────────────────────────────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🔵",
  high: "🟠",
  urgent: "🔴",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
};

// ── Message builders ──────────────────────────────────────────────────────────

export function buildTaskCreatedMessage(task: {
  title: string;
  priority: string;
  type: string;
  clientName?: string | null;
  assignedTo?: string | null;
  dueDate?: Date | null;
  description?: string | null;
  projectName?: string | null;
}): string {
  const pe = PRIORITY_EMOJI[task.priority] ?? "⚪";
  const typeBadge = task.type === "client" ? `👤 Client${task.clientName ? `: ${escapeHtml(task.clientName)}` : ""}` : "🏢 Internal";
  const lines = [
    `🆕 <b>New Task Created</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `${pe} Priority: <b>${capitalize(task.priority)}</b>`,
    `🏷 Type: ${typeBadge}`,
  ];
  if (task.projectName) lines.push(`📁 Project: <b>${escapeHtml(task.projectName)}</b>`);
  if (task.assignedTo) lines.push(`👤 Assigned to: <b>${escapeHtml(task.assignedTo)}</b>`);
  if (task.dueDate) lines.push(`📅 Due: <b>${new Date(task.dueDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</b>`);
  if (task.description) lines.push(``, `📝 ${escapeHtml(task.description.slice(0, 200))}${task.description.length > 200 ? "…" : ""}`);
  lines.push(``, `<i>— Advantix Admin</i>`);
  return lines.join("\n");
}

export function buildTaskAssignedMessage(task: {
  title: string;
  assignedTo: string;
  priority: string;
  type: string;
  clientName?: string | null;
  projectName?: string | null;
}): string {
  const pe = PRIORITY_EMOJI[task.priority] ?? "⚪";
  return [
    `📋 <b>Task Assigned</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `👤 Assigned to: <b>${escapeHtml(task.assignedTo)}</b>`,
    `${pe} Priority: <b>${capitalize(task.priority)}</b>`,
    task.type === "client" && task.clientName ? `🏷 Client: ${escapeHtml(task.clientName)}` : `🏢 Internal Task`,
    task.projectName ? `📁 Project: <b>${escapeHtml(task.projectName)}</b>` : null,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildStatusChangedMessage(task: {
  title: string;
  oldStatus: string;
  newStatus: string;
  assignedTo?: string | null;
  projectName?: string | null;
}): string {
  const from = STATUS_LABEL[task.oldStatus] ?? task.oldStatus;
  const to = STATUS_LABEL[task.newStatus] ?? task.newStatus;
  const statusEmoji =
    task.newStatus === "done" ? "✅" :
    task.newStatus === "cancelled" ? "❌" :
    task.newStatus === "in_progress" ? "🔄" :
    task.newStatus === "review" ? "👀" : "📋";
  return [
    `${statusEmoji} <b>Task Status Updated</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `📊 Status: <b>${from}</b> → <b>${to}</b>`,
    task.assignedTo ? `👤 Assigned to: ${escapeHtml(task.assignedTo)}` : null,
    task.projectName ? `📁 Project: ${escapeHtml(task.projectName)}` : null,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildTaskCommentMessage(data: {
  taskTitle: string;
  authorName: string;
  content: string;
  projectName?: string | null;
}): string {
  return [
    `💬 <b>New Comment on Task</b>`,
    ``,
    `📌 <b>${escapeHtml(data.taskTitle)}</b>`,
    data.projectName ? `📁 Project: ${escapeHtml(data.projectName)}` : null,
    ``,
    `👤 <b>${escapeHtml(data.authorName)}</b> commented:`,
    `<i>${escapeHtml(data.content.slice(0, 300))}${data.content.length > 300 ? "…" : ""}</i>`,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildAssistantRequestMessage(conv: {
  visitorName: string | null;
  visitorEmail: string | null;
  id: number;
}): string {
  const name = conv.visitorName ?? "Unknown visitor";
  const email = conv.visitorEmail ?? "No email";
  return [
    `🙋 <b>Human Agent Requested!</b>`,
    ``,
    `A visitor wants to speak with a real person.`,
    ``,
    `👤 <b>Name:</b> ${escapeHtml(name)}`,
    `📧 <b>Email:</b> ${escapeHtml(email)}`,
    `🆔 <b>Session ID:</b> #${conv.id}`,
    ``,
    `⚡ Go to <b>Admin → Assistant Requests</b> to respond.`,
    ``,
    `<i>— Advantix Admin</i>`,
  ].join("\n");
}

export function buildNewContactMessage(contact: {
  name: string;
  email: string;
  phone?: string | null;
  service?: string | null;
  budget?: string | null;
  message: string;
}): string {
  return [
    `📬 <b>New Contact Form Submission</b>`,
    ``,
    `👤 <b>Name:</b> ${escapeHtml(contact.name)}`,
    `📧 <b>Email:</b> ${escapeHtml(contact.email)}`,
    contact.phone ? `📞 <b>Phone:</b> ${escapeHtml(contact.phone)}` : null,
    contact.service ? `🛠 <b>Service:</b> ${escapeHtml(contact.service)}` : null,
    contact.budget ? `💰 <b>Budget:</b> ${escapeHtml(contact.budget)}` : null,
    ``,
    `💬 <b>Message:</b>`,
    `<i>${escapeHtml(contact.message.slice(0, 400))}${contact.message.length > 400 ? "…" : ""}</i>`,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildNewLeadMessage(lead: {
  service: string;
  name?: string | null;
  email?: string | null;
  sourcePage?: string | null;
}): string {
  return [
    `🎯 <b>New Lead!</b>`,
    ``,
    `🛠 <b>Service interest:</b> ${escapeHtml(lead.service)}`,
    lead.name ? `👤 <b>Name:</b> ${escapeHtml(lead.name)}` : null,
    lead.email ? `📧 <b>Email:</b> ${escapeHtml(lead.email)}` : null,
    lead.sourcePage ? `🔗 <b>Page:</b> ${escapeHtml(lead.sourcePage)}` : null,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildBugReportMessage(bug: {
  title: string;
  description: string;
  reporterName?: string | null;
  reporterEmail?: string | null;
  pageUrl?: string | null;
}): string {
  return [
    `🐛 <b>Bug Report Submitted</b>`,
    ``,
    `🏷 <b>${escapeHtml(bug.title)}</b>`,
    bug.reporterName ? `👤 <b>Reporter:</b> ${escapeHtml(bug.reporterName)}` : null,
    bug.reporterEmail ? `📧 <b>Email:</b> ${escapeHtml(bug.reporterEmail)}` : null,
    bug.pageUrl ? `🔗 <b>Page:</b> ${escapeHtml(bug.pageUrl)}` : null,
    ``,
    `📝 ${escapeHtml(bug.description.slice(0, 300))}${bug.description.length > 300 ? "…" : ""}`,
    ``,
    `⚡ Go to <b>Admin → Bug Reports</b> to review.`,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
