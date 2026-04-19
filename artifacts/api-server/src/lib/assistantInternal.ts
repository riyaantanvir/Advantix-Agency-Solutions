/**
 * Run a single assistant turn on behalf of a user from server-side code
 * (e.g. WhatsApp message handler). Uses the existing assistant SSE chat
 * endpoint via internal HTTP loopback with a trusted token.
 *
 * Returns the final assistant text reply (markdown collapsed to plain text).
 */
import { INTERNAL_API_TOKEN } from "../middleware/toolAuth.js";

const PORT = process.env.PORT || "8080";
const BASE = `http://127.0.0.1:${PORT}`;

const PER_USER_CONV = new Map<number, number>();

export async function runAssistantForWhatsApp(uid: number, message: string): Promise<string> {
  const convId = PER_USER_CONV.get(uid) ?? null;

  /* Hard time limit so a stuck assistant cannot hang WhatsApp.
     AbortController guarantees fetch + reader.read() unblock at MAX_MS. */
  const MAX_MS = 90_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MAX_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/tools/assistant/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": INTERNAL_API_TOKEN,
        "x-internal-user-id": String(uid),
      },
      body: JSON.stringify({ message, conversationId: convId }),
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return `⚠️ Assistant unreachable (${(e as Error)?.message ?? "fetch failed"})`;
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    return `⚠️ Assistant unreachable (${res.status})`;
  }

  let buffer = "";
  let reply = "";
  let toolNotes: string[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      /* Normalise CRLF → LF so SSE framing is consistent regardless of proxy. */
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      /* SSE events are separated by a blank line. Each event may contain
         multiple `data:` lines which the spec says to join with "\n". */
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = chunk.split("\n")
          .filter(l => l.startsWith("data:"))
          .map(l => l.slice(5).replace(/^ /, ""));
        if (dataLines.length === 0) continue;
        const json = dataLines.join("\n").trim();
        if (!json) continue;
        try {
          const ev = JSON.parse(json);
          if (ev.type === "conversation_id" && ev.conversationId) {
            PER_USER_CONV.set(uid, ev.conversationId);
          } else if (ev.type === "content" && typeof ev.delta === "string") {
            reply += ev.delta;
          } else if (ev.type === "tool_start" && ev.tool) {
            toolNotes.push(`🔧 ${ev.tool}`);
          } else if (ev.type === "error" && ev.message) {
            reply += `\n⚠️ ${ev.message}`;
          } else if (ev.type === "done") {
            try { await reader.cancel(); } catch { /* ignore */ }
            clearTimeout(timer);
            return formatReply(reply, toolNotes);
          }
        } catch { /* ignore malformed event */ }
      }
    }
  } catch (e) {
    /* Aborted by timeout, or stream errored */
    if ((e as Error)?.name === "AbortError") {
      reply += "\n⚠️ Assistant timed out";
    }
  } finally {
    clearTimeout(timer);
    try { await reader.cancel(); } catch { /* ignore */ }
  }

  return formatReply(reply, toolNotes);
}

function formatReply(reply: string, toolNotes: string[]): string {
  const cleaned = (reply || "").trim();
  if (!cleaned) {
    return toolNotes.length
      ? `(No reply received — used tools: ${toolNotes.join(", ")})`
      : "(No reply received)";
  }
  /* Strip markdown that doesn't render well in WhatsApp */
  return cleaned
    .replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, _lang, code) => `\n${code}\n`)
    .replace(/^#+\s+/gm, "*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .slice(0, 3500);
}
