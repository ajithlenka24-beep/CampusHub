import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { studentProfiles, users } from "../src/db/schema.js";

export const app: Express = createApp({ rateLimit: false });
export const PASSWORD = "Str0ngPass!";

export async function resetDb() {
  await db.execute(sql`TRUNCATE users, skills, opportunities, activity_logs RESTART IDENTITY CASCADE`);
}

/** A logged-out browser-like client that sends the CSRF header automatically. */
export async function newClient(target: Express = app) {
  const agent = request.agent(target);
  const res = await agent.get("/api/auth/csrf");
  let csrf: string = res.body.csrfToken;
  const refreshCsrf = (r: request.Response) => {
    const cookies = ([] as string[]).concat(r.headers["set-cookie"] ?? []);
    const c = cookies.find((x) => x.startsWith("ch_csrf="));
    if (c) csrf = decodeURIComponent(c.split(";")[0].split("=")[1]);
    return r;
  };
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: async (url: string, body?: object) => refreshCsrf(await agent.post(url).set("x-csrf-token", csrf).send(body ?? {})),
    put: async (url: string, body?: object) => refreshCsrf(await agent.put(url).set("x-csrf-token", csrf).send(body ?? {})),
    patch: async (url: string, body?: object) => refreshCsrf(await agent.patch(url).set("x-csrf-token", csrf).send(body ?? {})),
    del: async (url: string) => refreshCsrf(await agent.delete(url).set("x-csrf-token", csrf)),
    upload: (url: string, field: string, buffer: Buffer, filename: string, contentType: string) =>
      agent.post(url).set("x-csrf-token", csrf).attach(field, buffer, { filename, contentType }),
  };
}
export type Client = Awaited<ReturnType<typeof newClient>>;

export const registration = (email: string, extra: Record<string, unknown> = {}) => ({
  fullName: "Test Student",
  email,
  password: PASSWORD,
  confirmPassword: PASSWORD,
  college: "Test University",
  course: "B.Tech CSE",
  semester: 3,
  acceptTerms: true,
  ...extra,
});

export async function registerAndLogin(email: string, extra: Record<string, unknown> = {}) {
  const client = await newClient();
  const reg = await client.post("/api/auth/register", registration(email, extra));
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
  const login = await client.post("/api/auth/login", { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return client;
}

export const onboardingPayload = (skills: [string, number][], extra: Record<string, unknown> = {}) => ({
  college: "Test University",
  course: "B.Tech CSE",
  department: "Computer Science",
  semester: 3,
  bio: "I am a computer science student who likes building useful software.",
  githubUrl: "github.com/test-student",
  // opted in to teammate search (the default for new accounts is private)
  showInDirectory: true,
  skills: skills.map(([name, proficiency]) => ({ name, proficiency, experienceMonths: 6 })),
  ...extra,
});

export async function onboardedStudent(
  email: string,
  skills: [string, number][] = [["C++", 90], ["DSA", 85], ["Python", 70]],
  name = "Test Student",
  extra: Record<string, unknown> = {},
) {
  const client = await registerAndLogin(email, { fullName: name });
  const res = await client.post("/api/profile/onboarding", onboardingPayload(skills, extra));
  if (res.status !== 200) throw new Error(`onboarding failed: ${JSON.stringify(res.body)}`);
  return client;
}

export async function adminClient(email = "admin@test.dev") {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const [u] = await db.insert(users).values({ email, fullName: "Admin", passwordHash, role: "ADMIN", onboardingCompleted: true, emailVerifiedAt: new Date() }).returning();
  await db.insert(studentProfiles).values({ userId: u.id });
  const client = await newClient();
  const res = await client.post("/api/auth/login", { email, password: PASSWORD });
  if (res.status !== 200) throw new Error("admin login failed");
  return client;
}

export const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export const opportunityPayload = (extra: Record<string, unknown> = {}) => ({
  title: "C++ Developer Internship",
  organization: "TechNova",
  description: "Build high-performance C++ services with the systems team.",
  type: "INTERNSHIP",
  eligibility: "Semester 3+",
  location: "Bengaluru",
  workMode: "HYBRID",
  deadline: futureDate(10),
  requiredSkills: ["C++", "DSA", "OOP", "Git"],
  isPublished: true,
  ...extra,
});
