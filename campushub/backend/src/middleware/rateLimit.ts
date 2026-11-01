import type { Request, RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const message = (text: string) => ({ error: { code: "RATE_LIMITED", message: text } });

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");
/** Logged-in users get their own bucket, so classmates behind one campus Wi-Fi IP don't share a limit. */
const userOrIpKey = (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${ipKey(req)}`);
/** Per account + IP: stops password guessing against one account without blocking everyone else on that IP. */
const emailKey = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 255) : "";
  return `${ipKey(req)}|${email}`;
};

const common = { standardHeaders: "draft-8", legacyHeaders: false } as const;

/** Builds the rate limiters. When disabled (tests), they become no-op middleware. */
export function createRateLimiters(enabled: boolean) {
  const off: RequestHandler = (_req, _res, next) => next();
  if (!enabled) return { general: off, authPerIp: off, authPerAccount: off, ai: off };

  return {
    // every API call (runs after the session is loaded)
    general: rateLimit({ ...common, windowMs: 60_000, limit: 300, keyGenerator: userOrIpKey, message: message("Too many requests. Please slow down.") }),
    // login, registration and password reset from one network (generous: a whole class may share one IP)
    authPerIp: rateLimit({ ...common, windowMs: 15 * 60_000, limit: 200, keyGenerator: ipKey, message: message("Too many attempts from this network. Please wait 15 minutes and try again.") }),
    // repeated attempts for the same email address (protects each account against password guessing)
    authPerAccount: rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10, keyGenerator: emailKey, message: message("Too many attempts for this account. Please wait 15 minutes and try again.") }),
    // AI calls cost money: limit per logged-in user
    ai: rateLimit({ ...common, windowMs: 60_000, limit: 15, keyGenerator: userOrIpKey, message: message("You are sending messages too quickly. Please wait a minute.") }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
