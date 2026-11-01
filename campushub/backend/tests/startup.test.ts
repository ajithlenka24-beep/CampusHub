import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { env } from "../src/config/env.js";
import { db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { ensureBootstrapAdmin } from "../src/services/startup.js";
import { PASSWORD, newClient, registration, resetDb } from "./helpers.js";

beforeEach(resetDb);
const saved = { ADMIN_EMAIL: env.ADMIN_EMAIL, ADMIN_PASSWORD: env.ADMIN_PASSWORD, ADMIN_NAME: env.ADMIN_NAME };
afterEach(() => Object.assign(env, saved));

describe("first administrator from ADMIN_EMAIL / ADMIN_PASSWORD", () => {
  it("creates the administrator once, who can then log in", async () => {
    Object.assign(env, { ADMIN_EMAIL: "boss@test.dev", ADMIN_PASSWORD: "Admin12345", ADMIN_NAME: "Placement Cell" });
    await ensureBootstrapAdmin();
    await ensureBootstrapAdmin(); // second start: nothing happens
    const rows = await db.select().from(users).where(eq(users.email, "boss@test.dev"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("ADMIN");
    const client = await newClient();
    const login = await client.post("/api/auth/login", { email: "boss@test.dev", password: "Admin12345" });
    expect(login.body.user.role).toBe("ADMIN");
    expect((await client.get("/api/admin/stats")).status).toBe(200);
  });

  it("never promotes an existing student account and ignores weak passwords", async () => {
    const student = await newClient();
    await student.post("/api/auth/register", registration("taken@test.dev"));
    Object.assign(env, { ADMIN_EMAIL: "taken@test.dev", ADMIN_PASSWORD: "Admin12345" });
    await ensureBootstrapAdmin();
    const [taken] = await db.select().from(users).where(eq(users.email, "taken@test.dev"));
    expect(taken.role).toBe("STUDENT");
    expect((await student.post("/api/auth/login", { email: "taken@test.dev", password: PASSWORD })).status).toBe(200);

    Object.assign(env, { ADMIN_EMAIL: "weak@test.dev", ADMIN_PASSWORD: "short" });
    await ensureBootstrapAdmin();
    expect(await db.select().from(users).where(eq(users.email, "weak@test.dev"))).toHaveLength(0);
  });
});
