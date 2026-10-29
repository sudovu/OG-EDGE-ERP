import { createApp, mountRoutes } from "./app";
import { config } from "./config";
import { getDb, closeDb } from "./db/database";
import { runMigrations } from "./db/migrate";
import { seedPermissionsIfNeeded } from "./db/seed";
import { apiRouter } from "./routes";
import { logger } from "./core/logger";
import { errorHandler, notFoundHandler } from "./core/errorHandler";

// ensure db + migrations at startup
getDb();
runMigrations();
seedPermissionsIfNeeded();

const app = createApp();
mountRoutes(app, apiRouter);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "OG-EDGE ERP backend listening");
});

process.on("SIGINT", () => {
  server.close();
  closeDb();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.close();
  closeDb();
  process.exit(0);
});

