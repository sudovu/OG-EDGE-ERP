import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./core/errorHandler";
import { getDb } from "./db/database";
import { openapiSpec } from "./docs/openapi";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  // health with DB check
  app.get("/health", (_req, res) => {
    try {
      getDb().prepare("SELECT 1").get();
      res.json({ success: true, data: { status: "ok", name: "OG-EDGE ERP", env: config.nodeEnv, db: "ok" } });
    } catch (e) {
      res.status(503).json({ success: false, data: { status: "degraded", db: "error" } });
    }
  });

  // metrics (basic)
  app.get("/metrics", (_req, res) => {
    const db = getDb();
    const orgs = (db.prepare("SELECT COUNT(*) as c FROM organizations").get() as any).c;
    const users = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    res.json({ success: true, data: { organizations: orgs, users, uptime: process.uptime(), memory: process.memoryUsage() } });
  });

  return app;
}

export function mountRoutes(app: express.Express, router: express.Router) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.use("/api/v1", router);
  app.use(notFoundHandler);
  app.use(errorHandler);
}

