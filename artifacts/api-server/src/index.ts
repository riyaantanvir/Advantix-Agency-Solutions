import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedAdmin, ensureSessionTable, runMigrations, seedServices, seedTelegramDefaults } from "./seed.js";
import { startSmmScheduler } from "./lib/smmPublisher.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
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

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start SMM scheduler after server is ready — picks up any missed posts
    // and sets precise setTimeout timers for upcoming ones (no polling needed)
    startSmmScheduler().catch(e => logger.error({ err: e }, "SMM scheduler init failed"));
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
