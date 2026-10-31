import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users, type UserRole } from "../db/schema.js";
import { SESSION_COOKIE, clearSessionCookie, destroySession } from "../services/sessions.js";
import { sha256 } from "../utils/crypto.js";
import { forbidden, unauthorized } from "../utils/httpError.js";

/** Reads the session cookie (if any) and attaches the logged-in user to req.user. */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || !token) return next();

  const sessionId = sha256(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      onboardingCompleted: users.onboardingCompleted,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));

  if (!row) {
    clearSessionCookie(res);
    return next();
  }
  if (row.expiresAt <= new Date() || !row.isActive) {
    await destroySession(sessionId);
    clearSessionCookie(res);
    return next();
  }

  req.user = {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    onboardingCompleted: row.onboardingCompleted,
    emailVerified: Boolean(row.emailVerifiedAt),
    sessionId,
  };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Role checks always use the role stored in the database, never one sent by the browser. */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden("This area is only available to administrators.", "ROLE_REQUIRED"));
    next();
  };

export const requireStudent = requireRole("STUDENT");
export const requireAdmin = requireRole("ADMIN");

/** Student features unlock after the mandatory onboarding step. */
export function requireOnboarded(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role === "STUDENT" && !req.user.onboardingCompleted) {
    return next(forbidden("Please complete your profile onboarding first.", "ONBOARDING_REQUIRED"));
  }
  next();
}

/** Typed accessor for handlers that already passed requireAuth. */
export function currentUser(req: Request) {
  if (!req.user) throw unauthorized();
  return req.user;
}
