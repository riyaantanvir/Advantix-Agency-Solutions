/**
 * Advantix Admin Assistant — SSE chat with full admin tool access
 */
import { Router, type Request, type Response } from "express";
import {
  db, tasksTable, projectsTable, blogPostsTable, portfolioItemsTable,
  teamMembersTable, adminsTable, toolUsersTable, leadsTable,
} from "@workspace/db";
import {
  inboxMessagesTable, servicesTable, contactsTable,
} from "@workspace/db/schema";
import { eq, desc, asc, and, or, ilike, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import crypto from "crypto";

const router = Router();

/* ── Admin ID helper ────────────────────────────────────────────────────── */
function adminId(req: Request): number {
  return (req.session as { adminId?: number }).adminId!;
}
function adminUsername(req: Request): string {
  return (req.session as { username?: string }).username ?? "admin";
}

/* ── SSE helper ─────────────────────────────────────────────────────────── */
function sse(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/* ── AI config helper ───────────────────────────────────────────────────── */
async function getIntegration(name: string): Promise<string | null> {
  try {
    const r = await db.execute(sql`SELECT value FROM integrations WHERE name = ${name} LIMIT 1`);
    const v = (r.rows[0] as { value?: string } | undefined)?.value;
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

/* ── In-memory history ──────────────────────────────────────────────────── */
type Msg = { role: "user" | "assistant"; content: string | object[] };
const historyMap = new Map<number, Msg[]>();
const MAX_HIST = 10;

function getHist(aid: number): Msg[] {
  if (!historyMap.has(aid)) historyMap.set(aid, []);
  return historyMap.get(aid)!;
}
function pushHist(aid: number, msg: Msg) {
  const h = getHist(aid);
  h.push(msg);
  if (h.length > MAX_HIST * 2) h.splice(0, h.length - MAX_HIST * 2);
}
function clearHist(aid: number) { historyMap.delete(aid); }

/* ══════════════════════════════════════════════════════════════════════════
   TOOL DEFINITIONS
══════════════════════════════════════════════════════════════════════════ */
const ADMIN_TOOLS_DEF = [
  /* ── Overview ── */
  {
    name: "get_dashboard_overview",
    description: "Get admin dashboard overview stats: total users, active admins, pending tasks, unread inbox count, bug reports, recent activity etc.",
    input_schema: { type: "object", properties: {} },
  },

  /* ── Tasks ── */
  {
    name: "list_tasks",
    description: "List tasks with optional filters by status, priority, assigned admin, or search text.",
    input_schema: {
      type: "object",
      properties: {
        status:     { type: "string", description: "Filter by status: todo, in_progress, review, done, cancelled" },
        priority:   { type: "string", description: "Filter by priority: low, medium, high, urgent" },
        assignedTo: { type: "string", description: "Filter by assigned username" },
        search:     { type: "string", description: "Search in title/description" },
        projectId:  { type: "number", description: "Filter by project ID" },
        limit:      { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task.",
    input_schema: {
      type: "object",
      properties: {
        title:       { type: "string", description: "Task title (required)" },
        description: { type: "string" },
        status:      { type: "string", description: "todo (default), in_progress, review, done" },
        priority:    { type: "string", description: "low, medium (default), high, urgent" },
        assignedTo:  { type: "string", description: "Admin username" },
        clientName:  { type: "string" },
        dueDate:     { type: "string", description: "ISO date string" },
        projectId:   { type: "number" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task by ID.",
    input_schema: {
      type: "object",
      properties: {
        id:          { type: "number", description: "Task ID (required)" },
        title:       { type: "string" },
        description: { type: "string" },
        status:      { type: "string" },
        priority:    { type: "string" },
        assignedTo:  { type: "string" },
        dueDate:     { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Delete a task by ID.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number", description: "Task ID" } },
      required: ["id"],
    },
  },

  /* ── Projects ── */
  {
    name: "list_projects",
    description: "List all projects.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_project",
    description: "Create a new project.",
    input_schema: {
      type: "object",
      properties: {
        name:        { type: "string", description: "Project name (required)" },
        description: { type: "string" },
        clientName:  { type: "string" },
        status:      { type: "string", description: "active (default), on_hold, completed, cancelled" },
        dueDate:     { type: "string" },
      },
      required: ["name"],
    },
  },

  /* ── Blog ── */
  {
    name: "list_blog_posts",
    description: "List all blog posts (admin view — includes drafts).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: draft, published, archived" },
      },
    },
  },
  {
    name: "create_blog_post",
    description: "Create a new blog post. Can be saved as draft or published immediately.",
    input_schema: {
      type: "object",
      properties: {
        title:       { type: "string", description: "Post title (required)" },
        content:     { type: "string", description: "Post content in Markdown/HTML" },
        excerpt:     { type: "string" },
        author:      { type: "string" },
        category:    { type: "string" },
        tags:        { type: "string", description: "Comma-separated tags" },
        status:      { type: "string", description: "draft (default) or published" },
        coverImageUrl: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_blog_post",
    description: "Update a blog post by ID. Use to edit, publish, or unpublish.",
    input_schema: {
      type: "object",
      properties: {
        id:          { type: "number", description: "Post ID (required)" },
        title:       { type: "string" },
        content:     { type: "string" },
        excerpt:     { type: "string" },
        status:      { type: "string", description: "draft, published, archived" },
        author:      { type: "string" },
        category:    { type: "string" },
        tags:        { type: "string" },
        coverImageUrl: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_blog_post",
    description: "Delete a blog post by ID.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },

  /* ── Portfolio ── */
  {
    name: "list_portfolio",
    description: "List all portfolio items.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_portfolio_item",
    description: "Add a new portfolio project.",
    input_schema: {
      type: "object",
      properties: {
        title:       { type: "string", description: "Project title (required)" },
        description: { type: "string" },
        category:    { type: "string", description: "e.g. Web Development, Branding" },
        clientName:  { type: "string" },
        liveUrl:     { type: "string" },
        imageUrl:    { type: "string" },
        tags:        { type: "string" },
        featured:    { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_portfolio_item",
    description: "Update a portfolio item by ID.",
    input_schema: {
      type: "object",
      properties: {
        id:          { type: "number", description: "Item ID (required)" },
        title:       { type: "string" },
        description: { type: "string" },
        category:    { type: "string" },
        clientName:  { type: "string" },
        liveUrl:     { type: "string" },
        imageUrl:    { type: "string" },
        featured:    { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_portfolio_item",
    description: "Delete a portfolio item by ID.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },

  /* ── Team ── */
  {
    name: "list_team_members",
    description: "List all team members.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_team_member",
    description: "Add a new team member to the website.",
    input_schema: {
      type: "object",
      properties: {
        name:        { type: "string", description: "Member name (required)" },
        role:        { type: "string", description: "Job title (required)" },
        bio:         { type: "string" },
        email:       { type: "string" },
        linkedinUrl: { type: "string" },
        photoUrl:    { type: "string" },
      },
      required: ["name", "role"],
    },
  },
  {
    name: "update_team_member",
    description: "Update a team member by ID.",
    input_schema: {
      type: "object",
      properties: {
        id:          { type: "number", description: "Member ID (required)" },
        name:        { type: "string" },
        role:        { type: "string" },
        bio:         { type: "string" },
        email:       { type: "string" },
        linkedinUrl: { type: "string" },
        photoUrl:    { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_team_member",
    description: "Remove a team member by ID.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },

  /* ── Users (Tool Users) ── */
  {
    name: "list_tool_users",
    description: "List all tool users (people with access to Advantix tools like SMM, assistant etc.).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_tool_user",
    description: "Create a new tool user account.",
    input_schema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Unique username (required)" },
        email:    { type: "string" },
        password: { type: "string", description: "Plain password (required)" },
        name:     { type: "string" },
      },
      required: ["username", "password"],
    },
  },
  {
    name: "delete_tool_user",
    description: "Delete a tool user by ID.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },

  /* ── Admins ── */
  {
    name: "list_admins",
    description: "List all admin accounts.",
    input_schema: { type: "object", properties: {} },
  },

  /* ── Contacts & Leads ── */
  {
    name: "list_contacts",
    description: "List contact form submissions from the website.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max results (default 20)" } },
    },
  },
  {
    name: "list_leads",
    description: "List all leads in the system.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },

  /* ── Inbox ── */
  {
    name: "list_inbox",
    description: "List email inbox threads. Shows latest message per conversation.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max threads (default 15)" } },
    },
  },
  {
    name: "get_thread_messages",
    description: "Get all messages in an email thread by threadId.",
    input_schema: {
      type: "object",
      properties: { threadId: { type: "string", description: "Thread ID" } },
      required: ["threadId"],
    },
  },
  {
    name: "reply_to_email",
    description: "Send an email reply to a thread.",
    input_schema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Thread ID to reply to" },
        body:     { type: "string", description: "Reply message body (plain text)" },
      },
      required: ["threadId", "body"],
    },
  },

  /* ── Services ── */
  {
    name: "list_services",
    description: "List all services on the website.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_service",
    description: "Update a service's details.",
    input_schema: {
      type: "object",
      properties: {
        id:               { type: "number", description: "Service ID (required)" },
        name:             { type: "string" },
        shortDescription: { type: "string" },
        price:            { type: "string" },
        isActive:         { type: "boolean" },
      },
      required: ["id"],
    },
  },

  /* ── Website Analytics ── */
  {
    name: "get_analytics",
    description: "Get website analytics summary: page views, top pages, visitor countries, recent events.",
    input_schema: { type: "object", properties: {} },
  },

  /* ── Invoice Generator ── */
  {
    name: "generate_invoice",
    description: "Generate a formatted invoice in markdown that can be copy-pasted or shared.",
    input_schema: {
      type: "object",
      properties: {
        clientName:    { type: "string", description: "Client name (required)" },
        clientEmail:   { type: "string" },
        invoiceNumber: { type: "string", description: "Invoice # (auto-generated if not provided)" },
        items: {
          type: "array",
          description: "Line items",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity:    { type: "number" },
              unitPrice:   { type: "number" },
            },
          },
        },
        currency: { type: "string", description: "USD (default), BDT, EUR, GBP" },
        notes:    { type: "string" },
        dueDate:  { type: "string" },
      },
      required: ["clientName", "items"],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   TOOL EXECUTION
══════════════════════════════════════════════════════════════════════════ */
async function executeTool(name: string, input: Record<string, unknown>, req: Request): Promise<string> {
  const me = adminUsername(req);

  try {

    /* ── Dashboard Overview ── */
    if (name === "get_dashboard_overview") {
      const r = await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM tool_users) AS total_users,
          (SELECT COUNT(*)::int FROM admins) AS total_admins,
          (SELECT COUNT(*)::int FROM tasks WHERE status NOT IN ('done','completed','cancelled','closed')) AS pending_tasks,
          (SELECT COUNT(*)::int FROM tasks) AS total_tasks,
          (SELECT COUNT(*)::int FROM bug_reports WHERE status NOT IN ('resolved','closed')) AS pending_bugs,
          (SELECT COUNT(*)::int FROM inbox_messages WHERE is_read = false AND direction = 'inbound') AS unread_inbox,
          (SELECT COUNT(*)::int FROM contacts) AS total_contacts,
          (SELECT COUNT(*)::int FROM leads) AS total_leads,
          (SELECT COUNT(*)::int FROM blog_posts WHERE status = 'published') AS published_posts,
          (SELECT COUNT(*)::int FROM blog_posts WHERE status = 'draft') AS draft_posts,
          (SELECT COUNT(*)::int FROM portfolio_items) AS portfolio_items,
          (SELECT COUNT(*)::int FROM team_members) AS team_members
      `);
      const s = r.rows[0] as Record<string, number>;
      return [
        "📊 **Dashboard Overview**",
        `👥 Tool Users: ${s.total_users} | Admins: ${s.total_admins}`,
        `✅ Pending Tasks: ${s.pending_tasks} / ${s.total_tasks} total`,
        `🐛 Pending Bugs: ${s.pending_bugs}`,
        `📬 Unread Inbox: ${s.unread_inbox}`,
        `📋 Contacts: ${s.total_contacts} | Leads: ${s.total_leads}`,
        `📝 Blog: ${s.published_posts} published, ${s.draft_posts} drafts`,
        `🖼️  Portfolio: ${s.portfolio_items} items | Team: ${s.team_members} members`,
      ].join("\n");
    }

    /* ── Tasks ── */
    if (name === "list_tasks") {
      const limit = Number(input.limit ?? 20);
      let q = db.select().from(tasksTable).$dynamic();
      const conds = [];
      if (input.status) conds.push(eq(tasksTable.status, String(input.status)));
      if (input.priority) conds.push(eq(tasksTable.priority, String(input.priority)));
      if (input.assignedTo) conds.push(eq(tasksTable.assignedTo, String(input.assignedTo)));
      if (input.projectId) conds.push(eq(tasksTable.projectId, Number(input.projectId)));
      if (input.search) {
        const s = `%${String(input.search)}%`;
        conds.push(or(ilike(tasksTable.title, s), ilike(tasksTable.description ?? tasksTable.title, s)));
      }
      if (conds.length) q = q.where(and(...conds));
      const tasks = await q.orderBy(asc(tasksTable.position), desc(tasksTable.createdAt)).limit(limit);
      if (!tasks.length) return "No tasks found.";
      return tasks.map(t =>
        `[#${t.id}] **${t.title}** — ${t.status} | ${t.priority} | ${t.assignedTo ?? "unassigned"}${t.dueDate ? ` | Due: ${new Date(t.dueDate).toLocaleDateString()}` : ""}`
      ).join("\n");
    }

    if (name === "create_task") {
      const [task] = await db.insert(tasksTable).values({
        title: String(input.title),
        description: input.description ? String(input.description) : null,
        status: input.status ? String(input.status) : "todo",
        priority: input.priority ? String(input.priority) : "medium",
        type: "internal",
        clientName: input.clientName ? String(input.clientName) : null,
        assignedTo: input.assignedTo ? String(input.assignedTo) : null,
        dueDate: input.dueDate ? new Date(String(input.dueDate)) : null,
        projectId: input.projectId ? Number(input.projectId) : null,
        createdBy: me,
      }).returning();
      return `✅ Task created: [#${task.id}] **${task.title}** (${task.status}, ${task.priority})`;
    }

    if (name === "update_task") {
      const id = Number(input.id);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title) updates.title = String(input.title);
      if (input.description !== undefined) updates.description = input.description ? String(input.description) : null;
      if (input.status) updates.status = String(input.status);
      if (input.priority) updates.priority = String(input.priority);
      if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo ? String(input.assignedTo) : null;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate ? new Date(String(input.dueDate)) : null;
      const [t] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
      if (!t) return `Task #${id} not found.`;
      return `✅ Task #${id} updated: **${t.title}** → ${t.status}`;
    }

    if (name === "delete_task") {
      const id = Number(input.id);
      await db.delete(tasksTable).where(eq(tasksTable.id, id));
      return `🗑️ Task #${id} deleted.`;
    }

    /* ── Projects ── */
    if (name === "list_projects") {
      const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));
      if (!projects.length) return "No projects found.";
      return projects.map(p =>
        `[#${p.id}] **${p.name}** — ${p.status}${p.clientName ? ` | Client: ${p.clientName}` : ""}${p.dueDate ? ` | Due: ${new Date(p.dueDate).toLocaleDateString()}` : ""}`
      ).join("\n");
    }

    if (name === "create_project") {
      const [p] = await db.insert(projectsTable).values({
        name: String(input.name),
        description: input.description ? String(input.description) : null,
        clientName: input.clientName ? String(input.clientName) : null,
        status: input.status ? String(input.status) : "active",
        dueDate: input.dueDate ? new Date(String(input.dueDate)) : null,
      }).returning();
      return `✅ Project created: [#${p.id}] **${p.name}** (${p.status})`;
    }

    /* ── Blog ── */
    if (name === "list_blog_posts") {
      let q = db.select({
        id: blogPostsTable.id, title: blogPostsTable.title, status: blogPostsTable.status,
        author: blogPostsTable.author, category: blogPostsTable.category,
        publishedAt: blogPostsTable.publishedAt, views: blogPostsTable.views,
      }).from(blogPostsTable).$dynamic();
      if (input.status) q = q.where(eq(blogPostsTable.status, String(input.status)));
      const posts = await q.orderBy(desc(blogPostsTable.createdAt)).limit(20);
      if (!posts.length) return "No blog posts found.";
      return posts.map(p =>
        `[#${p.id}] **${p.title}** — ${p.status}${p.author ? ` | by ${p.author}` : ""}${p.category ? ` [${p.category}]` : ""}${p.publishedAt ? ` | ${new Date(p.publishedAt).toLocaleDateString()}` : ""} | 👁️ ${p.views ?? 0}`
      ).join("\n");
    }

    if (name === "create_blog_post") {
      const isPublished = String(input.status ?? "draft") === "published";
      const slugBase = String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = `${slugBase}-${Date.now()}`;
      const [post] = await db.insert(blogPostsTable).values({
        title: String(input.title),
        slug,
        content: String(input.content),
        excerpt: input.excerpt ? String(input.excerpt) : String(input.content).slice(0, 200),
        author: input.author ? String(input.author) : me,
        category: input.category ? String(input.category) : null,
        tags: input.tags ? (String(input.tags).split(",").map(t => t.trim())) : [],
        status: isPublished ? "published" : "draft",
        publishedAt: isPublished ? new Date() : null,
        coverImageUrl: input.coverImageUrl ? String(input.coverImageUrl) : null,
      }).returning();
      return `✅ Blog post created: [#${post.id}] **${post.title}** (${post.status})\nSlug: /blog/${post.slug}`;
    }

    if (name === "update_blog_post") {
      const id = Number(input.id);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title) updates.title = String(input.title);
      if (input.content) updates.content = String(input.content);
      if (input.excerpt) updates.excerpt = String(input.excerpt);
      if (input.author) updates.author = String(input.author);
      if (input.category !== undefined) updates.category = input.category ? String(input.category) : null;
      if (input.tags) updates.tags = String(input.tags).split(",").map(t => t.trim());
      if (input.coverImageUrl !== undefined) updates.coverImageUrl = input.coverImageUrl ? String(input.coverImageUrl) : null;
      if (input.status) {
        updates.status = String(input.status);
        if (String(input.status) === "published") updates.publishedAt = new Date();
      }
      const [post] = await db.update(blogPostsTable).set(updates).where(eq(blogPostsTable.id, id)).returning();
      if (!post) return `Blog post #${id} not found.`;
      return `✅ Blog post #${id} updated: **${post.title}** → ${post.status}`;
    }

    if (name === "delete_blog_post") {
      const id = Number(input.id);
      await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
      return `🗑️ Blog post #${id} deleted.`;
    }

    /* ── Portfolio ── */
    if (name === "list_portfolio") {
      const items = await db.select({
        id: portfolioItemsTable.id, title: portfolioItemsTable.title,
        category: portfolioItemsTable.category, clientName: portfolioItemsTable.clientName,
        featured: portfolioItemsTable.featured, liveUrl: portfolioItemsTable.liveUrl,
      }).from(portfolioItemsTable).orderBy(desc(portfolioItemsTable.id)).limit(20);
      if (!items.length) return "No portfolio items.";
      return items.map(p =>
        `[#${p.id}] **${p.title}** [${p.category ?? "—"}]${p.clientName ? ` | ${p.clientName}` : ""}${p.featured ? " ⭐" : ""}${p.liveUrl ? ` | ${p.liveUrl}` : ""}`
      ).join("\n");
    }

    if (name === "create_portfolio_item") {
      const [item] = await db.insert(portfolioItemsTable).values({
        title: String(input.title),
        description: input.description ? String(input.description) : null,
        category: input.category ? String(input.category) : null,
        clientName: input.clientName ? String(input.clientName) : null,
        liveUrl: input.liveUrl ? String(input.liveUrl) : null,
        imageUrl: input.imageUrl ? String(input.imageUrl) : null,
        tags: input.tags ? String(input.tags).split(",").map(t => t.trim()) : [],
        featured: input.featured === true,
      }).returning();
      return `✅ Portfolio item created: [#${item.id}] **${item.title}**`;
    }

    if (name === "update_portfolio_item") {
      const id = Number(input.id);
      const updates: Record<string, unknown> = {};
      if (input.title) updates.title = String(input.title);
      if (input.description !== undefined) updates.description = input.description ? String(input.description) : null;
      if (input.category !== undefined) updates.category = input.category ? String(input.category) : null;
      if (input.clientName !== undefined) updates.clientName = input.clientName ? String(input.clientName) : null;
      if (input.liveUrl !== undefined) updates.liveUrl = input.liveUrl ? String(input.liveUrl) : null;
      if (input.imageUrl !== undefined) updates.imageUrl = input.imageUrl ? String(input.imageUrl) : null;
      if (input.featured !== undefined) updates.featured = Boolean(input.featured);
      const [item] = await db.update(portfolioItemsTable).set(updates).where(eq(portfolioItemsTable.id, id)).returning();
      if (!item) return `Portfolio item #${id} not found.`;
      return `✅ Portfolio item #${id} updated: **${item.title}**`;
    }

    if (name === "delete_portfolio_item") {
      const id = Number(input.id);
      await db.delete(portfolioItemsTable).where(eq(portfolioItemsTable.id, id));
      return `🗑️ Portfolio item #${id} deleted.`;
    }

    /* ── Team ── */
    if (name === "list_team_members") {
      const members = await db.select().from(teamMembersTable).orderBy(teamMembersTable.id);
      if (!members.length) return "No team members.";
      return members.map(m =>
        `[#${m.id}] **${m.name}** — ${m.role}${m.email ? ` | ${m.email}` : ""}${m.linkedinUrl ? ` | LinkedIn: ${m.linkedinUrl}` : ""}`
      ).join("\n");
    }

    if (name === "create_team_member") {
      const [m] = await db.insert(teamMembersTable).values({
        name: String(input.name),
        role: String(input.role),
        bio: input.bio ? String(input.bio) : null,
        email: input.email ? String(input.email) : null,
        linkedinUrl: input.linkedinUrl ? String(input.linkedinUrl) : null,
        photoUrl: input.photoUrl ? String(input.photoUrl) : null,
      }).returning();
      return `✅ Team member added: [#${m.id}] **${m.name}** — ${m.role}`;
    }

    if (name === "update_team_member") {
      const id = Number(input.id);
      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = String(input.name);
      if (input.role) updates.role = String(input.role);
      if (input.bio !== undefined) updates.bio = input.bio ? String(input.bio) : null;
      if (input.email !== undefined) updates.email = input.email ? String(input.email) : null;
      if (input.linkedinUrl !== undefined) updates.linkedinUrl = input.linkedinUrl ? String(input.linkedinUrl) : null;
      if (input.photoUrl !== undefined) updates.photoUrl = input.photoUrl ? String(input.photoUrl) : null;
      const [m] = await db.update(teamMembersTable).set(updates).where(eq(teamMembersTable.id, id)).returning();
      if (!m) return `Team member #${id} not found.`;
      return `✅ Team member #${id} updated: **${m.name}** — ${m.role}`;
    }

    if (name === "delete_team_member") {
      const id = Number(input.id);
      await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id));
      return `🗑️ Team member #${id} removed.`;
    }

    /* ── Tool Users ── */
    if (name === "list_tool_users") {
      const users = await db.select({
        id: toolUsersTable.id, username: toolUsersTable.username,
        email: toolUsersTable.email, name: toolUsersTable.name, createdAt: toolUsersTable.createdAt,
      }).from(toolUsersTable).orderBy(desc(toolUsersTable.createdAt)).limit(30);
      if (!users.length) return "No tool users.";
      return users.map(u =>
        `[#${u.id}] **${u.username}**${u.name ? ` (${u.name})` : ""}${u.email ? ` | ${u.email}` : ""} | Joined: ${new Date(u.createdAt).toLocaleDateString()}`
      ).join("\n");
    }

    if (name === "create_tool_user") {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash(String(input.password), 10);
      const [u] = await db.insert(toolUsersTable).values({
        username: String(input.username),
        email: input.email ? String(input.email) : null,
        name: input.name ? String(input.name) : null,
        passwordHash: hash,
      }).returning();
      return `✅ Tool user created: [#${u.id}] **${u.username}**`;
    }

    if (name === "delete_tool_user") {
      const id = Number(input.id);
      await db.delete(toolUsersTable).where(eq(toolUsersTable.id, id));
      return `🗑️ Tool user #${id} deleted.`;
    }

    /* ── Admins ── */
    if (name === "list_admins") {
      const admins = await db.select({
        id: adminsTable.id, username: adminsTable.username,
        isSuperAdmin: adminsTable.isSuperAdmin, createdAt: adminsTable.createdAt,
      }).from(adminsTable).orderBy(adminsTable.id);
      if (!admins.length) return "No admins.";
      return admins.map(a =>
        `[#${a.id}] **${a.username}**${a.isSuperAdmin ? " 👑 (Super Admin)" : ""} | Joined: ${new Date(a.createdAt).toLocaleDateString()}`
      ).join("\n");
    }

    /* ── Contacts ── */
    if (name === "list_contacts") {
      const limit = Number(input.limit ?? 20);
      const contacts = await db.select({
        id: contactsTable.id, name: contactsTable.name, email: contactsTable.email,
        phone: contactsTable.phone, service: contactsTable.service,
        budget: contactsTable.budget, createdAt: contactsTable.createdAt,
      }).from(contactsTable).orderBy(desc(contactsTable.createdAt)).limit(limit);
      if (!contacts.length) return "No contacts found.";
      return contacts.map(c =>
        `[#${c.id}] **${c.name}** — ${c.email}${c.phone ? ` | ${c.phone}` : ""}${c.service ? ` | Service: ${c.service}` : ""}${c.budget ? ` | Budget: ${c.budget}` : ""} | ${new Date(c.createdAt).toLocaleDateString()}`
      ).join("\n");
    }

    /* ── Leads ── */
    if (name === "list_leads") {
      const limit = Number(input.limit ?? 20);
      const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)).limit(limit);
      if (!leads.length) return "No leads found.";
      return leads.map((l: any) =>
        `[#${l.id}] **${l.name ?? l.email}**${l.email ? ` | ${l.email}` : ""}${l.status ? ` | ${l.status}` : ""}${l.source ? ` | src: ${l.source}` : ""} | ${new Date(l.createdAt).toLocaleDateString()}`
      ).join("\n");
    }

    /* ── Inbox ── */
    if (name === "list_inbox") {
      const limit = Number(input.limit ?? 15);
      const threads = await db.execute(sql`
        SELECT DISTINCT ON (m.thread_id)
          m.thread_id, m.from_email, m.from_name, m.subject, m.body_text, m.is_read, m.received_at
        FROM inbox_messages m
        WHERE m.thread_id IN (SELECT thread_id FROM inbox_messages WHERE direction = 'inbound')
        ORDER BY m.thread_id, m.received_at DESC
        LIMIT ${limit}
      `);
      const list = (threads.rows as any[])
        .sort((a: any, b: any) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
        .slice(0, limit);
      if (!list.length) return "Inbox is empty.";
      return list.map((t: any) =>
        `${t.is_read ? "📧" : "📬"} **${t.from_name ?? t.from_email}** — ${t.subject ?? "(no subject)"}${!t.is_read ? " **(unread)**" : ""}\n  Preview: ${String(t.body_text ?? "").slice(0, 80)}\n  Thread ID: \`${t.thread_id}\``
      ).join("\n\n");
    }

    if (name === "get_thread_messages") {
      const threadId = String(input.threadId);
      const msgs = await db.select().from(inboxMessagesTable)
        .where(eq(inboxMessagesTable.threadId, threadId))
        .orderBy(inboxMessagesTable.receivedAt);
      if (!msgs.length) return "Thread not found.";
      return msgs.map(m =>
        `**[${m.direction === "inbound" ? "📨 From" : "📤 Sent"}]** ${m.fromName ?? m.fromEmail} → ${m.toEmail}\n**Subject:** ${m.subject ?? "(none)"}\n**Date:** ${m.receivedAt ? new Date(m.receivedAt).toLocaleString() : ""}\n\n${(m.bodyText ?? m.bodyHtml ?? "").slice(0, 500)}\n\n---`
      ).join("\n");
    }

    if (name === "reply_to_email") {
      const threadId = String(input.threadId);
      const body = String(input.body);
      const [origMsg] = await db.execute(sql`
        SELECT from_email, from_name, subject FROM inbox_messages
        WHERE thread_id = ${threadId} AND direction = 'inbound'
        ORDER BY received_at ASC LIMIT 1
      `).then(r => r.rows as any[]);
      if (!origMsg) return `Thread ${threadId} not found.`;
      const fromEmail = await getIntegration("RESEND_FROM_EMAIL") ?? "hello@advantix.digital";
      const { sendEmail } = await import("../services/resendMailer.js");
      const result = await sendEmail({
        from: fromEmail,
        to: origMsg.from_email,
        subject: `Re: ${origMsg.subject ?? "(no subject)"}`,
        text: body,
      });
      if (!result.ok) return `❌ Failed to send reply: ${result.error}`;
      await db.insert(inboxMessagesTable).values({
        threadId,
        direction: "outbound",
        fromEmail,
        toEmail: origMsg.from_email,
        subject: `Re: ${origMsg.subject ?? "(no subject)"}`,
        bodyText: body,
        isRead: true,
        receivedAt: new Date(),
      });
      return `✅ Reply sent to ${origMsg.from_email}`;
    }

    /* ── Services ── */
    if (name === "list_services") {
      const svcs = await db.select().from(servicesTable).orderBy(servicesTable.order, servicesTable.id);
      if (!svcs.length) return "No services.";
      return svcs.map(s =>
        `[#${s.id}] **${s.name}** — ${s.isActive ? "✅ Active" : "❌ Inactive"}${s.shortDescription ? `: ${s.shortDescription.slice(0, 80)}` : ""}${s.price ? ` | from ${s.price}` : ""}`
      ).join("\n");
    }

    if (name === "update_service") {
      const id = Number(input.id);
      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = String(input.name);
      if (input.shortDescription !== undefined) updates.shortDescription = input.shortDescription ? String(input.shortDescription) : null;
      if (input.price !== undefined) updates.price = input.price ? String(input.price) : null;
      if (input.isActive !== undefined) updates.isActive = Boolean(input.isActive);
      const [s] = await db.update(servicesTable).set(updates).where(eq(servicesTable.id, id)).returning();
      if (!s) return `Service #${id} not found.`;
      return `✅ Service #${id} updated: **${s.name}** — ${s.isActive ? "Active" : "Inactive"}`;
    }

    /* ── Analytics ── */
    if (name === "get_analytics") {
      const [totals, topPages] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total_events,
                 COUNT(DISTINCT session_id) AS total_sessions,
                 COUNT(DISTINCT CASE WHEN type = 'pageview' THEN session_id END) AS unique_visitors
          FROM page_events WHERE created_at > NOW() - INTERVAL '30 days'
        `),
        db.execute(sql`
          SELECT path, COUNT(*)::int AS views
          FROM page_events WHERE type = 'pageview' AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY path ORDER BY views DESC LIMIT 8
        `),
      ]);
      const t = totals.rows[0] as any;
      const lines = [
        "📈 **Website Analytics (Last 30 Days)**",
        `Total Events: ${t.total_events} | Sessions: ${t.total_sessions} | Unique Visitors: ${t.unique_visitors}`,
        "",
        "**Top Pages:**",
        ...(topPages.rows as any[]).map(p => `  • ${p.path} — ${p.views} views`),
      ];
      return lines.join("\n");
    }

    /* ── Invoice Generator ── */
    if (name === "generate_invoice") {
      const currency = String(input.currency ?? "USD");
      const items = (input.items as any[]) ?? [];
      const invNum = input.invoiceNumber ? String(input.invoiceNumber) : `INV-${Date.now().toString().slice(-6)}`;
      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const dueDate = input.dueDate ? new Date(String(input.dueDate)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Upon receipt";

      let subtotal = 0;
      const lineItems = items.map((item: any) => {
        const qty = Number(item.quantity ?? 1);
        const price = Number(item.unitPrice ?? 0);
        const total = qty * price;
        subtotal += total;
        return `| ${item.description ?? "Service"} | ${qty} | ${currency} ${price.toFixed(2)} | ${currency} ${total.toFixed(2)} |`;
      });

      const tax = subtotal * 0; // no tax by default
      const grand = subtotal + tax;

      return [
        `# 🧾 Invoice ${invNum}`,
        ``,
        `**Date:** ${today}`,
        `**Due:** ${dueDate}`,
        ``,
        `**From:**`,
        `Advantix Digital | hello@advantix.digital | advantix.digital`,
        ``,
        `**To:**`,
        `${String(input.clientName)}${input.clientEmail ? ` | ${input.clientEmail}` : ""}`,
        ``,
        `| Description | Qty | Unit Price | Total |`,
        `|---|---|---|---|`,
        ...lineItems,
        ``,
        `**Subtotal:** ${currency} ${subtotal.toFixed(2)}`,
        `**Total Due: ${currency} ${grand.toFixed(2)}**`,
        ``,
        input.notes ? `**Notes:** ${input.notes}` : "",
      ].filter(l => l !== undefined).join("\n");
    }

    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Error executing ${name}: ${String(err)}`;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CHAT ENDPOINT
══════════════════════════════════════════════════════════════════════════ */

router.post("/admin/assistant/chat", requireAdmin, async (req: Request, res: Response) => {
  const aid = adminId(req);
  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  /* Load AI config */
  const [providerSetting, modelSetting] = await Promise.all([
    getIntegration("ASSISTANT_PROVIDER"),
    getIntegration("ASSISTANT_MODEL"),
  ]);

  type Provider = "anthropic" | "openai" | "openrouter";
  const provider: Provider = (providerSetting as Provider) || "anthropic";
  const KEY_NAMES: Record<Provider, string> = {
    anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", openrouter: "OPENROUTER_API_KEY",
  };
  const URLS: Record<Provider, string> = {
    anthropic: "https://api.anthropic.com/v1/messages",
    openai: "https://api.openai.com/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
  };
  const DEFAULT_MODELS: Record<Provider, string> = {
    anthropic: "claude-opus-4-5", openai: "gpt-4o", openrouter: "anthropic/claude-opus-4-5",
  };

  const apiKey = await getIntegration(KEY_NAMES[provider]) ?? process.env[KEY_NAMES[provider]] ?? "";
  if (!apiKey) {
    sse(res, { type: "error", message: `${KEY_NAMES[provider]} not configured.` });
    res.end(); return;
  }
  const model = modelSetting || DEFAULT_MODELS[provider];

  const systemPrompt = `You are Advantix Admin Assistant — the AI-powered control center for Advantix Digital agency.
You have full access to all admin operations: tasks, projects, blog, portfolio, team, users, contacts, leads, inbox, services, analytics, and invoices.
You are speaking with: ${adminUsername(req)}.
Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
Always confirm BEFORE deleting anything. Be concise and professional. Use Markdown formatting.
For large operations (bulk delete, mass update), list what you're about to do and ask for confirmation first.`;

  pushHist(aid, { role: "user", content: message });

  const hist = getHist(aid);
  const toOAI = (tools: typeof ADMIN_TOOLS_DEF) => tools.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const MAX_ROUNDS = 8;

  /* ── callAI — single non-streaming round-trip ── */
  async function callAI(messages: Msg[]): Promise<{
    text: string;
    toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
    contentBlocks: object[];
  }> {
    if (provider === "anthropic") {
      const r = await fetch(URLS.anthropic, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model, max_tokens: 2048,
          system: systemPrompt,
          tools: ADMIN_TOOLS_DEF.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
          messages,
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Anthropic API error (${r.status}): ${errText.slice(0, 200)}`);
      }
      const d = await r.json() as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: object }>;
      };
      const contentBlocks: object[] = d.content;
      const text = d.content.filter(b => b.type === "text").map(b => (b as any).text ?? "").join("");
      const toolCalls = d.content
        .filter(b => b.type === "tool_use")
        .map(b => ({
          id: (b as any).id ?? crypto.randomUUID(),
          name: (b as any).name ?? "",
          input: (b as any).input ?? {},
        }));
      return { text, toolCalls, contentBlocks };
    } else {
      /* OpenAI / OpenRouter — non-streaming */
      const oaiMsgs = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
      ];
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      if (provider === "openrouter") headers["HTTP-Referer"] = "https://advantix.digital";
      const r = await fetch(URLS[provider], {
        method: "POST",
        headers,
        body: JSON.stringify({ model, max_tokens: 2048, messages: oaiMsgs, tools: toOAI(ADMIN_TOOLS_DEF) }),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`AI API error (${provider} ${r.status}): ${errText.slice(0, 200)}`);
      }
      const d = await r.json() as {
        choices: Array<{ message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
      };
      const choice = d.choices?.[0];
      const text = choice?.message?.content ?? "";
      const toolCalls = (choice?.message?.tool_calls ?? []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
      }));
      return { text, toolCalls, contentBlocks: [] };
    }
  }

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { text, toolCalls, contentBlocks } = await callAI(getHist(aid));

      /* Stream text to client */
      if (text) {
        sse(res, { type: "text_delta", text });
      }

      /* Notify tool calls start */
      for (const tc of toolCalls) {
        sse(res, { type: "tool_start", tool: tc.name });
      }

      /* Save assistant turn to history */
      if (provider === "anthropic" && contentBlocks.length > 0) {
        pushHist(aid, { role: "assistant", content: contentBlocks });
      } else {
        pushHist(aid, { role: "assistant", content: text });
      }

      /* No tool calls — done */
      if (toolCalls.length === 0) {
        sse(res, { type: "done" });
        res.end(); return;
      }

      /* Execute tools */
      for (const tc of toolCalls) {
        sse(res, { type: "tool_running", tool: tc.name });
        const result = await executeTool(tc.name, tc.input, req);
        sse(res, { type: "tool_result", tool: tc.name, result: result.slice(0, 2000) });

        if (provider === "anthropic") {
          pushHist(aid, {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: tc.id, content: result }],
          });
        } else {
          pushHist(aid, { role: "user", content: `Tool result for ${tc.name}:\n${result}` });
        }
      }
    }

    sse(res, { type: "error", message: "Max processing rounds reached." });
    res.end();
  } catch (err) {
    sse(res, { type: "error", message: String(err) });
    res.end();
  }
});

/* ── Clear history ─────────────────────────────────────────────────────── */
router.delete("/admin/assistant/history", requireAdmin, (req: Request, res: Response) => {
  clearHist(adminId(req));
  res.json({ ok: true });
});

/* ── Permissions check ─────────────────────────────────────────────────── */
router.get("/admin/assistant/tools", requireAdmin, (_req: Request, res: Response) => {
  res.json({ tools: ADMIN_TOOLS_DEF.map(t => ({ name: t.name, description: t.description })) });
});

export default router;
