import { createApp, mountRoutes } from "./app";
import { config } from "./config";
import { getDb, closeDb } from "./db/database";
import { runMigrations } from "./db/migrate";
import { seedPermissionsIfNeeded } from "./db/seed";
import { apiRouter } from "./routes";
import { logger } from "./core/logger";
import { errorHandler, notFoundHandler } from "./core/errorHandler";
import { startScheduler, stopScheduler } from "./modules/scheduler/scheduler.service";

// ensure db + migrations at startup
getDb();
runMigrations();
seedPermissionsIfNeeded();

// start scheduled background job runner (webhook deliveries + retries)
startScheduler(30000);

const app = createApp();
mountRoutes(app, apiRouter);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "OG-EDGE ERP backend listening");
});

process.on("SIGINT", () => {
  stopScheduler();
  server.close();
  closeDb();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopScheduler();
  server.close();
  closeDb();
  process.exit(0);
});

