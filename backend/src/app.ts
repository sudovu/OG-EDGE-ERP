import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./core/errorHandler";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  // health
  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", name: "OG-EDGE ERP", env: config.nodeEnv } });
  });

  // routes mounted in index after creation? We'll mount here via dynamic import to avoid cycles.
  // Routes are registered by callers of registerRoutes.
  return app;
}

export function mountRoutes(app: express.Express, router: express.Router) {
  app.use("/api/v1", router);
  app.use(notFoundHandler);
  app.use(errorHandler);
}

