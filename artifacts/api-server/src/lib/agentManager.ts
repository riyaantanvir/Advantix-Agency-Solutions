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
};

const agents = new Map<number, AgentEntry>();

export function registerAgent(userId: number, ws: WebSocket, info: AgentSystemInfo | null = null): void {
  const existing = agents.get(userId);
  if (existing) {
    try { existing.ws.close(); } catch {}
    existing.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error("Agent reconnected — previous connection closed"));
    });
  }
  agents.set(userId, { ws, userId, info, pending: new Map() });
}

export function setAgentInfo(userId: number, info: AgentSystemInfo): void {
  const entry = agents.get(userId);
  if (entry) entry.info = info;
}

export function removeAgent(userId: number): void {
  const entry = agents.get(userId);
  if (!entry) return;
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

export function pingAllAgents(): void {
  for (const [userId, entry] of agents) {
    if (entry.ws.readyState === 1) {
      try { entry.ws.send(JSON.stringify({ type: "ping" })); } catch {
        removeAgent(userId);
      }
    } else {
      removeAgent(userId);
    }
  }
}

setInterval(pingAllAgents, 30_000);
