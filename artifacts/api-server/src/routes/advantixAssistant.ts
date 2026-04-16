import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import { requireAdmin } from "../middleware/auth.js";
import { getAgentScript } from "../lib/agentScript.js";
import {
  isAgentConnected, getAgentInfo, sendToolCall, registerAgent,
  setAgentInfo, removeAgent, resolveToolCall,
  type AgentSystemInfo, type ToolResult,
} from "../lib/agentManager.js";
import type WebSocket from "ws";
import type { IncomingMessage } from "http";

const router = Router();

/* GET /agent.mjs — download the local agent script */
router.get("/tools/assistant/agent.mjs", (_req: Request, res: Response) => {
  const serverUrl = process.env.NODE_ENV === "production"
    ? "https://advantix.digital"
    : "http://localhost:" + (process.env.PORT ?? "8080");
  const script = getAgentScript(serverUrl);
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Content-Disposition", 'attachment; filename="agent.mjs"');
  res.send(script);
});

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/* Cost per 1M tokens [input, output] in USD */
const TOKEN_PRICING: Record<string, [number, number]> = {
  "claude-sonnet-4-5":           [3.0,   15.0],
  "claude-3-5-sonnet-20241022":  [3.0,   15.0],
  "claude-3-5-haiku-20241022":   [0.8,    4.0],
  "claude-opus-4-5":             [15.0,  75.0],
  "gpt-4o":                      [2.5,   10.0],
  "gpt-4o-mini":                 [0.15,   0.60],
  "o1-mini":                     [1.1,    4.4],
  "gemini-2.0-flash":            [0.075,  0.30],
  "gemini-2.0-flash-exp":        [0.075,  0.30],
  "gemini-1.5-flash":            [0.075,  0.30],
  "gemini-1.5-pro":              [1.25,   5.0],
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const shortModel = model.includes("/") ? model.split("/").pop()! : model;
  const [ip, op] = TOKEN_PRICING[shortModel] ?? TOKEN_PRICING[model] ?? [3.0, 15.0];
  return (inputTokens * ip + outputTokens * op) / 1_000_000;
}

function userId(req: Request): number {
  return (req.session as { toolUserId: number }).toolUserId;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  KEY MANAGEMENT                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/* POST /api/tools/assistant/key — generate (or regenerate) API key */
router.post("/tools/assistant/key", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const raw = `adx_${randomBytes(24).toString("hex")}`;
  const hash = hashKey(raw);
  const preview = `adx_...${raw.slice(-8)}`;

  await db.execute(sql`
    INSERT INTO agent_sessions (user_id, api_key_hash, api_key_preview)
    VALUES (${uid}, ${hash}, ${preview})
    ON CONFLICT (user_id)
    DO UPDATE SET api_key_hash = ${hash}, api_key_preview = ${preview}, created_at = now()
  `);

  res.json({ key: raw, preview });
});

/* GET /api/tools/assistant/key — get key info (preview only, not the raw key) */
router.get("/tools/assistant/key", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const r = await db.execute(sql`
    SELECT api_key_preview, created_at, last_connected_at
    FROM agent_sessions WHERE user_id = ${uid}
  `);
  const row = r.rows[0] as { api_key_preview: string; created_at: string; last_connected_at: string | null } | undefined;
  if (!row) { res.json({ exists: false }); return; }
  res.json({ exists: true, preview: row.api_key_preview, createdAt: row.created_at, lastConnectedAt: row.last_connected_at });
});

/* DELETE /api/tools/assistant/key — revoke key */
router.delete("/tools/assistant/key", requireToolUser, async (req: Request, res: Response) => {
  await db.execute(sql`DELETE FROM agent_sessions WHERE user_id = ${userId(req)}`);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  AGENT STATUS                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/* GET /api/tools/assistant/stats — usage statistics */
router.get("/tools/assistant/stats", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const [msgRow, usageRow] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE role = 'user')       AS messages_sent,
        COUNT(*) FILTER (WHERE role = 'assistant')  AS ai_responses,
        COUNT(*) FILTER (WHERE role = 'tool')       AS tool_calls,
        MIN(created_at)                              AS first_message_at,
        MAX(created_at)                              AS last_message_at
      FROM agent_messages WHERE user_id = ${uid}
    `),
    db.execute(sql`
      SELECT
        COALESCE(SUM(total_tokens), 0)          AS total_tokens,
        COALESCE(SUM(input_tokens), 0)          AS input_tokens,
        COALESCE(SUM(output_tokens), 0)         AS output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)    AS total_cost_usd,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN estimated_cost_usd ELSE 0 END), 0) AS month_cost_usd
      FROM agent_usage WHERE user_id = ${uid}
    `),
  ]);
  const msg = msgRow.rows[0] as {
    messages_sent: string; ai_responses: string; tool_calls: string;
    first_message_at: string | null; last_message_at: string | null;
  };
  const usage = usageRow.rows[0] as {
    total_tokens: string; input_tokens: string; output_tokens: string;
    total_cost_usd: string; month_cost_usd: string;
  };
  res.json({
    messagesSent:     parseInt(msg.messages_sent ?? "0"),
    aiResponses:      parseInt(msg.ai_responses ?? "0"),
    toolCalls:        parseInt(msg.tool_calls ?? "0"),
    firstMessageAt:   msg.first_message_at,
    lastMessageAt:    msg.last_message_at,
    totalTokens:      parseInt(usage.total_tokens ?? "0"),
    inputTokens:      parseInt(usage.input_tokens ?? "0"),
    outputTokens:     parseInt(usage.output_tokens ?? "0"),
    totalCostUsd:     parseFloat(usage.total_cost_usd ?? "0"),
    monthCostUsd:     parseFloat(usage.month_cost_usd ?? "0"),
  });
});

router.get("/tools/assistant/status", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const connected = isAgentConnected(uid);
  const info = connected ? getAgentInfo(uid) : null;
  res.json({ connected, info });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CONVERSATIONS                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/* GET /api/tools/assistant/conversations — list all conversations */
router.get("/tools/assistant/conversations", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const r = await db.execute(sql`
    SELECT
      c.id, c.title, c.created_at, c.updated_at,
      COUNT(m.id) FILTER (WHERE m.role = 'user') AS message_count
    FROM agent_conversations c
    LEFT JOIN agent_messages m ON m.conversation_id = c.id
    WHERE c.user_id = ${uid}
    GROUP BY c.id, c.title, c.created_at, c.updated_at
    ORDER BY c.updated_at DESC
    LIMIT 50
  `);
  res.json({ conversations: r.rows });
});

/* POST /api/tools/assistant/conversations — create a new conversation */
router.post("/tools/assistant/conversations", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const r = await db.execute(sql`
    INSERT INTO agent_conversations (user_id, title) VALUES (${uid}, 'New Chat') RETURNING id, title, created_at
  `);
  res.json(r.rows[0]);
});

/* PATCH /api/tools/assistant/conversations/:id — rename */
router.patch("/tools/assistant/conversations/:id", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const cid = parseInt(req.params.id);
  const { title } = req.body as { title: string };
  if (!title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  await db.execute(sql`
    UPDATE agent_conversations SET title = ${title.slice(0, 120)} WHERE id = ${cid} AND user_id = ${uid}
  `);
  res.json({ ok: true });
});

/* DELETE /api/tools/assistant/conversations/:id — delete conversation + messages */
router.delete("/tools/assistant/conversations/:id", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const cid = parseInt(req.params.id);
  await db.execute(sql`DELETE FROM agent_messages WHERE conversation_id = ${cid} AND user_id = ${uid}`);
  await db.execute(sql`DELETE FROM agent_conversations WHERE id = ${cid} AND user_id = ${uid}`);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CHAT HISTORY                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

router.get("/tools/assistant/history", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const convId = req.query.conversationId ? parseInt(req.query.conversationId as string) : null;
  const r = convId
    ? await db.execute(sql`
        SELECT id, role, content, tool_name, tool_input, tool_result, created_at
        FROM agent_messages WHERE user_id = ${uid} AND conversation_id = ${convId}
        ORDER BY created_at ASC LIMIT 200
      `)
    : await db.execute(sql`
        SELECT id, role, content, tool_name, tool_input, tool_result, created_at
        FROM agent_messages WHERE user_id = ${uid} AND conversation_id IS NULL
        ORDER BY created_at ASC LIMIT 100
      `);
  res.json({ messages: r.rows });
});

router.delete("/tools/assistant/history", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const convId = req.query.conversationId ? parseInt(req.query.conversationId as string) : null;
  if (convId) {
    await db.execute(sql`DELETE FROM agent_messages WHERE user_id = ${uid} AND conversation_id = ${convId}`);
  } else {
    await db.execute(sql`DELETE FROM agent_messages WHERE user_id = ${uid} AND conversation_id IS NULL`);
  }
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CHAT — SSE streaming                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const TOOLS_DEF = [
  {
    name: "run_command",
    description: "Run a terminal/shell command on the user's local machine. Streams stdout and stderr.",
    input_schema: {
      type: "object",
      properties: {
        command:    { type: "string",  description: "Shell command to run" },
        cwd:        { type: "string",  description: "Working directory (optional, defaults to agent CWD)" },
        timeout_ms: { type: "number",  description: "Timeout in milliseconds (default 30000, max 120000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file on the user's local machine.",
    input_schema: {
      type: "object",
      properties: {
        path:      { type: "string", description: "Absolute or relative file path" },
        max_lines: { type: "number", description: "Maximum lines to return (default 500)" },
        encoding:  { type: "string", description: "File encoding (default utf8)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file on the user's local machine.",
    input_schema: {
      type: "object",
      properties: {
        path:    { type: "string",  description: "Absolute or relative file path" },
        content: { type: "string",  description: "Content to write" },
        append:  { type: "boolean", description: "If true, append instead of overwrite (default false)" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders in a directory on the user's local machine.",
    input_schema: {
      type: "object",
      properties: {
        path:        { type: "string",  description: "Directory path (default: agent CWD)" },
        show_hidden: { type: "boolean", description: "Show hidden files (default false)" },
      },
    },
  },
  {
    name: "open_vscode",
    description: "Open a file or folder in VS Code on the user's local machine.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to open (default: current directory)" },
      },
    },
  },
  {
    name: "get_cwd",
    description: "Get the current working directory and basic system info from the agent.",
    input_schema: { type: "object", properties: {} },
  },
];

async function getApiKey(name: string): Promise<string | null> {
  try {
    const r = await db.execute(sql`SELECT value FROM integrations WHERE name = ${name} LIMIT 1`);
    const v = (r.rows[0] as { value?: string } | undefined)?.value;
    return v || null;
  } catch { return null; }
}

function sse(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/tools/assistant/chat", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const { message, conversationId: rawConvId } = req.body as { message: string; conversationId?: number | null };
  if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }

  /* ── Ensure we have a conversation ── */
  let convId: number | null = rawConvId ?? null;
  if (!convId) {
    const newConv = await db.execute(sql`
      INSERT INTO agent_conversations (user_id, title) VALUES (${uid}, 'New Chat') RETURNING id
    `);
    convId = (newConv.rows[0] as { id: number }).id;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const agentConnected = isAgentConnected(uid);
  const agentInfo = getAgentInfo(uid);
  const sysContext = agentConnected && agentInfo
    ? `Agent connected. OS: ${agentInfo.os}, Shell: ${agentInfo.shell}, CWD: ${agentInfo.cwd}, User: ${agentInfo.username}, VSCode: ${agentInfo.hasVscode}. Use tools to control the machine.`
    : "No agent connected. Tell the user to start the agent first. Answer questions but cannot run commands.";

  try {
    /* ── Auto-title conversation from first user message ── */
    const existingMsgCount = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM agent_messages WHERE conversation_id = ${convId}
    `);
    const isFirstMsg = parseInt((existingMsgCount.rows[0] as { cnt: string }).cnt) === 0;
    if (isFirstMsg) {
      const title = message.slice(0, 80).trim();
      await db.execute(sql`
        UPDATE agent_conversations SET title = ${title}, updated_at = now() WHERE id = ${convId}
      `);
    }

    /* ── Save user message ── */
    await db.execute(sql`
      INSERT INTO agent_messages (user_id, conversation_id, role, content)
      VALUES (${uid}, ${convId}, 'user', ${message})
    `);

    /* ── Emit conversationId to frontend immediately ── */
    sse(res, { type: "conversation_id", conversationId: convId });

    /* ── Load history — only last 10 rows for minimal context ── */
    const historyRows = await db.execute(sql`
      SELECT role, content, tool_name, tool_input, tool_result
      FROM agent_messages WHERE user_id = ${uid} AND conversation_id = ${convId}
      ORDER BY created_at DESC LIMIT 11
    `);
    /* Reverse so oldest-first */
    (historyRows.rows as unknown[]).reverse();

    type DBRow = { role: string; content: string; tool_name: string | null; tool_input: string | null; tool_result: string | null };

    type Block = { type?: string; id?: string; tool_use_id?: string; text?: string };
    type HistoryMsg = { role: "user" | "assistant"; content: string | object[] };

    /* ── Step 1: Build flat list, merging consecutive tool_results into one user message ── */
    const flat: HistoryMsg[] = [];

    for (const r of historyRows.rows as DBRow[]) {
      if (r.role === "tool") {
        const toolUseId = r.tool_name ?? "";
        /* Find the nearest preceding assistant message that has this tool_use id */
        const assistantMsg = [...flat].reverse().find(m => m.role === "assistant" && Array.isArray(m.content));
        const assistantHasThisToolUse = assistantMsg &&
          (assistantMsg.content as Block[]).some(b => b.type === "tool_use" && b.id === toolUseId);
        if (!assistantHasThisToolUse) continue; /* orphaned tool_result — skip */

        /* Merge into the last user message if it's already a tool_result batch, else push new */
        const last = flat[flat.length - 1];
        const lastIsToolResultBatch = last?.role === "user" && Array.isArray(last.content) &&
          (last.content as Block[]).some(b => b.type === "tool_result");
        const HIST_MAX = 800;
        const resultContent = (r.tool_result ?? "").length > HIST_MAX
          ? (r.tool_result ?? "").slice(0, HIST_MAX) + "\n...(truncated)"
          : (r.tool_result ?? "");
        if (lastIsToolResultBatch) {
          (last.content as Block[]).push({ type: "tool_result", tool_use_id: toolUseId, content: resultContent });
        } else {
          flat.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: resultContent }] });
        }
        continue;
      }
      if (r.role === "assistant") {
        if (!r.content) continue;
        try {
          const parsed = JSON.parse(r.content);
          if (Array.isArray(parsed)) { flat.push({ role: "assistant", content: parsed }); continue; }
        } catch { /* plain text */ }
        flat.push({ role: "assistant", content: r.content });
        continue;
      }
      if (r.role === "user") {
        flat.push({ role: "user", content: r.content });
      }
    }

    /* ── Step 2: Validate — for each assistant turn with tool_use, ensure all results exist ── */
    const history: HistoryMsg[] = [];
    for (let i = 0; i < flat.length; i++) {
      const msg = flat[i];
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const blocks = msg.content as Block[];
        const toolUseIds = blocks.filter(b => b.type === "tool_use").map(b => b.id!);
        if (toolUseIds.length > 0) {
          /* Collect ALL tool_result messages that immediately follow this assistant turn */
          const resolvedIds = new Set<string>();
          let j = i + 1;
          while (j < flat.length) {
            const next = flat[j];
            if (next.role === "user" && Array.isArray(next.content) &&
                (next.content as Block[]).some(b => b.type === "tool_result")) {
              (next.content as Block[]).filter(b => b.type === "tool_result" && b.tool_use_id)
                .forEach(b => resolvedIds.add(b.tool_use_id!));
              j++;
            } else break;
          }
          const allResolved = toolUseIds.every(id => resolvedIds.has(id));
          if (!allResolved) {
            /* Strip tool_use blocks; keep only text content */
            const textOnly = blocks.filter(b => b.type === "text");
            if (textOnly.length === 0) { i = j - 1; continue; }
            history.push({ role: "assistant", content: textOnly.length === 1 ? (textOnly[0].text ?? "") : textOnly });
            i = j - 1; /* skip the tool_result messages too */
            continue;
          }
        }
      }
      history.push(msg);
    }

    /* ── Load AI provider + model from settings ── */
    const providerSetting = await getApiKey("ASSISTANT_PROVIDER");
    const modelSetting    = await getApiKey("ASSISTANT_MODEL");

    type Provider = "anthropic" | "openai" | "openrouter" | "gemini";
    const provider: Provider = (providerSetting as Provider) || "anthropic";

    const PROVIDER_URLS: Record<Provider, string> = {
      anthropic:  "https://api.anthropic.com/v1/messages",
      openai:     "https://api.openai.com/v1/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions",
      gemini:     "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    };
    const PROVIDER_KEY_NAMES: Record<Provider, string> = {
      anthropic:  "ANTHROPIC_API_KEY",
      openai:     "OPENAI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      gemini:     "GEMINI_API_KEY",
    };
    const DEFAULT_MODELS: Record<Provider, string> = {
      anthropic:  "claude-sonnet-4-5",
      openai:     "gpt-4o",
      openrouter: "anthropic/claude-3.5-sonnet",
      gemini:     "gemini-2.0-flash",
    };

    const apiKey = await getApiKey(PROVIDER_KEY_NAMES[provider])
      ?? process.env[PROVIDER_KEY_NAMES[provider]];
    if (!apiKey) {
      sse(res, { type: "error", message: `${PROVIDER_KEY_NAMES[provider]} not configured. Add it in Admin → Integrations.` });
      res.end(); return;
    }
    const model = modelSetting || DEFAULT_MODELS[provider];

    /* ── Convert Anthropic-format messages to OpenAI-compatible format ── */
    type InternalMsg = { role: "user" | "assistant"; content: string | object[] };
    type ABlock = { type?: string; id?: string; tool_use_id?: string; text?: string; name?: string; input?: object; content?: string };

    function toOpenAIMessages(msgs: InternalMsg[]): object[] {
      const out: object[] = [];
      for (const msg of msgs) {
        if (msg.role === "user") {
          if (typeof msg.content === "string") {
            out.push({ role: "user", content: msg.content });
          } else {
            const blocks = msg.content as ABlock[];
            const trBlocks = blocks.filter(b => b.type === "tool_result");
            const txtBlocks = blocks.filter(b => b.type === "text");
            if (txtBlocks.length > 0) out.push({ role: "user", content: txtBlocks.map(b => b.text ?? "").join("\n") });
            for (const tr of trBlocks) out.push({ role: "tool", tool_call_id: tr.tool_use_id ?? "", content: tr.content ?? "" });
          }
        } else {
          if (typeof msg.content === "string") {
            out.push({ role: "assistant", content: msg.content });
          } else {
            const blocks = msg.content as ABlock[];
            const txtBlocks = blocks.filter(b => b.type === "text");
            const tuBlocks  = blocks.filter(b => b.type === "tool_use");
            const m: Record<string, unknown> = { role: "assistant", content: txtBlocks.map(b => b.text ?? "").join("") || null };
            if (tuBlocks.length > 0) {
              m.tool_calls = tuBlocks.map(b => ({
                id: b.id, type: "function",
                function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
              }));
            }
            out.push(m);
          }
        }
      }
      return out;
    }

    /* ── OpenAI-format tools ── */
    const TOOLS_DEF_OPENAI = TOOLS_DEF.map(t => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    /* ── Unified AI response type ── */
    type AIResponse = {
      text: string;
      toolCalls: Array<{ id: string; name: string; input: object }>;
      stopReason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const messages: InternalMsg[] = [...history, { role: "user", content: message }];
    const sessionMessages: InternalMsg[] = [{ role: "user", content: message }];

    let fullText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalToolCalls = 0;
    const MAX_TOOL_ROUNDS = 8;
    const SYSTEM_PROMPT = `You are Advantix Assistant — an AI agent that controls the user's machine via tools. Be concise. ${sysContext}`;

    /* ── callAI — unified multi-provider call with unlimited rate-limit retry ── */
    const callAI = async (msgs: InternalMsg[], isToolRound = false): Promise<AIResponse> => {
      const maxTokens = isToolRound ? 1024 : 4096;
      const WAIT_STEPS = [10, 20, 30, 60];
      let attempt = 0;

      while (true) {
        let response: Response;

        if (provider === "anthropic") {
          response = await fetch(PROVIDER_URLS.anthropic, {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model, max_tokens: maxTokens,
              system: SYSTEM_PROMPT,
              tools: agentConnected ? TOOLS_DEF : [],
              messages: msgs,
            }),
          });
        } else {
          const oaiMsgs = toOpenAIMessages(msgs);
          const headers: Record<string, string> = { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" };
          if (provider === "openrouter") headers["HTTP-Referer"] = "https://advantix.digital";
          response = await fetch(PROVIDER_URLS[provider], {
            method: "POST",
            headers,
            body: JSON.stringify({
              model, max_tokens: maxTokens,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...oaiMsgs],
              ...(agentConnected ? { tools: TOOLS_DEF_OPENAI } : {}),
            }),
          });
        }

        if (response.ok) {
          if (provider === "anthropic") {
            const d = await response.json() as {
              content: Array<{ type: string; text?: string; id?: string; name?: string; input?: object }>;
              usage?: { input_tokens: number; output_tokens: number };
              stop_reason?: string;
            };
            return {
              text: d.content.filter(b => b.type === "text").map(b => b.text ?? "").join(""),
              toolCalls: d.content.filter(b => b.type === "tool_use").map(b => ({ id: b.id ?? crypto.randomUUID(), name: b.name ?? "", input: b.input ?? {} })),
              stopReason: d.stop_reason ?? "end_turn",
              usage: d.usage ?? { input_tokens: 0, output_tokens: 0 },
            };
          } else {
            const d = await response.json() as {
              choices: Array<{ message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason?: string }>;
              usage?: { prompt_tokens: number; completion_tokens: number };
            };
            const choice = d.choices[0];
            return {
              text: choice.message.content ?? "",
              toolCalls: (choice.message.tool_calls ?? []).map(tc => ({
                id: tc.id, name: tc.function.name,
                input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
              })),
              stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
              usage: { input_tokens: d.usage?.prompt_tokens ?? 0, output_tokens: d.usage?.completion_tokens ?? 0 },
            };
          }
        }

        const errText = await response.text();
        let isRateLimit = response.status === 429;
        try { if (JSON.parse(errText)?.error?.type === "rate_limit_error") isRateLimit = true; } catch {}
        if (isRateLimit) {
          const waitSecs = WAIT_STEPS[Math.min(attempt, WAIT_STEPS.length - 1)];
          sse(res, { type: "content", delta: `\n\n_Rate limit — waiting ${waitSecs}s…_\n\n` });
          await new Promise(resolve => setTimeout(resolve, waitSecs * 1000));
          attempt++;
          continue;
        }
        throw new Error(`AI API error (${provider}): ${errText}`);
      }
    };

    /* ══ Agentic loop ══════════════════════════════════════════════════════ */
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const hasTools = agentConnected && TOOLS_DEF.length > 0;
      const { text, toolCalls, stopReason, usage } = await callAI(
        round === 0 ? messages : sessionMessages,
        hasTools && round < MAX_TOOL_ROUNDS - 1,
      );

      totalInputTokens += usage.input_tokens;
      totalOutputTokens += usage.output_tokens;

      /* ── Stream text ── */
      if (text) {
        fullText += text;
        sse(res, { type: "content", delta: text });
      }

      /* ── If no tool calls, we're done ── */
      if (toolCalls.length === 0 || stopReason === "end_turn" || stopReason === "stop") break;

      /* ── Execute tool calls in sequence ── */
      const assistantContent: object[] = [
        ...(text ? [{ type: "text", text }] : []),
        ...toolCalls.map(tc => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })),
      ];
      messages.push({ role: "assistant", content: assistantContent });
      sessionMessages.push({ role: "assistant", content: assistantContent });

      await db.execute(sql`
        INSERT INTO agent_messages (user_id, conversation_id, role, content)
        VALUES (${uid}, ${convId}, 'assistant', ${JSON.stringify(assistantContent)})
      `);

      const toolResults: object[] = [];

      totalToolCalls += toolCalls.length;

      for (const tc of toolCalls) {
        const toolId   = tc.id;
        const toolName = tc.name;
        const toolInput = tc.input as Record<string, unknown>;

        sse(res, { type: "tool_start", id: toolId, tool: toolName, input: toolInput });

        let result: ToolResult;
        try {
          result = await sendToolCall(uid, toolId, toolName, toolInput, 60_000);
        } catch (err) {
          result = { id: toolId, stdout: "", stderr: String(err), exitCode: -1, error: String(err) };
        }

        const rawOutput = result.error
          ? `ERROR: ${result.error}`
          : [result.stdout, result.stderr ? `STDERR: ${result.stderr}` : ""].filter(Boolean).join("\n");

        const MAX_OUTPUT = 1500;
        const toolOutput = rawOutput.length > MAX_OUTPUT
          ? rawOutput.slice(0, MAX_OUTPUT) + `\n...(truncated — ${rawOutput.length - MAX_OUTPUT} chars omitted)`
          : rawOutput;

        sse(res, { type: "tool_done", id: toolId, tool: toolName, stdout: result.stdout?.slice(0, MAX_OUTPUT), stderr: result.stderr, exitCode: result.exitCode });

        toolResults.push({ type: "tool_result", tool_use_id: toolId, content: toolOutput || "(no output)" });

        await db.execute(sql`
          INSERT INTO agent_messages (user_id, conversation_id, role, content, tool_name, tool_input, tool_result)
          VALUES (${uid}, ${convId}, 'tool', '', ${toolId}, ${toolName}, ${toolOutput})
        `);
      }

      messages.push({ role: "user", content: toolResults });
      sessionMessages.push({ role: "user", content: toolResults });
    }
    /* ══ End of agentic loop ══════════════════════════════════════════════ */

    if (fullText) {
      await db.execute(sql`
        INSERT INTO agent_messages (user_id, conversation_id, role, content)
        VALUES (${uid}, ${convId}, 'assistant', ${fullText})
      `);
    }

    /* ── Bump conversation updated_at ── */
    await db.execute(sql`
      UPDATE agent_conversations SET updated_at = now() WHERE id = ${convId}
    `);

    /* ── Save usage record ── */
    const totalTokens = totalInputTokens + totalOutputTokens;
    const costUsd = estimateCostUsd(model, totalInputTokens, totalOutputTokens);
    try {
      await db.execute(sql`
        INSERT INTO agent_usage
          (user_id, provider, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, tool_calls)
        VALUES
          (${uid}, ${provider}, ${model}, ${totalInputTokens}, ${totalOutputTokens}, ${totalTokens}, ${costUsd}, ${totalToolCalls})
      `);
    } catch { /* non-fatal — don't block the response */ }

    sse(res, { type: "done", totalTokens, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, estimatedCostUsd: costUsd });
  } catch (err) {
    sse(res, { type: "error", message: (err as Error).message ?? "Unknown error" });
  }

  res.end();
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  ADMIN — usage analytics                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/assistant/usage — per-user AI usage summary */
router.get("/admin/assistant/usage", requireAdmin, async (_req: Request, res: Response) => {
  const [usersRow, recentRow] = await Promise.all([
    /* Per-user totals */
    db.execute(sql`
      SELECT
        tu.id                                                             AS user_id,
        tu.email,
        tu.name,
        tu.created_at                                                     AS joined_at,
        COALESCE(SUM(au.total_tokens), 0)                                 AS total_tokens,
        COALESCE(SUM(au.input_tokens), 0)                                 AS input_tokens,
        COALESCE(SUM(au.output_tokens), 0)                                AS output_tokens,
        COALESCE(SUM(au.estimated_cost_usd), 0)                           AS total_cost_usd,
        COALESCE(SUM(CASE WHEN au.created_at >= date_trunc('month', now()) THEN au.estimated_cost_usd ELSE 0 END), 0) AS month_cost_usd,
        COALESCE(SUM(au.tool_calls), 0)                                   AS total_tool_calls,
        COUNT(DISTINCT au.id)                                             AS request_count,
        MAX(au.created_at)                                                AS last_used_at,
        COUNT(DISTINCT am.id) FILTER (WHERE am.role = 'user')             AS messages_sent
      FROM tool_users tu
      LEFT JOIN agent_usage au ON au.user_id = tu.id
      LEFT JOIN agent_messages am ON am.user_id = tu.id
      GROUP BY tu.id, tu.email, tu.name, tu.created_at
      ORDER BY total_cost_usd DESC
    `),
    /* Last 50 requests across all users */
    db.execute(sql`
      SELECT
        au.id, au.user_id, tu.email, tu.name,
        au.provider, au.model,
        au.input_tokens, au.output_tokens, au.total_tokens,
        au.estimated_cost_usd, au.tool_calls, au.created_at
      FROM agent_usage au
      JOIN tool_users tu ON tu.id = au.user_id
      ORDER BY au.created_at DESC
      LIMIT 50
    `),
  ]);
  res.json({
    users: usersRow.rows,
    recentRequests: recentRow.rows,
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  WebSocket handler — called from index.ts                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function handleAgentWebSocket(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rawKey = url.searchParams.get("key");

  if (!rawKey) { ws.close(4001, "missing key"); return; }

  const hash = hashKey(rawKey);
  const r = await db.execute(sql`SELECT user_id FROM agent_sessions WHERE api_key_hash = ${hash} LIMIT 1`);
  const row = r.rows[0] as { user_id: number } | undefined;

  if (!row) { ws.close(4003, "invalid key"); return; }

  const uid = row.user_id;

  /* Update last_connected_at */
  await db.execute(sql`UPDATE agent_sessions SET last_connected_at = now() WHERE user_id = ${uid}`);

  registerAgent(uid, ws);
  ws.send(JSON.stringify({ type: "authenticated", userId: uid }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; info?: AgentSystemInfo; id?: string; stdout?: string; stderr?: string; exitCode?: number; error?: string };

      if (msg.type === "ready" && msg.info) {
        setAgentInfo(uid, msg.info);
        return;
      }

      if (msg.type === "tool_result" && msg.id !== undefined) {
        resolveToolCall(uid, {
          id: msg.id,
          stdout: msg.stdout ?? "",
          stderr: msg.stderr ?? "",
          exitCode: msg.exitCode ?? 0,
          error: msg.error,
        });
        return;
      }

      if (msg.type === "pong") return;
    } catch { /* ignore parse errors */ }
  });

  ws.on("close", () => removeAgent(uid));
  ws.on("error", () => removeAgent(uid));
}

export default router;
