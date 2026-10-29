import { defineConfig } from "vitest/config";

import path from "node:path";
import fs from "node:fs";
const tmpDir = path.join(process.env.TEMP ?? "C:\\Users\\Sudo\\AppData\\Local\\Temp\\opencode", "ogedge-test");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, `test-${Date.now()}.db`);

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      DB_PATH: dbPath,
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
      CORS_ORIGIN: "*",
    },
  },
});