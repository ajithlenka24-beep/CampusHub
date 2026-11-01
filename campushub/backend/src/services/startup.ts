/**
 * One-off checks and setup that run when the server starts.
 */
import bcrypt from "bcryptjs";
import { count, eq, like } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { studentProfiles, users } from "../db/schema.js";
import { BCRYPT_ROUNDS } from "../routes/auth.routes.js";
import { password as passwordRule } from "../validators/common.js";

/**
 * Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD if no account uses that
 * email yet. An existing account is NEVER changed or promoted (otherwise someone could register
 * that address first and become an administrator). The password itself is never logged.
 */
export async function ensureBootstrapAdmin() {
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ADMIN_EMAIL) || !env.ADMIN_PASSWORD) {
    console.warn("[CampusHub] ADMIN_EMAIL and ADMIN_PASSWORD must both be set to create the first administrator. Skipped.");
    return;
  }
  const strong = passwordRule.safeParse(env.ADMIN_PASSWORD);
  if (!strong.success) {
    console.warn(`[CampusHub] ADMIN_PASSWORD is too weak (${strong.error.issues[0]?.message}). The administrator was not created.`);
    return;
  }
  const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, env.ADMIN_EMAIL));
  if (existing) {
    if (existing.role !== "ADMIN") {
      console.warn(`[CampusHub] ADMIN_EMAIL belongs to an existing student account, which was left unchanged. Use \`npm run create-admin\` to promote it deliberately.`);
    }
    return;
  }
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email: env.ADMIN_EMAIL, fullName: env.ADMIN_NAME || "CampusHub Admin", passwordHash, role: "ADMIN", onboardingCompleted: true, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await tx.insert(studentProfiles).values({ userId: created.id });
  });
  console.log(`[CampusHub] Created administrator ${env.ADMIN_EMAIL}. You can now remove ADMIN_PASSWORD from the environment.`);
}

/** Loud warnings for settings that are fine on a laptop but unsafe on a public server. */
export async function productionWarnings() {
  if (!env.isProduction) return;
  // the development seed's demo accounts have publicly documented passwords
  const [demo] = await db.select({ n: count() }).from(users).where(like(users.email, "%@campushub.dev"));
  if (Number(demo?.n ?? 0) > 0) {
    console.warn(`[CampusHub] WARNING: ${demo.n} demo account(s) (@campushub.dev) exist in this production database. Their passwords are public in the README. Deactivate or delete them from the admin panel.`);
  }
  if (!env.smtpEnabled) {
    console.warn(
      env.EMAIL_VERIFICATION_REQUIRED
        ? "[CampusHub] WARNING: EMAIL_VERIFICATION_REQUIRED is on but SMTP is not configured, so new users can never verify their email or log in."
        : "[CampusHub] SMTP is not configured: password-reset emails are only written to the server log.",
    );
  }
}
