import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE } from "../services/sessions.js";
import { safeEqual } from "../utils/crypto.js";
import { forbidden } from "../utils/httpError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF protection: every state-changing request must send the
 * value of the `ch_csrf` cookie in the `X-CSRF-Token` header. Another website
 * cannot read our cookie, so it cannot forge that header.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");
  if (typeof cookieToken !== "string" || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(forbidden("Security check failed. Please refresh the page and try again.", "CSRF_FAILED"));
  }
  next();
}
