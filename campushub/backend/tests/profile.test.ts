import { beforeEach, describe, expect, it } from "vitest";
import { onboardedStudent, onboardingPayload, registerAndLogin, resetDb } from "./helpers.js";

beforeEach(resetDb);

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

describe("onboarding", () => {
  it("blocks student features until onboarding is complete", async () => {
    const client = await registerAndLogin("new@test.dev");
    const me = await client.get("/api/auth/me");
    expect(me.body.user.onboardingCompleted).toBe(false);
    const dash = await client.get("/api/dashboard");
    expect(dash.status).toBe(403);
    expect(dash.body.error.code).toBe("ONBOARDING_REQUIRED");
  });

  it("requires at least 3 skills and an introduction", async () => {
    const client = await registerAndLogin("new@test.dev");
    const res = await client.post("/api/profile/onboarding", onboardingPayload([["C++", 80]]));
    expect(res.status).toBe(400);
    const ok = await client.post("/api/profile/onboarding", onboardingPayload([["C++", 80], ["DSA", 70], ["SQL", 60]]));
    expect(ok.status).toBe(200);
    expect(ok.body.user.onboardingCompleted).toBe(true);
    expect((await client.get("/api/dashboard")).status).toBe(200);
  });
});

describe("profile CRUD", () => {
  it("adds, edits and deletes skills, and resolves aliases", async () => {
    const client = await onboardedStudent("p@test.dev");
    const added = await client.post("/api/profile/skills", { name: "js", proficiency: 55 });
    expect(added.status).toBe(201);
    expect(added.body.skill.name).toBe("JavaScript");
    const dup = await client.post("/api/profile/skills", { name: "JavaScript", proficiency: 60 });
    expect(dup.status).toBe(409);
    const edited = await client.put(`/api/profile/skills/${added.body.skill.id}`, { proficiency: 75, experienceMonths: 4 });
    expect(edited.body.skill.proficiency).toBe(75);
    expect((await client.del(`/api/profile/skills/${added.body.skill.id}`)).status).toBe(204);
    const list = await client.get("/api/profile/skills");
    expect(list.body.skills.map((s: { name: string }) => s.name)).not.toContain("JavaScript");
  });

  it("updates completion dynamically", async () => {
    const client = await onboardedStudent("p@test.dev");
    const before = (await client.get("/api/profile")).body.completion.percentage;
    await client.post("/api/profile/projects", { title: "CampusHub", description: "A student platform built with React and Node.", technologies: ["React"] });
    const after = (await client.get("/api/profile")).body.completion.percentage;
    expect(after).toBe(before + 20);
  });

  it("rejects unsafe links", async () => {
    const client = await onboardedStudent("p@test.dev");
    const res = await client.post("/api/profile/projects", { title: "X project", description: "Some description here", githubUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("students cannot modify another student's records", async () => {
    const alice = await onboardedStudent("alice@test.dev");
    const bob = await onboardedStudent("bob@test.dev");
    const project = (await alice.post("/api/profile/projects", { title: "Alice project", description: "Only Alice may edit this." })).body.project;
    expect((await bob.put(`/api/profile/projects/${project.id}`, { title: "Hacked", description: "Bob was here......" })).status).toBe(404);
    expect((await bob.del(`/api/profile/projects/${project.id}`)).status).toBe(404);
    const aliceSkill = (await alice.get("/api/profile/skills")).body.skills[0];
    expect((await bob.del(`/api/profile/skills/${aliceSkill.id}`)).status).toBe(404);
    expect((await alice.get("/api/profile")).body.projects[0].title).toBe("Alice project");
  });

  it("accepts real images and rejects disguised files", async () => {
    const client = await onboardedStudent("p@test.dev");
    const ok = await client.upload("/api/profile/avatar", "image", PNG, "me.png", "image/png");
    expect(ok.status).toBe(200);
    expect(ok.body.avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    const fake = await client.upload("/api/profile/avatar", "image", Buffer.from("<script>alert(1)</script>"), "evil.png", "image/png");
    expect(fake.status).toBe(400);
    const wrongType = await client.upload("/api/profile/avatar", "image", Buffer.from("hello"), "a.txt", "text/plain");
    expect(wrongType.status).toBe(400);
  });

  it("CRUD for achievements and certifications", async () => {
    const client = await onboardedStudent("p@test.dev");
    const a = await client.post("/api/profile/achievements", { title: "Hackathon winner", achievedOn: "2026-03-01" });
    expect(a.status).toBe(201);
    const c = await client.post("/api/profile/certifications", { name: "Cloud Basics", issuer: "Training Cell", issueDate: "2026-01-10" });
    expect(c.status).toBe(201);
    expect((await client.post("/api/profile/certifications", { name: "Bad date", issuer: "X org", issueDate: "10/01/2026" })).status).toBe(400);
    expect((await client.put(`/api/profile/certifications/${c.body.certification.id}`, { name: "Cloud Basics II", issuer: "Training Cell" })).status).toBe(200);
    expect((await client.del(`/api/profile/achievements/${a.body.achievement.id}`)).status).toBe(204);
  });
});
