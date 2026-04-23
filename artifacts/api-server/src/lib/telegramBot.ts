/**
 * Advantix Assistant — Telegram Bot
 * Polls Telegram for messages from the owner and responds using the same
 * AI + platform tools + optional local agent as the web assistant.
 */

import TelegramBot from "node-telegram-bot-api";
import { db, shortUrlsTable, teamMembersTable, servicesTable, portfolioItemsTable, blogPostsTable, contestsTable } from "@workspace/db";
import { smmUserKeysTable, smmScheduledPostsTable } from "@workspace/db/schema";
import { fetchAllPlatforms } from "./smmService.js";
import { isAgentConnected, getAgentInfo, sendToolCall } from "./agentManager.js";
import { sql, eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "./logger.js";
import { transcribeAudio } from "./audioTranscribe.js";

/* ── DB helper ─────────────────────────────────────────────────────────── */
async function getIntegration(name: string): Promise<string | null> {
  try {
    const r = await db.execute(sql`SELECT value FROM integrations WHERE name = ${name} LIMIT 1`);
    const v = (r.rows[0] as { value?: string } | undefined)?.value;
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

/* ── AI providers ─────────────────────────────────────────────────────── */
type Provider = "anthropic" | "openai" | "openrouter";
const PROVIDER_URLS: Record<Provider, string> = {
  anthropic:   "https://api.anthropic.com/v1/messages",
  openai:      "https://api.openai.com/v1/chat/completions",
  openrouter:  "https://openrouter.ai/api/v1/chat/completions",
};
const PROVIDER_KEY_NAMES: Record<Provider, string> = {
  anthropic:   "ANTHROPIC_API_KEY",
  openai:      "OPENAI_API_KEY",
  openrouter:  "OPENROUTER_API_KEY",
};
const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic:   "claude-opus-4-5",
  openai:      "gpt-4o",
  openrouter:  "anthropic/claude-opus-4-5",
};

/* ── Tool definitions (same as web assistant) ─────────────────────────── */
const PLATFORM_TOOLS_DEF = [
  {
    name: "create_short_link",
    description: "Create a short URL using the Advantix URL shortener.",
    input_schema: {
      type: "object",
      properties: {
        url:   { type: "string", description: "The original URL to shorten" },
        title: { type: "string", description: "Optional label for the link" },
        code:  { type: "string", description: "Optional custom short code" },
      },
      required: ["url"],
    },
  },
  {
    name: "list_short_links",
    description: "List the user's recent short links from Advantix URL shortener.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_smm_stats",
    description: "Get Social Media Manager stats: connected platforms, follower counts, and total followers.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_smm_posts",
    description: "Get recent posts from Social Media Manager — published posts and scheduled posts.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["recent", "scheduled", "all"] },
      },
    },
  },
  {
    name: "get_site_info",
    description: "Fetch live information about Advantix Digital: team members, services, portfolio, blog posts, careers, and contact details.",
    input_schema: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: { type: "string", enum: ["team", "services", "portfolio", "blog", "careers", "contact"] },
        },
      },
    },
  },
];

const AGENT_TOOLS_DEF = [
  {
    name: "run_command",
    description: "Run a terminal/shell command on the user's local machine.",
    input_schema: {
      type: "object",
      properties: {
        command:    { type: "string" },
        cwd:        { type: "string" },
        timeout_ms: { type: "number" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file on the user's local machine.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, max_lines: { type: "number" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file on the user's local machine.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" }, append: { type: "boolean" } },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders in a directory on the user's local machine.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, show_hidden: { type: "boolean" } },
    },
  },
  {
    name: "open_vscode",
    description: "Open VS Code on the user's machine.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "get_cwd",
    description: "Get the current working directory and system info.",
    input_schema: { type: "object", properties: {} },
  },
];

/* ── Platform tool execution ──────────────────────────────────────────── */
async function executePlatformTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  uid: number,
  serverOrigin: string,
): Promise<string> {
  try {
    if (toolName === "create_short_link") {
      let normalized = String(toolInput.url ?? "").trim();
      if (!normalized) return "Error: URL is required.";
      if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
      const customCode = toolInput.code ? String(toolInput.code).trim() : null;
      const shortCode = customCode || randomBytes(3).toString("hex");
      const title = toolInput.title ? String(toolInput.title).trim() : null;
      await db.insert(shortUrlsTable).values({
        shortCode, originalUrl: normalized, userId: uid, title,
      }).onConflictDoNothing();
      const shortLink = `${serverOrigin}/r/${shortCode}`;
      return `Short link created!\nShort URL: ${shortLink}\nOriginal: ${normalized}\nCode: ${shortCode}`;
    }

    if (toolName === "list_short_links") {
      const urls = await db.select({
        shortCode: shortUrlsTable.shortCode,
        originalUrl: shortUrlsTable.originalUrl,
        title: shortUrlsTable.title,
        clicks: shortUrlsTable.clicks,
      }).from(shortUrlsTable).where(eq(shortUrlsTable.userId, uid)).orderBy(desc(shortUrlsTable.createdAt)).limit(10);
      if (!urls.length) return "No short links yet.";
      return urls.map(u => `• ${serverOrigin}/r/${u.shortCode} → ${u.originalUrl}${u.title ? ` (${u.title})` : ""} [${u.clicks} clicks]`).join("\n");
    }

    if (toolName === "get_smm_stats") {
      const userKeyRows = await db.select().from(smmUserKeysTable).where(eq(smmUserKeysTable.toolUserId, uid));
      const keys: Record<string, string> = userKeyRows.length
        ? Object.fromEntries(userKeyRows.filter(r => r.keyValue).map(r => [r.keyName, r.keyValue!]))
        : Object.fromEntries((await db.execute(sql`SELECT name, value FROM integrations WHERE name LIKE 'SMM_%'`)).rows.map((r: any) => [r.name, r.value]));
      const platforms = await fetchAllPlatforms(keys);
      const connected = Object.entries(platforms).filter(([, v]) => v.connected);
      if (!connected.length) return "No social media platforms connected yet.";
      const totalFollowers = connected.reduce((s, [, v]) => s + (v.connected ? v.followers : 0), 0);
      return [
        `📊 Social Media Stats`,
        `Connected: ${connected.length} platforms (${connected.map(([k]) => k).join(", ")})`,
        `Total followers: ${totalFollowers.toLocaleString()}`,
        "",
        ...connected.map(([p, v]) => v.connected ? `${p}: ${v.followers.toLocaleString()} followers${v.username ? ` (@${v.username})` : ""}` : ""),
      ].filter(l => l !== undefined).join("\n");
    }

    if (toolName === "get_smm_posts") {
      const fetchType = String(toolInput.type ?? "all");
      const lines: string[] = [];
      if (fetchType === "scheduled" || fetchType === "all") {
        const scheduled = await db.select({
          content: smmScheduledPostsTable.content,
          platforms: smmScheduledPostsTable.platforms,
          scheduledAt: smmScheduledPostsTable.scheduledAt,
          status: smmScheduledPostsTable.status,
        }).from(smmScheduledPostsTable).where(eq(smmScheduledPostsTable.toolUserId, uid)).orderBy(desc(smmScheduledPostsTable.scheduledAt)).limit(10);
        if (scheduled.length) {
          lines.push("📅 Scheduled Posts:");
          scheduled.forEach(p => {
            const date = p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : "?";
            lines.push(`  [${p.status ?? "pending"}] ${date} → ${p.platforms} — "${(p.content ?? "").slice(0, 80)}"`);
          });
        }
      }
      if (fetchType === "recent" || fetchType === "all") {
        const userKeyRows = await db.select().from(smmUserKeysTable).where(eq(smmUserKeysTable.toolUserId, uid));
        const keys: Record<string, string> = userKeyRows.length
          ? Object.fromEntries(userKeyRows.filter(r => r.keyValue).map(r => [r.keyName, r.keyValue!]))
          : Object.fromEntries((await db.execute(sql`SELECT name, value FROM integrations WHERE name LIKE 'SMM_%'`)).rows.map((r: any) => [r.name, r.value]));
        const platforms = await fetchAllPlatforms(keys);
        const connected = Object.entries(platforms).filter(([, v]) => v.connected);
        if (connected.length) {
          lines.push("\n📣 Recent Published Posts:");
          for (const [platform, v] of connected) {
            if (!v.connected || !v.recentPosts?.length) continue;
            lines.push(`  ${platform}:`);
            v.recentPosts.slice(0, 3).forEach(p => {
              lines.push(`    • [${p.date}] "${p.content.slice(0, 80)}" — ❤️ ${p.likes} 💬 ${p.comments}`);
            });
          }
        }
      }
      return lines.length ? lines.join("\n") : "No posts found.";
    }

    if (toolName === "get_site_info") {
      const requested = Array.isArray(toolInput.sections) && (toolInput.sections as string[]).length > 0
        ? toolInput.sections as string[]
        : ["team", "services", "portfolio", "blog", "careers", "contact"];
      const parts: string[] = [];

      if (requested.includes("contact")) {
        parts.push([
          "## Advantix Digital — Contact Info",
          "Email: hello@advantix.digital",
          "Phone / WhatsApp: +1 (234) 567-890",
          "Response Time: Within 24 hours",
          "Location: Global Remote Agency (Bangladesh-based)",
          "Website: https://advantix.digital",
          "Facebook: https://facebook.com/advantixagency",
          "Instagram: https://instagram.com/advantixagency",
          "Twitter: https://twitter.com/advantixagency",
          "LinkedIn: https://linkedin.com/company/advantixagency",
        ].join("\n"));
      }
      if (requested.includes("team")) {
        const members = await db.select({ name: teamMembersTable.name, role: teamMembersTable.role, bio: teamMembersTable.bio, email: teamMembersTable.email, linkedinUrl: teamMembersTable.linkedinUrl }).from(teamMembersTable).orderBy(teamMembersTable.id);
        parts.push(members.length
          ? `## Team (${members.length})\n${members.map(m => `• ${m.name} — ${m.role}${m.bio ? `: ${m.bio}` : ""}${m.email ? ` | ${m.email}` : ""}`).join("\n")}`
          : "## Team\nNo team members found.");
      }
      if (requested.includes("services")) {
        const svcs = await db.select({ name: servicesTable.name, shortDescription: servicesTable.shortDescription, price: servicesTable.price }).from(servicesTable).where(eq(servicesTable.isActive, true));
        parts.push(svcs.length
          ? `## Services (${svcs.length})\n${svcs.map(s => `• ${s.name}${s.shortDescription ? `: ${s.shortDescription}` : ""}${s.price ? ` (from ${s.price})` : ""}`).join("\n")}`
          : "## Services\nNone listed.");
      }
      if (requested.includes("portfolio")) {
        const items = await db.select({ title: portfolioItemsTable.title, category: portfolioItemsTable.category, clientName: portfolioItemsTable.clientName, liveUrl: portfolioItemsTable.liveUrl }).from(portfolioItemsTable).orderBy(desc(portfolioItemsTable.id)).limit(8);
        parts.push(items.length
          ? `## Portfolio (latest ${items.length})\n${items.map(p => `• ${p.title} [${p.category ?? "Project"}]${p.clientName ? ` — ${p.clientName}` : ""}${p.liveUrl ? ` | ${p.liveUrl}` : ""}`).join("\n")}`
          : "## Portfolio\nNone found.");
      }
      if (requested.includes("blog")) {
        const posts = await db.select({ title: blogPostsTable.title, author: blogPostsTable.author, category: blogPostsTable.category, slug: blogPostsTable.slug, publishedAt: blogPostsTable.publishedAt }).from(blogPostsTable).where(eq(blogPostsTable.status, "published")).orderBy(desc(blogPostsTable.publishedAt)).limit(6);
        parts.push(posts.length
          ? `## Blog (latest ${posts.length})\n${posts.map(p => `• "${p.title}"${p.author ? ` by ${p.author}` : ""}${p.category ? ` [${p.category}]` : ""} — https://advantix.digital/blog/${p.slug}`).join("\n")}`
          : "## Blog\nNo posts.");
      }
      if (requested.includes("careers")) {
        const contests = await db.select({ title: contestsTable.title, type: contestsTable.type, prize: contestsTable.prize, deadline: contestsTable.deadline }).from(contestsTable).where(eq(contestsTable.isActive, true)).orderBy(desc(contestsTable.createdAt));
        parts.push(contests.length
          ? `## Open Contests/Careers (${contests.length})\n${contests.map(c => `• [${c.type}] ${c.title}${c.prize ? ` — Prize: ${c.prize}` : ""}${c.deadline ? ` | Deadline: ${new Date(c.deadline).toLocaleDateString()}` : ""}`).join("\n")}`
          : "## Careers\nNo active contests.");
      }
      return parts.join("\n\n") || "No data found.";
    }

    return `Unknown platform tool: ${toolName}`;
  } catch (err) {
    return `Error: ${String(err)}`;
  }
}

/* ── In-memory conversation history (per chat ID) ─────────────────────── */
type Message = { role: "user" | "assistant"; content: string | object[] };
const histories = new Map<number, Message[]>();
const MAX_HISTORY = 8;

function getHistory(chatId: number): Message[] {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId)!;
}
function addToHistory(chatId: number, msg: Message) {
  const h = getHistory(chatId);
  h.push(msg);
  if (h.length > MAX_HISTORY * 2) h.splice(0, h.length - MAX_HISTORY * 2);
}

/* ── Format tool result back to message list ──────────────────────────── */
function toolResultMsg(toolId: string, content: string): Message {
  return {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolId, content }],
  };
}

/* ── Main chat function ───────────────────────────────────────────────── */
async function runChat(
  chatId: number,
  userText: string,
  uid: number,
  bot: TelegramBot,
  serverOrigin: string,
  provider: Provider,
  model: string,
  apiKey: string,
): Promise<void> {
  const agentConnected = isAgentConnected(uid);
  const agentInfo = getAgentInfo(uid);
  const sysContext = agentConnected && agentInfo
    ? `Agent connected. OS: ${agentInfo.os}, Shell: ${agentInfo.shell}, CWD: ${agentInfo.cwd}, User: ${agentInfo.username}. Use tools to control the machine.`
    : "No local agent connected. Platform tools available. For local machine control, user must start the desktop agent.";

  const systemPrompt = `You are Advantix Assistant — the AI helper for Advantix Digital, a full-stack digital agency.
You are responding via Telegram to the agency owner/admin.
${sysContext}
Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
Be concise and helpful. Use Markdown formatting. For sensitive operations confirm first.`;

  const allTools = [...PLATFORM_TOOLS_DEF, ...(agentConnected ? AGENT_TOOLS_DEF : [])];

  addToHistory(chatId, { role: "user", content: userText });

  const history = getHistory(chatId);

  /* Convert to provider format */
  const toOpenAITools = (tools: typeof allTools) => tools.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const MAX_ROUNDS = 6;
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    let responseText = "";
    let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

    if (provider === "anthropic") {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      const body = {
        model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: allTools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        messages: history,
      };
      const res = await fetch(PROVIDER_URLS.anthropic, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await res.json() as any;
      if (data.error) throw new Error(data.error.message ?? String(data.error));

      for (const block of (data.content ?? [])) {
        if (block.type === "text") responseText += block.text;
        if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
      }

      if (toolCalls.length > 0) {
        addToHistory(chatId, { role: "assistant", content: data.content });
      } else {
        if (responseText) addToHistory(chatId, { role: "assistant", content: responseText });
      }
    } else {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      if (provider === "openrouter") headers["HTTP-Referer"] = "https://advantix.digital";
      const msgs = [{ role: "system" as const, content: systemPrompt }, ...history.map(m => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }))];
      const body = { model, max_tokens: 1024, messages: msgs, tools: allTools.length ? toOpenAITools(allTools) : undefined };
      const res = await fetch(PROVIDER_URLS[provider], { method: "POST", headers, body: JSON.stringify(body) });
      const data = await res.json() as any;
      const choice = data.choices?.[0];
      responseText = choice?.message?.content ?? "";
      const rawCalls = choice?.message?.tool_calls ?? [];
      for (const tc of rawCalls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /**/ }
        toolCalls.push({ id: tc.id ?? randomBytes(4).toString("hex"), name: tc.function?.name ?? "", input });
      }
      if (toolCalls.length > 0) {
        addToHistory(chatId, { role: "assistant", content: choice?.message?.content ?? null });
      } else if (responseText) {
        addToHistory(chatId, { role: "assistant", content: responseText });
      }
    }

    /* No more tool calls — send final response */
    if (toolCalls.length === 0) {
      if (responseText.trim()) {
        await bot.sendMessage(chatId, responseText, { parse_mode: "Markdown" }).catch(() =>
          bot.sendMessage(chatId, responseText) /* fallback without markdown */
        );
      }
      return;
    }

    /* Execute tools */
    const toolResults: string[] = [];
    for (const tc of toolCalls) {
      let resultText: string;

      if (PLATFORM_TOOLS_DEF.some(t => t.name === tc.name)) {
        resultText = await executePlatformTool(tc.name, tc.input, uid, serverOrigin);
      } else if (agentConnected) {
        const toolId = tc.id || randomBytes(4).toString("hex");
        try {
          const r = await sendToolCall(uid, toolId, tc.name, tc.input, 60_000);
          resultText = r.exitCode === 0 ? (r.stdout || "(no output)") : `Error (exit ${r.exitCode}): ${r.stderr || r.error || "unknown error"}`;
        } catch (err) {
          resultText = `Tool call failed: ${String(err)}`;
        }
      } else {
        resultText = `Tool ${tc.name} requires the desktop agent to be running.`;
      }

      toolResults.push(`[${tc.name}]: ${resultText.slice(0, 800)}`);

      /* Add tool result to history */
      if (provider === "anthropic") {
        addToHistory(chatId, toolResultMsg(tc.id, resultText));
      } else {
        addToHistory(chatId, {
          role: "user",
          content: `Tool result for ${tc.name}:\n${resultText}`,
        });
      }
    }

    /* Send a brief status to Telegram if tools ran */
    if (toolResults.length) {
      await bot.sendChatAction(chatId, "typing").catch(() => {});
    }
  }

  await bot.sendMessage(chatId, "_(Reached maximum processing rounds. Please try again.)_", { parse_mode: "Markdown" });
}

/* ── Bot startup ──────────────────────────────────────────────────────── */
let botInstance: TelegramBot | null = null;

export async function startTelegramBot(): Promise<void> {
  const token = await getIntegration("TELEGRAM_BOT_TOKEN");
  if (!token) {
    logger.info("Telegram bot not started: TELEGRAM_BOT_TOKEN not configured.");
    return;
  }

  const ownerChatIdStr = await getIntegration("TELEGRAM_CHAT_ID");
  if (!ownerChatIdStr) {
    logger.info("Telegram bot not started: TELEGRAM_CHAT_ID not configured.");
    return;
  }
  const ownerChatId = parseInt(ownerChatIdStr, 10);
  if (isNaN(ownerChatId)) {
    logger.warn("Telegram bot not started: TELEGRAM_CHAT_ID is not a valid number.");
    return;
  }

  /* Get the tool user ID linked to this Telegram session */
  const uidStr = await getIntegration("TELEGRAM_TOOL_USER_ID");
  const uid = uidStr ? parseInt(uidStr, 10) : 1;

  if (botInstance) {
    try { botInstance.stopPolling(); } catch { /* ignore */ }
  }

  const bot = new TelegramBot(token, { polling: true });
  botInstance = bot;

  logger.info(`Telegram bot started. Owner chat ID: ${ownerChatId}`);

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    let text = msg.text?.trim();

    /* Only respond to the owner */
    if (chatId !== ownerChatId) {
      await bot.sendMessage(chatId, "⛔ Unauthorized. This bot is private.").catch(() => {});
      return;
    }

    /* ── Voice / audio message → transcribe with Gemini Flash ────────────── */
    const voiceOrAudio = msg.voice ?? msg.audio;
    if (!text && voiceOrAudio) {
      await bot.sendChatAction(chatId, "typing").catch(() => {});
      try {
        const fileLink = await bot.getFileLink(voiceOrAudio.file_id);
        const audioRes = await fetch(fileLink);
        if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        /* Telegram voice notes are always OGG/OPUS; audio files can vary */
        const mimeType = (msg.voice ? "audio/ogg" : (msg.audio?.mime_type ?? "audio/mpeg"));
        text = await transcribeAudio(audioBuffer, mimeType);
        if (!text) {
          await bot.sendMessage(chatId, "⚠️ Voice message transcription returned empty. Please try again.");
          return;
        }
        /* Echo the transcript so the user knows what was understood */
        await bot.sendMessage(chatId, `🎤 _Transcribed:_ "${text}"`, { parse_mode: "Markdown" }).catch(() => {});
      } catch (err) {
        logger.error({ err }, "Voice transcription error");
        await bot.sendMessage(chatId, `❌ Could not transcribe voice message: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    if (!text) return;

    /* /start command */
    if (text === "/start") {
      await bot.sendMessage(chatId,
        "👋 *Advantix Assistant is ready!*\n\nI can help you with:\n• SMM stats and posts\n• Site info (team, services, portfolio)\n• Short link creation\n• Desktop commands (if agent is running)\n\nJust send me a message!",
        { parse_mode: "Markdown" }
      );
      return;
    }

    /* /clear command — reset conversation */
    if (text === "/clear") {
      histories.delete(chatId);
      await bot.sendMessage(chatId, "✅ Conversation cleared.");
      return;
    }

    /* /status command */
    if (text === "/status") {
      const agentConnected = isAgentConnected(uid);
      const agentInfo = getAgentInfo(uid);
      const status = agentConnected && agentInfo
        ? `✅ Desktop agent connected\nOS: ${agentInfo.os} | User: ${agentInfo.username}`
        : "❌ Desktop agent not connected";
      await bot.sendMessage(chatId, status);
      return;
    }

    /* Typing indicator */
    await bot.sendChatAction(chatId, "typing").catch(() => {});

    /* Load AI config */
    const [providerSetting, modelSetting] = await Promise.all([
      getIntegration("ASSISTANT_PROVIDER"),
      getIntegration("ASSISTANT_MODEL"),
    ]);
    const provider: Provider = (providerSetting as Provider) || "anthropic";
    const apiKey = await getIntegration(PROVIDER_KEY_NAMES[provider]) ?? process.env[PROVIDER_KEY_NAMES[provider]] ?? "";
    if (!apiKey) {
      await bot.sendMessage(chatId, "⚠️ AI API key not configured. Please set it in Admin → Integrations.");
      return;
    }
    const model = modelSetting || DEFAULT_MODELS[provider];

    /* Server origin for short links */
    const serverOrigin = process.env["SERVER_ORIGIN"] ?? "https://advantix.digital";

    try {
      await runChat(chatId, text, uid, bot, serverOrigin, provider, model, apiKey);
    } catch (err) {
      logger.error({ err }, "Telegram bot chat error");
      await bot.sendMessage(chatId, `❌ Error: ${String(err).slice(0, 200)}`);
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });
}

export async function stopTelegramBot(): Promise<void> {
  if (botInstance) {
    await botInstance.stopPolling().catch(() => {});
    botInstance = null;
  }
}
