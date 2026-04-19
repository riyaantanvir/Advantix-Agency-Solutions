import { createServer } from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedAdmin, ensureSessionTable, runMigrations, seedServices, seedTelegramDefaults, seedPrivacyPolicy, seedTermsOfService, seedDataDeletion } from "./seed.js";
import { startSmmScheduler } from "./lib/smmPublisher.js";
import { startTelegramBot } from "./lib/telegramBot.js";
import { startFacebookScheduler } from "./lib/facebookScheduler.js";
import { handleAgentWebSocket } from "./routes/advantixAssistant.js";
import { resumeAllSessions as resumeWhatsAppSessions } from "./lib/whatsappService.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await ensureSessionTable();
  await runMigrations();
  await seedAdmin();
  await seedServices();
  await seedTelegramDefaults();
  await seedPrivacyPolicy();
  await seedTermsOfService();
  await seedDataDeletion();

  const httpServer = createServer(app);

  /* ── WebSocket upgrade handler ─────────────────────────────────────────── */
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/agent/ws")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleAgentWebSocket(ws, req).catch((err) => {
          logger.error({ err }, "Agent WS handler error");
          ws.close(1011, "server error");
        });
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    logger.info("Agent WebSocket endpoint: ws://host/api/agent/ws?key=API_KEY");

    startSmmScheduler().catch(e => logger.error({ err: e }, "SMM scheduler init failed"));
    startFacebookScheduler();
    resumeWhatsAppSessions().catch(e => logger.error({ err: e }, "WhatsApp resume failed"));
    startTelegramBot().catch(e => logger.error({ err: e }, "Telegram bot init failed"));
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
