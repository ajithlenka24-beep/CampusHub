import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { emailVerificationTokens, sessions, users } from "../src/db/schema.js";
import { getDevOutbox } from "../src/services/mail.js";
import { sha256 } from "../src/utils/crypto.js";
import { PASSWORD, adminClient, newClient, registerAndLogin, registration, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("registration", () => {
  it("creates an account and does not expose the password hash", async () => {
    const client = await newClient();
    const res = await client.post("/api/auth/register", registration("new@test.dev"));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(users).where(eq(users.email, "new@test.dev"));
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash.startsWith("$2")).toBe(true); // bcrypt
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("validates input and explains each problem", async () => {
    const client = await newClient();
    const weak = await client.post("/api/auth/register", registration("a@test.dev", { password: "short", confirmPassword: "short" }));
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.some((d: { path: string }) => d.path === "password")).toBe(true);
    const mismatch = await client.post("/api/auth/register", registration("a@test.dev", { confirmPassword: "Different1A" }));
    expect(mismatch.body.error.details[0].path).toBe("confirmPassword");
    const terms = await client.post("/api/auth/register", registration("a@test.dev", { acceptTerms: false }));
    expect(terms.status).toBe(400);
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    const client = await newClient();
    await client.post("/api/auth/register", registration("dup@test.dev"));
    const again = await client.post("/api/auth/register", registration("DUP@test.dev"));
    expect(again.status).toBe(409);
  });
});

describe("login, sessions and logout", () => {
  it("rejects a wrong password with a generic message", async () => {
    const client = await newClient();
    await client.post("/api/auth/register", registration("u@test.dev"));
    const res = await client.post("/api/auth/login", { email: "u@test.dev", password: "Wrong123A" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Incorrect email or password.");
    const unknown = await client.post("/api/auth/login", { email: "nobody@test.dev", password: "Wrong123A" });
    expect(unknown.body.error.message).toBe("Incorrect email or password.");
  });

  it("sets an HTTP-only session cookie and blocks protected routes after logout", async () => {
    const client = await newClient();
    await client.post("/api/auth/register", registration("u@test.dev"));
    const login = await client.post("/api/auth/login", { email: "u@test.dev", password: PASSWORD });
    const cookie = ([] as string[]).concat(login.headers["set-cookie"]).find((c) => c.startsWith("ch_session="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await client.get("/api/auth/me")).status).toBe(200);

    expect((await client.post("/api/auth/logout")).status).toBe(200);
    expect((await client.get("/api/auth/me")).status).toBe(401);
    expect((await client.get("/api/profile")).status).toBe(401);
  });

  it("unauthenticated visitors cannot reach any protected API", async () => {
    const client = await newClient();
    for (const url of ["/api/auth/me", "/api/dashboard", "/api/profile", "/api/opportunities", "/api/teams", "/api/notifications", "/api/admin/stats"]) {
      expect((await client.get(url)).status, url).toBe(401);
    }
  });

  it("session endpoint reports logged-out visitors without an error", async () => {
    const anon = await newClient();
    const res = await anon.get("/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("expired sessions are rejected", async () => {
    const client = await registerAndLogin("exp@test.dev");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });

  it("requires the CSRF header on state-changing requests", async () => {
    const client = await newClient();
    const res = await client.agent.post("/api/auth/login").send({ email: "x@test.dev", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
  });

  it("deactivated accounts cannot log in", async () => {
    const client = await newClient();
    await client.post("/api/auth/register", registration("off@test.dev"));
    await db.update(users).set({ isActive: false }).where(eq(users.email, "off@test.dev"));
    const res = await client.post("/api/auth/login", { email: "off@test.dev", password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("rate-limits repeated login attempts", async () => {
    const limited = await newClient(createApp({ rateLimit: true }));
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await limited.post("/api/auth/login", { email: "x@test.dev", password: "Wrong123A" })).status;
    expect(last).toBe(429);
  });
});

describe("password reset and email verification", () => {
  it("resets the password with the emailed token and logs out other sessions", async () => {
    const client = await registerAndLogin("reset@test.dev");
    const anon = await newClient();
    const forgot = await anon.post("/api/auth/forgot-password", { email: "reset@test.dev" });
    expect(forgot.status).toBe(200);
    const mail = [...getDevOutbox()].reverse().find((m) => m.to === "reset@test.dev")!;
    const token = decodeURIComponent(mail.text.match(/token=([^\s]+)/)![1]);

    const reset = await anon.post("/api/auth/reset-password", { token, password: "NewPass123", confirmPassword: "NewPass123" });
    expect(reset.status).toBe(200);
    expect((await client.get("/api/auth/me")).status).toBe(401); // old session revoked
    expect((await anon.post("/api/auth/login", { email: "reset@test.dev", password: PASSWORD })).status).toBe(401);
    expect((await anon.post("/api/auth/login", { email: "reset@test.dev", password: "NewPass123" })).status).toBe(200);
    // a token can only be used once
    expect((await anon.post("/api/auth/reset-password", { token, password: "Another123", confirmPassword: "Another123" })).status).toBe(400);
  });

  it("does not reveal whether an email is registered", async () => {
    const anon = await newClient();
    const res = await anon.post("/api/auth/forgot-password", { email: "missing@test.dev" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
  });

  it("verifies an email with a valid token", async () => {
    const anon = await newClient();
    await anon.post("/api/auth/register", registration("verify@test.dev"));
    const [user] = await db.select().from(users).where(eq(users.email, "verify@test.dev"));
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, user.id));
    await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: sha256("verify-token-123"), expiresAt: new Date(Date.now() + 60_000) });
    expect((await anon.post("/api/auth/verify-email", { token: "verify-token-123" })).status).toBe(200);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.emailVerifiedAt).not.toBeNull();
    expect((await anon.post("/api/auth/verify-email", { token: "bad-token-0000" })).status).toBe(400);
  });
});

describe("role-based access control", () => {
  it("students cannot use admin APIs; admins can", async () => {
    const student = await registerAndLogin("s@test.dev");
    expect((await student.get("/api/admin/stats")).status).toBe(403);
    expect((await student.post("/api/admin/opportunities", {})).status).toBe(403);
    const admin = await adminClient();
    expect((await admin.get("/api/admin/stats")).status).toBe(200);
  });
});
