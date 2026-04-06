import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const SETTING_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFICATIONS_ENABLED",
  "TELEGRAM_NOTIFY_TASK_CREATED",
  "TELEGRAM_NOTIFY_TASK_ASSIGNED",
  "TELEGRAM_NOTIFY_TASK_STATUS",
  "TELEGRAM_NOTIFY_ASSISTANT_REQUEST",
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

    // Check per-event toggle if provided
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

export function buildTaskCreatedMessage(task: {
  title: string;
  priority: string;
  type: string;
  clientName?: string | null;
  assignedTo?: string | null;
  dueDate?: Date | null;
  description?: string | null;
}): string {
  const pe = PRIORITY_EMOJI[task.priority] ?? "⚪";
  const typeBadge = task.type === "client" ? `👤 Client${task.clientName ? `: ${task.clientName}` : ""}` : "🏢 Internal";
  const lines = [
    `🆕 <b>New Task Created</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `${pe} Priority: <b>${capitalize(task.priority)}</b>`,
    `🏷 Type: ${typeBadge}`,
  ];
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
}): string {
  const pe = PRIORITY_EMOJI[task.priority] ?? "⚪";
  return [
    `📋 <b>Task Assigned</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `👤 Assigned to: <b>${escapeHtml(task.assignedTo)}</b>`,
    `${pe} Priority: <b>${capitalize(task.priority)}</b>`,
    task.type === "client" && task.clientName ? `🏷 Client: ${escapeHtml(task.clientName)}` : `🏢 Internal Task`,
    ``,
    `<i>— Advantix Admin</i>`,
  ].filter(Boolean).join("\n");
}

export function buildStatusChangedMessage(task: {
  title: string;
  oldStatus: string;
  newStatus: string;
  assignedTo?: string | null;
}): string {
  const from = STATUS_LABEL[task.oldStatus] ?? task.oldStatus;
  const to = STATUS_LABEL[task.newStatus] ?? task.newStatus;
  const statusEmoji = task.newStatus === "done" ? "✅" : task.newStatus === "cancelled" ? "❌" : task.newStatus === "in_progress" ? "🔄" : task.newStatus === "review" ? "👀" : "📋";
  return [
    `${statusEmoji} <b>Task Status Updated</b>`,
    ``,
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `📊 Status: <b>${from}</b> → <b>${to}</b>`,
    task.assignedTo ? `👤 Assigned to: ${escapeHtml(task.assignedTo)}` : null,
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
