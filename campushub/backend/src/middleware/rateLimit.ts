import type { Request, RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const message = (text: string) => ({ error: { code: "RATE_LIMITED", message: text } });

/** Builds the rate limiters. When disabled (tests), they become no-op middleware. */
export function createRateLimiters(enabled: boolean) {
  const off: RequestHandler = (_req, _res, next) => next();
  if (!enabled) return { general: off, auth: off, ai: off };

  return {
    general: rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, message: message("Too many requests. Please slow down.") }),
    // login, registration and password reset: protects against password guessing
    auth: rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: message("Too many attempts. Please wait 15 minutes and try again.") }),
    // AI calls cost money: limit per logged-in user
    ai: rateLimit({
      windowMs: 60_000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
      message: message("You are sending messages too quickly. Please wait a minute."),
    }),
  };
}
