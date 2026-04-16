import type WebSocket from "ws";

export type AgentSystemInfo = {
  os: string;
  platform: string;
  arch: string;
  hostname: string;
  username: string;
  shell: string;
  cwd: string;
  nodeVersion: string;
  hasVscode: boolean;
};

type PendingToolCall = {
  resolve: (result: ToolResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type ToolResult = {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
};

type AgentEntry = {
  ws: WebSocket;
  userId: number;
  info: AgentSystemInfo | null;
  pending: Map<string, PendingToolCall>;
  pingTimer: ReturnType<typeof setTimeout> | null;
  deadTimer: ReturnType<typeof setTimeout> | null;
  alive: boolean;
};

const agents = new Map<number, AgentEntry>();

/* Keep well below DO App Platform's proxy idle timeout (~30s).
   8 s interval + 10 s grace = 18 s worst-case, safe on any cloud proxy. */
const PING_INTERVAL_MS = 8_000;
const PONG_TIMEOUT_MS  = 10_000;

function schedulePing(entry: AgentEntry): void {
  if (entry.pingTimer) clearTimeout(entry.pingTimer);

  entry.pingTimer = setTimeout(() => {
    if (entry.ws.readyState !== 1) {
      removeAgent(entry.userId);
      return;
    }

    entry.alive = false;

    /* Native WebSocket ping frame — keeps TCP/proxy alive at network level */
    try { entry.ws.ping(); } catch { /* ignore if unsupported */ }

    /* JSON-level ping — agent.mjs (Node built-in WS) responds with JSON pong */
    try {
      entry.ws.send(JSON.stringify({ type: "ping" }));
    } catch {
      removeAgent(entry.userId);
      return;
    }

    /* If neither pong arrives within PONG_TIMEOUT_MS, terminate the connection */
    if (entry.deadTimer) clearTimeout(entry.deadTimer);
    entry.deadTimer = setTimeout(() => {
      if (!entry.alive) {
        try { entry.ws.terminate(); } catch {}
        removeAgent(entry.userId);
      }
    }, PONG_TIMEOUT_MS);
  }, PING_INTERVAL_MS);
}

/**
 * Called when the agent sends a JSON {"type":"pong"} message.
 * Marks the connection alive and reschedules the next ping.
 */
export function markAgentAlive(userId: number): void {
  const entry = agents.get(userId);
  if (!entry) return;
  entry.alive = true;
  if (entry.deadTimer) { clearTimeout(entry.deadTimer); entry.deadTimer = null; }
  schedulePing(entry);
}

export function registerAgent(userId: number, ws: WebSocket, info: AgentSystemInfo | null = null): void {
  const existing = agents.get(userId);
  if (existing) {
    if (existing.pingTimer) clearTimeout(existing.pingTimer);
    if (existing.deadTimer) clearTimeout(existing.deadTimer);
    try { existing.ws.close(); } catch {}
    existing.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error("Agent reconnected — previous connection closed"));
    });
  }
  const entry: AgentEntry = {
    ws, userId, info, pending: new Map(),
    pingTimer: null, deadTimer: null, alive: true,
  };
  agents.set(userId, entry);
  schedulePing(entry);
}

export function setAgentInfo(userId: number, info: AgentSystemInfo): void {
  const entry = agents.get(userId);
  if (entry) entry.info = info;
}

export function removeAgent(userId: number): void {
  const entry = agents.get(userId);
  if (!entry) return;
  if (entry.pingTimer) clearTimeout(entry.pingTimer);
  if (entry.deadTimer) clearTimeout(entry.deadTimer);
  entry.pending.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(new Error("Agent disconnected"));
  });
  agents.delete(userId);
}

export function getAgent(userId: number): AgentEntry | undefined {
  return agents.get(userId);
}

export function isAgentConnected(userId: number): boolean {
  const entry = agents.get(userId);
  return !!entry && entry.ws.readyState === 1;
}

export function getAgentInfo(userId: number): AgentSystemInfo | null {
  return agents.get(userId)?.info ?? null;
}

export function sendToolCall(
  userId: number,
  id: string,
  tool: string,
  input: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<ToolResult> {
  const entry = agents.get(userId);
  if (!entry || entry.ws.readyState !== 1) {
    return Promise.reject(new Error("Agent not connected"));
  }

  return new Promise<ToolResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      entry.pending.delete(id);
      reject(new Error(`Tool call '${tool}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    entry.pending.set(id, { resolve, reject, timer });

    entry.ws.send(JSON.stringify({ type: "tool_call", id, tool, input }), (err) => {
      if (err) {
        clearTimeout(timer);
        entry.pending.delete(id);
        reject(new Error(`Failed to send tool call: ${err.message}`));
      }
    });
  });
}

export function resolveToolCall(userId: number, result: ToolResult): void {
  const entry = agents.get(userId);
  if (!entry) return;
  const pending = entry.pending.get(result.id);
  if (!pending) return;
  clearTimeout(pending.timer);
  entry.pending.delete(result.id);
  pending.resolve(result);
}
