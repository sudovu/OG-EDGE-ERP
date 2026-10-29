import type { Response } from "express";

export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res: Response, status: number, message: string, code?: string, details?: unknown) {
  return res.status(status).json({ success: false, error: { message, code, details } });
}

export function paginated(res: Response, data: unknown[], total: number, page: number, pageSize: number) {
  return res.status(200).json({
    success: true,
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

