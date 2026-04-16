import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
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
  const r = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE role = 'user')       AS messages_sent,
      COUNT(*) FILTER (WHERE role = 'assistant')  AS ai_responses,
      COUNT(*) FILTER (WHERE role = 'tool')       AS tool_calls,
      MIN(created_at)                              AS first_message_at,
      MAX(created_at)                              AS last_message_at
    FROM agent_messages WHERE user_id = ${uid}
  `);
  const row = r.rows[0] as {
    messages_sent: string; ai_responses: string; tool_calls: string;
    first_message_at: string | null; last_message_at: string | null;
  };
  res.json({
    messagesSent:   parseInt(row.messages_sent ?? "0"),
    aiResponses:    parseInt(row.ai_responses ?? "0"),
    toolCalls:      parseInt(row.tool_calls ?? "0"),
    firstMessageAt: row.first_message_at,
    lastMessageAt:  row.last_message_at,
  });
});

router.get("/tools/assistant/status", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const connected = isAgentConnected(uid);
  const info = connected ? getAgentInfo(uid) : null;
  res.json({ connected, info });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/*  CHAT HISTORY                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

router.get("/tools/assistant/history", requireToolUser, async (req: Request, res: Response) => {
  const uid = userId(req);
  const r = await db.execute(sql`
    SELECT id, role, content, tool_name, tool_input, tool_result, created_at
    FROM agent_messages WHERE user_id = ${uid}
    ORDER BY created_at ASC
    LIMIT 100
  `);
  res.json({ messages: r.rows });
});

router.delete("/tools/assistant/history", requireToolUser, async (req: Request, res: Response) => {
  await db.execute(sql`DELETE FROM agent_messages WHERE user_id = ${userId(req)}`);
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
  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const agentConnected = isAgentConnected(uid);
  const agentInfo = getAgentInfo(uid);
  const sysContext = agentConnected && agentInfo
    ? `The user has a local agent connected running on ${agentInfo.os} (${agentInfo.platform}/${agentInfo.arch}). Hostname: ${agentInfo.hostname}. Username: ${agentInfo.username}. Shell: ${agentInfo.shell}. CWD: ${agentInfo.cwd}. Node: ${agentInfo.nodeVersion}. VS Code available: ${agentInfo.hasVscode}. You CAN use tools to execute commands and work directly on their machine.`
    : "The user's local agent is NOT currently connected. Explain that they need to run the agent on their machine first using the setup instructions on the page. You can still answer questions and help plan — but you cannot execute commands.";

  try {
    /* ── Load history ── */
    const historyRows = await db.execute(sql`
      SELECT role, content, tool_name, tool_input, tool_result
      FROM agent_messages WHERE user_id = ${uid}
      ORDER BY created_at ASC LIMIT 50
    `);

    type DBRow = { role: string; content: string; tool_name: string | null; tool_input: string | null; tool_result: string | null };

    /* Build raw history, then validate pairs to avoid orphan tool_result errors */
    const rawHistory: Array<{ role: "user" | "assistant"; content: string | object[] }> = [];

    for (const r of historyRows.rows as DBRow[]) {
      if (r.role === "tool") {
        /* Only include tool_result if the previous message is an assistant turn with a matching tool_use */
        const prev = rawHistory[rawHistory.length - 1];
        const prevContent = prev?.content;
        const toolUseId = r.tool_name ?? "";
        const hasMatchingToolUse =
          prev?.role === "assistant" &&
          Array.isArray(prevContent) &&
          (prevContent as Array<{ type?: string; id?: string }>).some(
            b => b.type === "tool_use" && b.id === toolUseId
          );
        if (!hasMatchingToolUse) continue; /* skip orphaned tool_result */
        rawHistory.push({
          role: "user" as const,
          content: [{ type: "tool_result" as const, tool_use_id: toolUseId, content: r.tool_result ?? "" }],
        });
        continue;
      }
      if (r.role === "assistant") {
        try {
          const parsed = JSON.parse(r.content);
          if (Array.isArray(parsed)) {
            rawHistory.push({ role: "assistant" as const, content: parsed });
            continue;
          }
        } catch { /* plain text */ }
        if (!r.content) continue; /* skip empty assistant rows */
        rawHistory.push({ role: "assistant" as const, content: r.content });
        continue;
      }
      rawHistory.push({ role: r.role as "user" | "assistant", content: r.content });
    }

    /* ── Validate: strip assistant tool_use blocks that have no matching tool_result ── */
    type HistoryMsg = { role: "user" | "assistant"; content: string | object[] };
    type Block = { type?: string; id?: string; tool_use_id?: string; text?: string };

    const validated: HistoryMsg[] = [];
    for (let i = 0; i < rawHistory.length; i++) {
      const msg = rawHistory[i];
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const blocks = msg.content as Block[];
        const toolUseIds = blocks.filter(b => b.type === "tool_use").map(b => b.id!);
        if (toolUseIds.length > 0) {
          const next = rawHistory[i + 1];
          const nextBlocks = Array.isArray(next?.content) ? (next.content as Block[]) : [];
          const resolvedIds = new Set(nextBlocks.filter(b => b.type === "tool_result").map(b => b.tool_use_id));
          const allResolved = toolUseIds.every(id => resolvedIds.has(id));
          if (!allResolved) {
            /* Strip tool_use blocks; keep only text */
            const textOnly = blocks.filter(b => b.type === "text");
            if (textOnly.length === 0) continue; /* skip entirely */
            validated.push({ role: "assistant", content: textOnly.length === 1 ? (textOnly[0].text ?? "") : textOnly });
            /* Also skip the next message if it's a partial tool_result turn */
            if (next?.role === "user" && Array.isArray(next.content) && nextBlocks.some(b => b.type === "tool_result")) {
              i++; /* skip next */
            }
            continue;
          }
        }
      }
      validated.push(msg);
    }
    const history = validated;

    /* ── Store user message ── */
    await db.execute(sql`
      INSERT INTO agent_messages (user_id, role, content) VALUES (${uid}, 'user', ${message})
    `);

    /* ── Get Claude key ── */
    const anthropicKey = await getApiKey("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      sse(res, { type: "error", message: "Anthropic API key not configured. Add ANTHROPIC_API_KEY in Admin → Integrations." });
      res.end(); return;
    }

    const messages: Array<{ role: "user" | "assistant"; content: string | object[] }> = [
      ...history,
      { role: "user", content: message },
    ];

    let fullText = "";
    let totalTokens = 0;
    const MAX_TOOL_ROUNDS = 8;

    /* ══ Agentic loop ══════════════════════════════════════════════════════ */
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          system: `You are Advantix Assistant — an expert AI agent that can directly control the user's computer through their local agent. You can run any terminal command, read/write files, open VS Code, and more. Always be precise, safe, and explain what you're doing before doing it. If a task requires multiple steps, execute them one by one and report results. ${sysContext}`,
          tools: agentConnected ? TOOLS_DEF : [],
          messages,
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        sse(res, { type: "error", message: `Claude API error: ${err}` });
        break;
      }

      const claudeData = await claudeRes.json() as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: object }>;
        usage?: { input_tokens: number; output_tokens: number };
        stop_reason?: string;
      };

      totalTokens += (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0);

      const textBlocks = claudeData.content.filter(b => b.type === "text");
      const toolBlocks = claudeData.content.filter(b => b.type === "tool_use");

      /* ── Stream text ── */
      for (const block of textBlocks) {
        if (block.text) {
          fullText += block.text;
          sse(res, { type: "content", delta: block.text });
        }
      }

      /* ── If no tool calls, we're done ── */
      if (toolBlocks.length === 0 || claudeData.stop_reason === "end_turn") {
        break;
      }

      /* ── Execute tool calls in sequence ── */
      const assistantContent: object[] = [
        ...textBlocks.map(b => ({ type: "text", text: b.text ?? "" })),
        ...toolBlocks.map(b => ({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} })),
      ];
      messages.push({ role: "assistant", content: assistantContent });

      /* Persist the assistant's tool_use turn so history can be reconstructed */
      await db.execute(sql`
        INSERT INTO agent_messages (user_id, role, content)
        VALUES (${uid}, 'assistant', ${JSON.stringify(assistantContent)})
      `);

      const toolResults: object[] = [];

      for (const tool of toolBlocks) {
        const toolId = tool.id ?? crypto.randomUUID();
        const toolName = tool.name ?? "unknown";
        const toolInput = (tool.input ?? {}) as Record<string, unknown>;

        sse(res, { type: "tool_start", id: toolId, tool: toolName, input: toolInput });

        let result: ToolResult;
        try {
          result = await sendToolCall(uid, toolId, toolName, toolInput, 60_000);
        } catch (err) {
          result = { id: toolId, stdout: "", stderr: String(err), exitCode: -1, error: String(err) };
        }

        const toolOutput = result.error
          ? `ERROR: ${result.error}`
          : [result.stdout, result.stderr ? `STDERR: ${result.stderr}` : ""].filter(Boolean).join("\n");

        sse(res, { type: "tool_done", id: toolId, tool: toolName, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });

        toolResults.push({ type: "tool_result", tool_use_id: toolId, content: toolOutput || "(no output)" });

        /* store tool in history */
        await db.execute(sql`
          INSERT INTO agent_messages (user_id, role, content, tool_name, tool_input, tool_result)
          VALUES (${uid}, 'tool', '', ${toolId}, ${toolName}, ${toolOutput})
        `);
      }

      messages.push({ role: "user", content: toolResults });
    }
    /* ══ End of agentic loop ══════════════════════════════════════════════ */

    /* Store assistant response */
    if (fullText) {
      await db.execute(sql`
        INSERT INTO agent_messages (user_id, role, content) VALUES (${uid}, 'assistant', ${fullText})
      `);
    }

    sse(res, { type: "done", totalTokens });
  } catch (err) {
    sse(res, { type: "error", message: (err as Error).message ?? "Unknown error" });
  }

  res.end();
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
