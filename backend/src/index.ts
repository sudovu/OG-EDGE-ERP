import { createApp, mountRoutes } from "./app";
import { config } from "./config";
import { closeDb } from "./db/database";
import { runMigrations } from "./db/migrate";
import { seedPermissionsIfNeeded } from "./db/seed";
import { apiRouter } from "./routes";
import { logger } from "./core/logger";
import { errorHandler, notFoundHandler } from "./core/errorHandler";
import { startScheduler, stopScheduler } from "./modules/scheduler/scheduler.service";

async function main() {
  // Production environment validation
  if (config.nodeEnv === "production") {
    const required = ["JWT_SECRET", "DB_DRIVER", "DB_PATH", "DATABASE_URL"];
    const missing = required.filter((k) => !config[k as keyof typeof config]);
    if (missing.length > 0) {
      throw new Error(`Missing required production env vars: ${missing.join(", ")}`);
    }
    if (config.dbDriver === "postgres" && !config.databaseUrl) {
      throw new Error("DATABASE_URL is required when DB_DRIVER=postgres");
    }
  }

  // ensure db + migrations at startup
  await runMigrations();
  await seedPermissionsIfNeeded();

  // start scheduled background job runner (webhook deliveries + retries)
  startScheduler(30000);

  const app = createApp();
  mountRoutes(app, apiRouter);

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "OG-EDGE ERP backend listening");
  });

  process.on("SIGINT", async () => {
    stopScheduler();
    server.close();
    await closeDb();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    stopScheduler();
    server.close();
    await closeDb();
    process.exit(0);
  });
}

main().catch((e) => {
  logger.error({ err: e?.message }, "startup failed");
  process.exit(1);
});
