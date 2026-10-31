import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { emailVerificationTokens, passwordResetTokens, studentProfiles, users } from "../db/schema.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { logActivity } from "../services/activity.js";
import { sendMail } from "../services/mail.js";
import { notify } from "../services/notifications.js";
import { CSRF_COOKIE, clearSessionCookie, createSession, destroyAllSessions, destroySession, issueCsrfCookie } from "../services/sessions.js";
import { randomToken, sha256 } from "../utils/crypto.js";
import { addHours } from "../utils/dates.js";
import { HttpError, badRequest, conflict } from "../utils/httpError.js";
import { email, password, semester, text } from "../validators/common.js";

export const BCRYPT_ROUNDS = 12;
// Used when the email does not exist, so a failed login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync("campushub-timing-guard", BCRYPT_ROUNDS);

const registerSchema = z
  .object({
    fullName: text(2, 120, "Full name"),
    email,
    password,
    confirmPassword: z.string(),
    college: text(2, 160, "College name"),
    course: text(2, 120, "Course"),
    semester,
    acceptTerms: z.literal(true, { error: "You must accept the terms and conditions." }),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required.").max(200),
  rememberMe: z.boolean().optional().default(false),
});

const resetSchema = z
  .object({ token: z.string().min(10, "This reset link is invalid."), password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Current password is required."), newPassword: password, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

/** The user object the frontend receives (never includes the password hash). */
export async function publicUser(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      onboardingCompleted: users.onboardingCompleted,
      emailVerifiedAt: users.emailVerifiedAt,
      avatarUrl: studentProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;
  const { emailVerifiedAt, ...rest } = row;
  return { ...rest, emailVerified: Boolean(emailVerifiedAt) };
}

async function sendVerificationEmail(userId: string, to: string, name: string) {
  const token = randomToken();
  await db.insert(emailVerificationTokens).values({ userId, tokenHash: sha256(token), expiresAt: addHours(new Date(), 24) });
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail(to, "Verify your CampusHub email", `Hi ${name},\n\nWelcome to CampusHub! Confirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you did not create an account, you can ignore this email.`);
}

export function authRouter(limiter: import("express").RequestHandler) {
  const router = Router();

  /** Issues the CSRF cookie. The frontend calls this once when it loads. */
  router.get("/csrf", (req, res) => {
    const token = issueCsrfCookie(res, req.cookies?.[CSRF_COOKIE]);
    res.json({ csrfToken: token });
  });

  router.post("/register", limiter, async (req, res) => {
    const data = parse(registerSchema, req.body);
    const domain = data.email.split("@")[1] ?? "";
    if (env.allowedEmailDomains.length && !env.allowedEmailDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      throw badRequest(`Please register with your college email (${env.allowedEmailDomains.join(", ")}).`, [{ path: "email", message: "Use your college email address." }]);
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if (existing) throw conflict("An account with this email already exists. Try logging in instead.", "EMAIL_TAKEN");

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: data.email,
          passwordHash,
          fullName: data.fullName,
          role: "STUDENT",
          emailVerifiedAt: env.EMAIL_VERIFICATION_REQUIRED ? null : new Date(),
        })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
      await tx.insert(studentProfiles).values({ userId: created.id, college: data.college, course: data.course, semester: data.semester });
      await notify(tx, created.id, {
        type: "SYSTEM",
        title: "Welcome to CampusHub",
        message: "Complete your profile to unlock skill-matched opportunities and Group Up.",
        link: "/profile",
        dedupeKey: "welcome",
      });
      return created;
    });

    if (env.EMAIL_VERIFICATION_REQUIRED) await sendVerificationEmail(user.id, user.email, user.fullName);
    await logActivity(db, { actorId: user.id, action: "USER_REGISTERED", entityType: "user", entityId: user.id });

    res.status(201).json({
      message: env.EMAIL_VERIFICATION_REQUIRED
        ? "Account created. Check your email to verify your address, then log in."
        : "Account created. You can now log in.",
      verificationRequired: env.EMAIL_VERIFICATION_REQUIRED,
    });
  });

  router.post("/login", limiter, async (req, res) => {
    const { email: loginEmail, password: plain, rememberMe } = parse(loginSchema, req.body);
    const [user] = await db.select().from(users).where(eq(users.email, loginEmail));

    const valid = await bcrypt.compare(plain, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, "Incorrect email or password.", "INVALID_CREDENTIALS");
    if (!user.isActive) throw new HttpError(403, "This account has been deactivated. Contact your administrator.", "ACCOUNT_DISABLED");
    if (env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt) {
      throw new HttpError(403, "Please verify your email address before logging in.", "EMAIL_NOT_VERIFIED");
    }

    // a fresh session on every login (prevents session fixation)
    await createSession(res, user.id, rememberMe, req.get("user-agent") ?? "");
    issueCsrfCookie(res);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await logActivity(db, { actorId: user.id, action: "USER_LOGGED_IN", entityType: "user", entityId: user.id });

    res.json({ user: await publicUser(user.id) });
  });

  router.post("/logout", async (req, res) => {
    if (req.user) await destroySession(req.user.sessionId);
    clearSessionCookie(res);
    res.json({ message: "You have been logged out." });
  });

  /** Current session for the frontend's startup check: 200 with user (or null) instead of a 401. */
  router.get("/session", async (req, res) => {
    res.json({ user: req.user ? await publicUser(req.user.id) : null });
  });

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ user: await publicUser(currentUser(req).id) });
  });

  router.post("/forgot-password", limiter, async (req, res) => {
    const { email: target } = parse(z.object({ email }), req.body);
    const [user] = await db.select({ id: users.id, fullName: users.fullName, isActive: users.isActive }).from(users).where(eq(users.email, target));
    if (user?.isActive) {
      const token = randomToken();
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: addHours(new Date(), 1) });
      const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await sendMail(target, "Reset your CampusHub password", `Hi ${user.fullName},\n\nSomeone asked to reset your CampusHub password. Open this link within 1 hour to choose a new one:\n${link}\n\nIf this wasn't you, you can safely ignore this email.`);
    }
    // same answer whether or not the email exists (prevents account discovery)
    res.json({ message: "If an account exists for that email, a password reset link has been sent." });
  });

  router.post("/reset-password", limiter, async (req, res) => {
    const data = parse(resetSchema, req.body);
    const [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, sha256(data.token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())));
    if (!record) throw badRequest("This reset link is invalid or has expired. Please request a new one.");

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.userId, record.userId));
      await notify(tx, record.userId, { type: "SYSTEM", title: "Password changed", message: "Your password was reset. If this wasn't you, contact your administrator." });
    });
    await destroyAllSessions(record.userId); // log out every device
    await logActivity(db, { actorId: record.userId, action: "PASSWORD_RESET", entityType: "user", entityId: record.userId });
    res.json({ message: "Your password has been reset. You can now log in." });
  });

  router.post("/verify-email", async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(10, "This verification link is invalid.") }), req.body);
    const [record] = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.tokenHash, sha256(token)), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, new Date())));
    if (!record) throw badRequest("This verification link is invalid or has expired.");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
      await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.userId, record.userId));
    });
    res.json({ message: "Your email is verified. You can now log in." });
  });

  router.post("/resend-verification", limiter, async (req, res) => {
    const { email: target } = parse(z.object({ email }), req.body);
    const [user] = await db.select().from(users).where(eq(users.email, target));
    if (user && !user.emailVerifiedAt) await sendVerificationEmail(user.id, user.email, user.fullName);
    res.json({ message: "If that account still needs verification, a new link has been sent." });
  });

  router.post("/change-password", requireAuth, async (req, res) => {
    const me = currentUser(req);
    const data = parse(changePasswordSchema, req.body);
    const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id));
    if (!user || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
      throw badRequest("Your current password is incorrect.", [{ path: "currentPassword", message: "Incorrect password." }]);
    }
    await db.update(users).set({ passwordHash: await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS) }).where(eq(users.id, me.id));
    await destroyAllSessions(me.id);
    await createSession(res, me.id, false, req.get("user-agent") ?? "");
    res.json({ message: "Password updated. Other devices have been logged out." });
  });

  return router;
}
