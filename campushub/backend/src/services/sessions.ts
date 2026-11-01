import type { Response } from "express";
import { eq, lt } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { addDays, addHours } from "../utils/dates.js";

export const SESSION_COOKIE = "ch_session";
export const CSRF_COOKIE = "ch_csrf";

const cookieBase = () => ({ secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: "/" }) as const;

/**
 * Sessions are random tokens stored in an HTTP-only cookie. The database only
 * keeps a SHA-256 hash, so sessions can be revoked (logout, password reset)
 * and expire on the server, unlike stateless JWTs.
 */
export async function createSession(res: Response, userId: string, rememberMe: boolean, userAgent = "") {
  const token = randomToken(32);
  const expiresAt = rememberMe ? addDays(new Date(), env.REMEMBER_ME_TTL_DAYS) : addHours(new Date(), env.SESSION_TTL_HOURS);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: userAgent.slice(0, 255) });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    ...cookieBase(),
    // "Remember me" = persistent cookie; otherwise it disappears when the browser closes
    ...(rememberMe ? { expires: expiresAt } : {}),
  });
  return { expiresAt };
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, ...cookieBase() });
}

export async function destroySession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/**
 * CSRF "double-submit" token: stored in a cookie and returned in the response body; the frontend
 * echoes it back in the X-CSRF-Token header. Passing no `existing` value rotates the token
 * (done on login and logout, so one person's token is never reused by the next).
 */
export function issueCsrfCookie(res: Response, existing?: string) {
  const token = existing && existing.length >= 32 ? existing : randomToken(24);
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, ...cookieBase() });
  return token;
}
