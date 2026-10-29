import type { Request, Response, NextFunction } from "express";
import { AppError } from "./errors";
import { logger } from "./logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, details: err.details },
    });
  }
  const e = err as Error;
  logger.error({ err: e?.message, stack: e?.stack, path: req.path }, "unhandled error");
  return res.status(500).json({ success: false, error: { message: "Internal server error", code: "INTERNAL_ERROR" } });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { message: "Route not found", code: "NOT_FOUND" } });
}

