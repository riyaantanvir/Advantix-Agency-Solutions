/* Returns the full content of the downloadable agent.mjs script */
export function getAgentScript(serverUrl: string): string {
  return `#!/usr/bin/env node
/**
 * Advantix Assistant — Local Agent
 * Zero-dependency · Requires Node.js v22+
 *
 * Usage:
 *   node agent.mjs --key YOUR_API_KEY
 *   node agent.mjs --key YOUR_API_KEY --server https://advantix.digital
 *
 * The agent connects to your Advantix account and allows the AI
 * to run commands, read/write files, and open VS Code on this machine.
 */

import { execFile, spawn } from "child_process";
import { readFile, writeFile, appendFile, readdir, stat, mkdir } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/* ── Parse CLI args ─────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const API_KEY = getArg("--key");
const SERVER  = (getArg("--server") ?? "${serverUrl}").replace(/\\/$/, "");
const WS_URL  = SERVER.replace(/^https/, "wss").replace(/^http/, "ws") + "/api/agent/ws?key=" + API_KEY;

if (!API_KEY) {
  console.error("\\x1b[31mError: --key is required.\\x1b[0m");
  console.error("  Usage: node agent.mjs --key YOUR_API_KEY");
  process.exit(1);
}

/* ── Check Node version ─────────────────────────────────────────────────── */
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(\`\\x1b[31mRequires Node.js v22+. You have v\${process.versions.node}\\x1b[0m\`);
  console.error("  Download: https://nodejs.org/en/download");
  process.exit(1);
}

/* ── System info ────────────────────────────────────────────────────────── */
async function hasCommand(cmd) {
  try { await execFileAsync(cmd, ["--version"], { timeout: 3000 }); return true; }
  catch { return false; }
}

async function getSystemInfo() {
  return {
    os:          os.type(),
    platform:    os.platform(),
    arch:        os.arch(),
    hostname:    os.hostname(),
    username:    os.userInfo().username,
    shell:       process.env.SHELL ?? process.env.COMSPEC ?? "unknown",
    cwd:         process.cwd(),
    nodeVersion: process.versions.node,
    hasVscode:   await hasCommand("code"),
  };
}

/* ── Tool execution ─────────────────────────────────────────────────────── */
async function executeTool(tool, input) {
  switch (tool) {

    case "run_command": {
      const { command, cwd, timeout_ms = 30000 } = input;
      const workDir = cwd ? path.resolve(cwd) : process.cwd();
      return new Promise((resolve) => {
        let stdout = "", stderr = "";
        const shell = os.platform() === "win32" ? "cmd" : "/bin/sh";
        const args   = os.platform() === "win32" ? ["/c", command] : ["-c", command];
        const proc = spawn(shell, args, { cwd: workDir, env: process.env });
        const timer = setTimeout(() => {
          proc.kill();
          resolve({ stdout, stderr: stderr + "\\n[TIMEOUT]", exitCode: -1 });
        }, Math.min(timeout_ms, 120000));
        proc.stdout.on("data", d => { stdout += d; });
        proc.stderr.on("data", d => { stderr += d; });
        proc.on("close", code => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 0 });
        });
        proc.on("error", err => {
          clearTimeout(timer);
          resolve({ stdout, stderr: err.message, exitCode: -1, error: err.message });
        });
      });
    }

    case "read_file": {
      const { path: filePath, max_lines = 500, encoding = "utf8" } = input;
      const abs = path.resolve(filePath);
      const content = await readFile(abs, { encoding });
      const lines = content.split("\\n");
      const truncated = lines.length > max_lines;
      return {
        stdout: (truncated ? lines.slice(0, max_lines).join("\\n") + \`\\n... [truncated: \${lines.length - max_lines} more lines]\` : content),
        stderr: "", exitCode: 0,
      };
    }

    case "write_file": {
      const { path: filePath, content: rawContent, append = false } = input;
      if (!filePath) return { stdout: "", stderr: "write_file: 'path' is required", exitCode: 1 };
      const content = typeof rawContent === "string" ? rawContent : rawContent == null ? "" : String(rawContent);
      const abs = path.resolve(filePath);
      const dir = path.dirname(abs);
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      if (append) { await appendFile(abs, content, "utf8"); }
      else        { await writeFile(abs, content, "utf8"); }
      return { stdout: \`File \${append ? "appended" : "written"}: \${abs}\`, stderr: "", exitCode: 0 };
    }

    case "list_directory": {
      const { path: dirPath = ".", show_hidden = false } = input;
      const abs = path.resolve(dirPath);
      const entries = await readdir(abs, { withFileTypes: true });
      const filtered = show_hidden ? entries : entries.filter(e => !e.name.startsWith("."));
      const lines = await Promise.all(filtered.map(async e => {
        const full = path.join(abs, e.name);
        try {
          const s = await stat(full);
          const size = s.isFile() ? \` (\${(s.size / 1024).toFixed(1)}KB)\` : "";
          return \`\${e.isDirectory() ? "📁" : "📄"} \${e.name}\${size}\`;
        } catch { return \`? \${e.name}\`; }
      }));
      return { stdout: lines.join("\\n") || "(empty directory)", stderr: "", exitCode: 0 };
    }

    case "open_vscode": {
      const { path: filePath = "." } = input;
      const abs = path.resolve(filePath);
      try {
        await execFileAsync("code", [abs], { timeout: 5000 });
        return { stdout: \`VS Code opened: \${abs}\`, stderr: "", exitCode: 0 };
      } catch (err) {
        return { stdout: "", stderr: \`VS Code not available or failed: \${err.message}\`, exitCode: 1, error: err.message };
      }
    }

    case "get_cwd": {
      const info = await getSystemInfo();
      return { stdout: JSON.stringify(info, null, 2), stderr: "", exitCode: 0 };
    }

    default:
      return { stdout: "", stderr: \`Unknown tool: \${tool}\`, exitCode: 1, error: \`Unknown tool: \${tool}\` };
  }
}

/* ── WebSocket connection ────────────────────────────────────────────────── */
const RECONNECT_BASE_MS  = 2_000;   /* start at 2 s */
const RECONNECT_MAX_MS   = 30_000;  /* cap at 30 s  */
const CLIENT_PING_MS     = 20_000;  /* client-side keepalive every 20 s */

let reconnectTimer   = null;
let clientPingTimer  = null;
let ws               = null;
let reconnectAttempt = 0;
let closing          = false;       /* true only on intentional SIGINT close */

const colors = {
  reset: "\\x1b[0m", green: "\\x1b[32m", yellow: "\\x1b[33m",
  red: "\\x1b[31m", cyan: "\\x1b[36m", bold: "\\x1b[1m", dim: "\\x1b[2m",
};
const c = (color, text) => colors[color] + text + colors.reset;

function log(msg)  { console.log(c("dim", new Date().toLocaleTimeString()) + " " + msg); }
function ok(msg)   { console.log(c("green", "✓") + " " + msg); }
function warn(msg) { console.log(c("yellow", "⚠") + " " + msg); }
function err(msg)  { console.log(c("red", "✗") + " " + msg); }

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  /* Exponential backoff: 2s, 4s, 8s, 16s … capped at 30s */
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
  reconnectAttempt++;
  warn(\`Reconnecting in \${(delay / 1000).toFixed(0)}s... (attempt \${reconnectAttempt})\`);
  reconnectTimer = setTimeout(connect, delay);
}

function stopClientPing() {
  clearInterval(clientPingTimer);
  clientPingTimer = null;
}

function startClientPing() {
  stopClientPing();
  clientPingTimer = setInterval(() => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
    }
  }, CLIENT_PING_MS);
}

function connect() {
  clearTimeout(reconnectTimer);

  /* Cleanly close the old socket WITHOUT triggering our close handler */
  if (ws) {
    const old = ws;
    ws = null;
    old.onclose = null;   /* detach handler before closing */
    try { old.close(); } catch {}
  }

  log(\`Connecting to \${c("cyan", SERVER)} ...\`);
  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", async () => {
    reconnectAttempt = 0;   /* reset backoff on successful connect */
    ok(c("bold", "Connected to Advantix!"));
    const info = await getSystemInfo();
    ws.send(JSON.stringify({ type: "ready", info }));
    log(\`Machine: \${c("cyan", info.hostname)} · \${info.os} \${info.arch} · Node v\${info.nodeVersion}\`);
    if (info.hasVscode) { ok("VS Code detected — open_vscode tool available"); }
    else { warn("VS Code not found in PATH — open_vscode will not work"); }
    console.log("\\n" + c("bold", "Advantix Assistant is ready!") + " Chat at: " + c("cyan", SERVER + "/tools/assistant"));
    console.log(c("dim", "Press Ctrl+C to stop.\\n"));
    startClientPing();   /* begin client-side keepalive */
  });

  ws.addEventListener("message", async ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }
    if (msg.type === "pong") { return; }   /* server ack of our client ping */
    if (msg.type === "authenticated") { return; }

    if (msg.type === "tool_call") {
      const { id, tool, input } = msg;
      log(\`Running tool: \${c("cyan", tool)} \${input.command ? c("dim", \`$ \${input.command}\`) : ""}\`);
      try {
        const result = await executeTool(tool, input || {});
        if (result.stdout) log(c("dim", result.stdout.slice(0, 200) + (result.stdout.length > 200 ? "..." : "")));
        ws.send(JSON.stringify({ type: "tool_result", id, ...result }));
      } catch (e) {
        err(\`Tool error: \${e.message}\`);
        ws.send(JSON.stringify({ type: "tool_result", id, stdout: "", stderr: e.message, exitCode: -1, error: e.message }));
      }
    }
  });

  ws.addEventListener("close", ({ code }) => {
    stopClientPing();
    if (closing) return;                             /* SIGINT — do not reconnect */
    if (code === 4003) { err("Invalid API key. Get a new key from Advantix Assistant settings."); process.exit(1); }
    if (code === 4001) { err("API key is missing. Run with --key YOUR_KEY"); process.exit(1); }
    scheduleReconnect();
  });

  ws.addEventListener("error", (e) => {
    warn(\`Connection error\${e?.message ? ": " + e.message : ""}. Will retry...\`);
    /* "close" fires right after "error" — reconnect is handled there */
  });
}

/* ── Main ───────────────────────────────────────────────────────────────── */
console.log("\\n" + c("bold", "╔══════════════════════════════════╗"));
console.log(c("bold",        "║   Advantix Assistant Agent       ║"));
console.log(c("bold",        "╚══════════════════════════════════╝") + "\\n");

connect();

process.on("SIGINT", () => {
  closing = true;
  stopClientPing();
  console.log("\\n" + c("yellow", "Stopping agent..."));
  if (ws) { try { ws.close(1000, "user quit"); } catch {} }
  process.exit(0);
});
`;
}
