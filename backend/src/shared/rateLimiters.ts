import rateLimit from "express-rate-limit";

// Stricter limiter for auth endpoints (register/login)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many authentication attempts, please try again later", code: "RATE_LIMITED" } },
});

// General API limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
