import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  dbDriver: process.env.DB_DRIVER ?? "sqlite",
  dbPath: process.env.DB_PATH ?? path.join(process.cwd(), "data", "og-edge.db"),
  databaseUrl: process.env.DATABASE_URL ?? undefined,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  logLevel: process.env.LOG_LEVEL ?? "info",
};

if (config.nodeEnv === "production" && config.jwtSecret === "dev-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production");
}

