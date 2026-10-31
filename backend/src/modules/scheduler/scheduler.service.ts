import { processIntegrationEvents, retryFailedEvents } from "../webhooks/webhook.service";
import { logger } from "../../core/logger";

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let intervalMs = 30000; // default 30 seconds
let lastRun: { processed: number; delivered: number; failed: number; retried: number } | null = null;
let startTime: Date | null = null;

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastRun: { processed: number; delivered: number; failed: number; retried: number } | null;
  startTime: Date | null;
}

/** Run one tick: process pending events + retry failed ones. */
export async function runSchedulerTick(): Promise<SchedulerStatus> {
  if (isRunning) return getStatus();
  isRunning = true;
  try {
    const processed = await processIntegrationEvents();
    const retried = await retryFailedEvents();
    lastRun = {
      processed: processed.processed,
      delivered: processed.delivered,
      failed: processed.failed,
      retried: retried.retried,
    };
    logger.info({ ...lastRun }, "scheduler tick completed");
  } catch (e: any) {
    logger.error({ err: e?.message }, "scheduler tick error");
  } finally {
    isRunning = false;
  }
  return getStatus();
}

export function getStatus(): SchedulerStatus {
  return { running: isRunning, intervalMs, lastRun, startTime };
}

export function startScheduler(ms = 30000): void {
  if (intervalId) clearInterval(intervalId);
  intervalMs = ms;
  startTime = new Date();
  // run immediately once
  void runSchedulerTick();
  intervalId = setInterval(() => {
    void runSchedulerTick();
  }, ms);
  logger.info({ intervalMs }, "scheduler started");
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  logger.info("scheduler stopped");
}
