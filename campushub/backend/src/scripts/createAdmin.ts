/**
 * Creates an administrator account (or promotes an existing account).
 *
 *   npm run create-admin -- --email admin@college.edu --name "Placement Cell" --password "S3cure!Pass"
 *
 * If --password is omitted, a strong random password is generated and printed once.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { studentProfiles, users } from "../db/schema.js";
import { BCRYPT_ROUNDS } from "../routes/auth.routes.js";
import { randomToken } from "../utils/crypto.js";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "CampusHub Admin";
  let password = arg("password");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- --email admin@college.edu [--name "Admin Name"] [--password "Str0ngPass"]');
    process.exitCode = 1;
    return;
  }
  const generated = !password;
  if (!password) password = `${randomToken(9)}Aa1!`;
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.error("The password must be 8+ characters with an uppercase letter, a lowercase letter and a number.");
    process.exitCode = 1;
    return;
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (existing) {
    await db.update(users).set({ role: "ADMIN", passwordHash, isActive: true, onboardingCompleted: true, emailVerifiedAt: new Date() }).where(eq(users.id, existing.id));
    console.log(`Updated ${email}: role is now ADMIN and the password was reset.`);
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, fullName: name, passwordHash, role: "ADMIN", onboardingCompleted: true, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await db.insert(studentProfiles).values({ userId: created.id });
    console.log(`Created administrator ${email}.`);
  }
  if (generated) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((error) => {
    console.error("Could not create the administrator:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
