/* Workspace + Projects + Tasks API client (Manage Your Project tool) */

const BASE = "/api/tools/workspaces";

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error ?? msg; } catch {}
    const err: Error & { status?: number } = new Error(msg);
    err.status = r.status;
    throw err;
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export interface Workspace {
  id: number; name: string; slug: string;
  invite_code: string; owner_tool_user_id: number;
  created_at: string; updated_at: string;
  role: "owner" | "member";
  member_count: number; project_count: number;
}
export interface WorkspaceMember {
  id: number; tool_user_id: number; role: "owner" | "member";
  joined_at: string; name: string | null; email: string | null;
}
export interface WorkspaceInvite {
  id: number; email: string; expiresAt: string; createdAt: string; link: string;
}
export interface WorkspaceProject {
  id: number; workspace_id: number; name: string;
  description: string | null; color: string;
  status: "active" | "archived";
  created_by_tool_user_id: number | null;
  created_at: string; updated_at: string;
  task_count?: string | number; open_task_count?: string | number;
}
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export interface WorkspaceTask {
  id: number; workspace_id: number; project_id: number | null;
  title: string; description: string | null;
  status: TaskStatus; priority: TaskPriority;
  assigned_to_tool_user_id: number | null;
  due_date: string | null;
  created_by_tool_user_id: number | null;
  created_at: string; updated_at: string; position: number;
  assigned_to_name?: string | null; assigned_to_email?: string | null;
  created_by_name?: string | null;
  project_name?: string | null; project_color?: string | null;
}
export interface TaskComment {
  id: number; content: string; created_at: string;
  author_tool_user_id: number;
  author_name: string | null; author_email: string | null;
}
export interface WorkspaceTelegramSettings {
  workspaceId: number;
  chatIds: string | null;
  enabled: boolean;
  taskRemindIntervalHours: number;
  workHoursStart: number;
  workHoursEnd: number;
  notifyOnCreate: boolean;
  notifyOnStatusChange: boolean;
  notifyOnComment: boolean;
}

/* ── Workspaces ──────────────────────────────────────────────────── */
export const workspaceApi = {
  list: () => call<{ workspaces: Workspace[] }>(BASE),
  create: (name: string) => call<{ workspace: Workspace }>(BASE, { method: "POST", body: JSON.stringify({ name }) }),
  get: (id: number) => call<{ workspace: Workspace; myRole: "owner" | "member" }>(`${BASE}/${id}`),
  rename: (id: number, name: string) => call(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: number) => call(`${BASE}/${id}`, { method: "DELETE" }),

  members: (id: number) => call<{ members: WorkspaceMember[] }>(`${BASE}/${id}/members`),
  addMember: (id: number, email: string) =>
    call<{ status: "added" | "invited" | "already_member"; email?: string; inviteLink?: string }>(
      `${BASE}/${id}/members`, { method: "POST", body: JSON.stringify({ email }) }),
  removeMember: (id: number, memberId: number) =>
    call(`${BASE}/${id}/members/${memberId}`, { method: "DELETE" }),

  invites: (id: number) => call<{ invites: WorkspaceInvite[] }>(`${BASE}/${id}/invites`),
  revokeInvite: (id: number, inviteId: number) =>
    call(`${BASE}/${id}/invites/${inviteId}`, { method: "DELETE" }),
  regenerateInviteCode: (id: number) =>
    call<{ inviteCode: string }>(`${BASE}/${id}/regenerate-invite-code`, { method: "POST" }),
  joinByCode: (code: string) =>
    call<{ status: string; workspaceId: number; workspaceName?: string }>(
      `${BASE}/join/by-code`, { method: "POST", body: JSON.stringify({ code }) }),
  joinByToken: (token: string) =>
    call<{ status: string; workspaceId: number; workspaceName?: string }>(
      `${BASE}/join/by-token`, { method: "POST", body: JSON.stringify({ token }) }),
  invitePreview: (token: string) =>
    call<{ email: string; workspaceName: string; accepted: boolean; expired: boolean }>(
      `${BASE}/invite-preview/${token}`),

  /* Projects */
  listProjects: (wid: number) => call<{ projects: WorkspaceProject[] }>(`${BASE}/${wid}/projects`),
  createProject: (wid: number, body: { name: string; description?: string; color?: string }) =>
    call<{ project: WorkspaceProject }>(`${BASE}/${wid}/projects`, { method: "POST", body: JSON.stringify(body) }),
  getProject: (wid: number, id: number) =>
    call<{ project: WorkspaceProject }>(`${BASE}/${wid}/projects/${id}`),
  updateProject: (wid: number, id: number, patch: Partial<WorkspaceProject>) =>
    call(`${BASE}/${wid}/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (wid: number, id: number) =>
    call(`${BASE}/${wid}/projects/${id}`, { method: "DELETE" }),

  /* Tasks */
  listTasks: (wid: number, opts?: { projectId?: number | null; status?: TaskStatus; assignedToMe?: boolean }) => {
    const q = new URLSearchParams();
    if (opts?.projectId != null) q.set("projectId", String(opts.projectId));
    if (opts?.status) q.set("status", opts.status);
    if (opts?.assignedToMe) q.set("assignedToMe", "true");
    const qs = q.toString();
    return call<{ tasks: WorkspaceTask[] }>(`${BASE}/${wid}/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (wid: number, body: {
    title: string; description?: string;
    projectId?: number | null;
    status?: TaskStatus; priority?: TaskPriority;
    assignedToToolUserId?: number | null;
    dueDate?: string | null;
  }) => call<{ task: WorkspaceTask }>(`${BASE}/${wid}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  getTask: (wid: number, id: number) => call<{ task: WorkspaceTask }>(`${BASE}/${wid}/tasks/${id}`),
  updateTask: (wid: number, id: number, patch: Partial<WorkspaceTask>) =>
    call(`${BASE}/${wid}/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  setTaskStatus: (wid: number, id: number, status: TaskStatus) =>
    call(`${BASE}/${wid}/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteTask: (wid: number, id: number) =>
    call(`${BASE}/${wid}/tasks/${id}`, { method: "DELETE" }),

  /* Comments */
  listComments: (wid: number, taskId: number) =>
    call<{ comments: TaskComment[] }>(`${BASE}/${wid}/tasks/${taskId}/comments`),
  addComment: (wid: number, taskId: number, content: string) =>
    call<{ comment: TaskComment }>(`${BASE}/${wid}/tasks/${taskId}/comments`,
      { method: "POST", body: JSON.stringify({ content }) }),
  deleteComment: (wid: number, taskId: number, id: number) =>
    call(`${BASE}/${wid}/tasks/${taskId}/comments/${id}`, { method: "DELETE" }),

  /* Telegram */
  getTelegram: (wid: number) => call<{ settings: WorkspaceTelegramSettings }>(`${BASE}/${wid}/telegram`),
  updateTelegram: (wid: number, patch: Partial<WorkspaceTelegramSettings>) =>
    call(`${BASE}/${wid}/telegram`, { method: "PUT", body: JSON.stringify(patch) }),
  testTelegram: (wid: number) =>
    call<{ ok: boolean; error?: string }>(`${BASE}/${wid}/telegram/test`, { method: "POST" }),
};
