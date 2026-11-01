/**
 * Multi-user isolation: two (or more) people using the same CampusHub URL each get their own
 * account and private data. Every check goes through the HTTP API with real sessions, exactly
 * like browsers would.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { sessions, teamMembers, users } from "../src/db/schema.js";
import { PASSWORD, adminClient, newClient, onboardedStudent, opportunityPayload, registration, resetDb, type Client } from "./helpers.js";

beforeEach(resetDb);

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const idOf = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id;

/** Registers and logs in inside an existing browser (client). */
async function registerIn(client: Client, email: string, fullName: string) {
  expect((await client.post("/api/auth/register", registration(email, { fullName }))).status).toBe(201);
  const login = await client.post("/api/auth/login", { email, password: PASSWORD });
  expect(login.status).toBe(200);
  expect(login.body.user.onboardingCompleted).toBe(false);
  return login.body.user as { id: string };
}

/** Goes through the onboarding wizard step by step, as the web app does. */
async function completeWizard(
  client: Client,
  data: { bio: string; skills: [string, number][]; project?: string; achievement?: string; certification?: string; github?: string; showInDirectory?: boolean },
) {
  expect((await client.patch("/api/profile", { college: "Shared University", course: "B.Tech CSE", semester: 4, department: "CSE", bio: data.bio })).status).toBe(200);
  const skills = await client.put("/api/profile/skills", { skills: data.skills.map(([name, proficiency]) => ({ name, proficiency, experienceMonths: 6 })) });
  expect(skills.status).toBe(200);
  if (data.project) expect((await client.post("/api/profile/projects", { title: data.project, description: `${data.project}: a project description.`, technologies: ["C"] })).status).toBe(201);
  if (data.achievement) expect((await client.post("/api/profile/achievements", { title: data.achievement, achievedOn: "2026-03-01" })).status).toBe(201);
  if (data.certification) expect((await client.post("/api/profile/certifications", { name: data.certification, issuer: "Training Cell" })).status).toBe(201);
  if (data.github) expect((await client.patch("/api/profile", { githubUrl: data.github })).status).toBe(200);
  const done = await client.post("/api/profile/onboarding/complete", { showInDirectory: data.showInDirectory ?? false });
  expect(done.status).toBe(200);
  expect(done.body.user.onboardingCompleted).toBe(true);
}

/** Everything a student can read about "their" data, one JSON string per endpoint (for leak checks). */
async function everythingVisibleTo(client: Client) {
  const urls = ["/api/auth/me", "/api/profile", "/api/dashboard", "/api/applications", "/api/notifications", "/api/teams", "/api/career", "/api/career/goals/history", "/api/assistant", "/api/students", "/api/opportunities"];
  const bodies = new Map<string, string>();
  for (const url of urls) {
    const res = await client.get(url);
    expect(res.status, url).toBe(200);
    bodies.set(url, JSON.stringify(res.body));
  }
  return {
    contains: (text: string) => [...bodies.values()].some((b) => b.includes(text)),
    /** Fails with the endpoint that leaked, if any response contains one of the secrets. */
    expectNone(secrets: string[], who: string) {
      for (const secret of secrets) {
        const leakedBy = [...bodies].find(([, body]) => body.includes(secret))?.[0];
        expect(leakedBy, `${who} must not see "${secret}"`).toBeUndefined();
      }
    },
  };
}

describe("two people, one URL: separate accounts and private data", () => {
  it("A's data is invisible to B, B's to A, and A's data is intact after logging back in", async () => {
    const admin = await adminClient();
    const opp = (await admin.post("/api/admin/opportunities", opportunityPayload({ requiredSkills: ["C++", "DSA"] }))).body.opportunity;

    // ---- User A, in browser 1
    const browser = await newClient();
    const a = await registerIn(browser, "alice@test.dev", "Alice Anand");
    await completeWizard(browser, {
      bio: "ALICE-BIO: compilers and systems programming enthusiast.",
      skills: [["C++", 90], ["DSA", 80], ["Zig", 70]],
      project: "ALICE-PROJECT Compiler",
      achievement: "ALICE-ACHIEVEMENT Hackathon win",
      certification: "ALICE-CERT Cloud Basics",
      github: "github.com/alice-private",
    });
    expect((await browser.post(`/api/opportunities/${opp.id}/apply`, { coverNote: "ALICE-COVER-NOTE" })).status).toBe(201);
    const team = (await browser.post("/api/teams", { name: "ALICE-TEAM", projectTitle: "ALICE-TEAM project", maxSize: 4, requiredSkills: ["React"] })).body.team;
    expect(team.members).toHaveLength(1);
    expect((await everythingVisibleTo(browser)).contains("ALICE-PROJECT")).toBe(true);
    expect((await browser.post("/api/auth/logout")).status).toBe(200);
    expect((await browser.get("/api/profile")).status).toBe(401);

    // ---- User B, same browser after logout
    const b = await registerIn(browser, "bob@test.dev", "Bob Bhat");
    expect(b.id).not.toBe(a.id);
    // B starts empty: no projects, achievements, certifications, applications or teams
    const fresh = (await browser.get("/api/profile")).body;
    expect(fresh.projects).toEqual([]);
    expect(fresh.achievements).toEqual([]);
    expect(fresh.certifications).toEqual([]);
    expect(fresh.skills).toEqual([]);
    expect(fresh.account.email).toBe("bob@test.dev");
    await completeWizard(browser, { bio: "BOB-BIO: designer who also writes Smalltalk.", skills: [["Smalltalk", 85]], project: "BOB-PROJECT Portfolio" });

    const bobSees = await everythingVisibleTo(browser);
    bobSees.expectNone(["alice@test.dev", "Alice Anand", "ALICE-BIO", "ALICE-PROJECT", "ALICE-ACHIEVEMENT", "ALICE-CERT", "ALICE-COVER-NOTE", "ALICE-TEAM", "alice-private", "Zig", a.id], "B");
    expect(bobSees.contains("BOB-PROJECT")).toBe(true);
    expect((await browser.get("/api/applications")).body.applications).toEqual([]);
    expect((await browser.get("/api/teams")).body.teams).toEqual([]);
    // shared content is shared: B sees the same opportunity, with B's own (0%) match
    const bOpp = (await browser.get(`/api/opportunities/${opp.id}`)).body.opportunity;
    expect(bOpp.match.percentage).toBe(0);
    expect(bOpp.application).toBeNull();
    expect((await browser.post("/api/auth/logout")).status).toBe(200);

    // ---- A logs back in: everything is still there, nothing of B's
    expect((await browser.post("/api/auth/login", { email: "alice@test.dev", password: PASSWORD })).status).toBe(200);
    const back = (await browser.get("/api/profile")).body;
    expect(back.account.email).toBe("alice@test.dev");
    expect(back.profile.bio).toContain("ALICE-BIO");
    expect(back.profile.githubUrl).toBe("https://github.com/alice-private");
    expect(back.skills.map((s: { name: string }) => s.name).sort()).toEqual(["C++", "DSA", "Zig"]);
    expect(back.projects.map((p: { title: string }) => p.title)).toEqual(["ALICE-PROJECT Compiler"]);
    expect(back.achievements).toHaveLength(1);
    expect(back.certifications).toHaveLength(1);
    const apps = (await browser.get("/api/applications")).body.applications;
    expect(apps).toHaveLength(1);
    expect(apps[0].coverNote).toBe("ALICE-COVER-NOTE");
    expect((await browser.get("/api/teams")).body.teams.map((t: { name: string }) => t.name)).toEqual(["ALICE-TEAM"]);
    (await everythingVisibleTo(browser)).expectNone(["bob@test.dev", "BOB-BIO", "BOB-PROJECT", "Smalltalk", b.id], "A");

    // ---- the administrator still sees both students' applications
    const adminApps = (await admin.get("/api/admin/applications")).body.applications;
    expect(adminApps.some((x: { student?: { email?: string }; email?: string }) => JSON.stringify(x).includes("alice@test.dev"))).toBe(true);
  });

  it("two browsers at the same time stay separate", async () => {
    const alice = await onboardedStudent("alice@test.dev", [["C++", 90]], "Alice", { showInDirectory: false });
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 90]], "Bob", { showInDirectory: false });
    await alice.post("/api/profile/projects", { title: "Alice only", description: "Visible to Alice only." });
    await bob.post("/api/profile/projects", { title: "Bob only", description: "Visible to Bob only." });
    expect((await alice.get("/api/profile")).body.projects.map((p: { title: string }) => p.title)).toEqual(["Alice only"]);
    expect((await bob.get("/api/profile")).body.projects.map((p: { title: string }) => p.title)).toEqual(["Bob only"]);
    expect((await alice.get("/api/auth/me")).body.user.email).toBe("alice@test.dev");
    expect((await bob.get("/api/auth/me")).body.user.email).toBe("bob@test.dev");
  });
});

describe("ID tampering: the server ignores ids that belong to someone else", () => {
  async function aliceWithEverything() {
    const admin = await adminClient();
    const opp = (await admin.post("/api/admin/opportunities", opportunityPayload())).body.opportunity;
    const alice = await onboardedStudent("alice@test.dev", [["C++", 90], ["DSA", 80], ["OOP", 70]], "Alice");
    const project = (await alice.post("/api/profile/projects", { title: "Alice project", description: "Only Alice may change this." })).body.project;
    const achievement = (await alice.post("/api/profile/achievements", { title: "Alice achievement" })).body.achievement;
    const certification = (await alice.post("/api/profile/certifications", { name: "Alice cert", issuer: "Training Cell" })).body.certification;
    const skill = (await alice.get("/api/profile/skills")).body.skills[0];
    const application = (await alice.post(`/api/opportunities/${opp.id}/apply`, {})).body.application;
    const notification = (await alice.get("/api/notifications")).body.notifications[0];
    const goal = (await alice.get("/api/career")).body.goals[0];
    const team = (await alice.post("/api/teams", { name: "Alice team", projectTitle: "Secret", maxSize: 4 })).body.team;
    return { admin, alice, project, achievement, certification, skill, application, notification, goal, team, aliceId: await idOf("alice@test.dev") };
  }

  it("B cannot read, change or delete any of A's records", async () => {
    const t = await aliceWithEverything();
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 80]], "Bob");
    const attempts: [string, () => Promise<{ status: number }>][] = [
      ["edit project", () => bob.put(`/api/profile/projects/${t.project.id}`, { title: "Hacked", description: "Bob was here......" })],
      ["delete project", () => bob.del(`/api/profile/projects/${t.project.id}`)],
      ["project image", () => bob.upload(`/api/profile/projects/${t.project.id}/image`, "image", PNG, "x.png", "image/png")],
      ["edit achievement", () => bob.put(`/api/profile/achievements/${t.achievement.id}`, { title: "Hacked" })],
      ["delete achievement", () => bob.del(`/api/profile/achievements/${t.achievement.id}`)],
      ["edit certification", () => bob.put(`/api/profile/certifications/${t.certification.id}`, { name: "Hacked", issuer: "Bob" })],
      ["delete certification", () => bob.del(`/api/profile/certifications/${t.certification.id}`)],
      ["edit skill", () => bob.put(`/api/profile/skills/${t.skill.id}`, { proficiency: 1 })],
      ["delete skill", () => bob.del(`/api/profile/skills/${t.skill.id}`)],
      ["read application", () => bob.get(`/api/applications/${t.application.id}`)],
      ["withdraw application", () => bob.post(`/api/applications/${t.application.id}/withdraw`)],
      ["read notification", () => bob.post(`/api/notifications/${t.notification.id}/read`)],
      ["delete notification", () => bob.del(`/api/notifications/${t.notification.id}`)],
      ["complete goal", () => bob.patch(`/api/career/goals/${t.goal.id}`, { status: "DONE" })],
      ["view team", () => bob.get(`/api/teams/${t.team.id}`)],
      ["team suggestions", () => bob.get(`/api/teams/${t.team.id}/suggestions`)],
      ["invite to team", () => bob.post(`/api/teams/${t.team.id}/invitations`, { email: "bob@test.dev" })],
      ["edit team", () => bob.put(`/api/teams/${t.team.id}`, { name: "Hacked", projectTitle: "Hacked", maxSize: 4 })],
      ["delete team", () => bob.del(`/api/teams/${t.team.id}`)],
      ["leave team", () => bob.post(`/api/teams/${t.team.id}/leave`)],
      ["remove owner", () => bob.del(`/api/teams/${t.team.id}/members/${t.aliceId}`)],
      ["set role", () => bob.put(`/api/teams/${t.team.id}/members/me`, { roleArea: "Frontend" })],
      ["read full profile", () => bob.get(`/api/students/${t.aliceId}`)],
    ];
    for (const [label, call] of attempts) {
      expect([403, 404], label).toContain((await call()).status);
    }

    // nothing of Alice's changed
    const after = (await t.alice.get("/api/profile")).body;
    expect(after.projects[0].title).toBe("Alice project");
    expect(after.achievements[0].title).toBe("Alice achievement");
    expect(after.certifications[0].name).toBe("Alice cert");
    expect(after.skills.find((s: { id: number }) => s.id === t.skill.id).proficiency).toBe(90);
    expect((await t.alice.get(`/api/applications/${t.application.id}`)).body.application.status).toBe("APPLIED");
    expect((await t.alice.get(`/api/teams/${t.team.id}`)).body.team.name).toBe("Alice team");
    const notes = (await t.alice.get("/api/notifications")).body.notifications;
    expect(notes.find((n: { id: string }) => n.id === t.notification.id).read).toBe(false);
  });

  it("user ids in request bodies are ignored: records always belong to the logged-in user", async () => {
    const alice = await onboardedStudent("alice@test.dev", [["C++", 90]], "Alice");
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 80]], "Bob");
    const aliceId = await idOf("alice@test.dev");
    await bob.post("/api/profile/projects", { title: "Planted", description: "Bob tries to plant this on Alice.", userId: aliceId });
    await bob.patch("/api/profile", { userId: aliceId, fullName: "Bob Renamed" });
    await bob.put("/api/profile/skills", { userId: aliceId, skills: [{ name: "Planted Skill", proficiency: 50 }] });
    const aliceProfile = (await alice.get("/api/profile")).body;
    expect(aliceProfile.projects).toEqual([]);
    expect(aliceProfile.account.fullName).toBe("Alice");
    expect(aliceProfile.skills.map((s: { name: string }) => s.name)).toEqual(["C++"]);
    const bobProfile = (await bob.get("/api/profile")).body;
    expect(bobProfile.projects[0].title).toBe("Planted");
    expect(bobProfile.account.fullName).toBe("Bob Renamed");
  });

  it("students cannot use administrator APIs, even with a guessed id", async () => {
    const t = await aliceWithEverything();
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 80]], "Bob");
    for (const call of [
      () => bob.get("/api/admin/applications"),
      () => bob.get(`/api/admin/students/${t.aliceId}`),
      () => bob.patch(`/api/admin/applications/${t.application.id}/status`, { status: "SELECTED" }),
      () => bob.patch(`/api/admin/students/${t.aliceId}`, { isActive: false }),
    ]) {
      expect((await call()).status).toBe(403);
    }
    expect((await t.admin.get(`/api/admin/students/${t.aliceId}`)).status).toBe(200);
  });
});

describe("Group Up with real accounts", () => {
  it("A creates a team, invites B by email, B accepts, and the analysis uses B's real, live skills", async () => {
    const alice = await onboardedStudent("alice@test.dev", [["React", 85], ["Node.js", 80]], "Alice", { showInDirectory: false });
    const bob = await onboardedStudent("bob@test.dev", [["PostgreSQL", 80]], "Bob", { showInDirectory: false });
    const team = (await alice.post("/api/teams", { name: "Builders", projectTitle: "Campus app", maxSize: 4, requiredSkills: ["React", "PostgreSQL", "Selenium"] })).body.team;
    expect(team.analysis.requiredSkillCoverage.percentage).toBe(33);

    const invite = await alice.post(`/api/teams/${team.id}/invitations`, { email: "BOB@test.dev", message: "Join us!" });
    expect(invite.status).toBe(201);
    expect(invite.body.invitation.inviteeName).toBe("Bob");
    expect((await alice.post(`/api/teams/${team.id}/invitations`, { email: "bob@test.dev" })).status).toBe(409);

    const inbox = (await bob.get("/api/teams")).body;
    expect(inbox.teams).toEqual([]);
    expect(inbox.invitations).toHaveLength(1);
    expect((await bob.get("/api/notifications")).body.notifications.some((n: { title: string }) => n.title === "Team invitation")).toBe(true);
    // the invitee may preview the team before accepting
    expect((await bob.get(`/api/teams/${team.id}`)).body.isMember).toBe(false);

    const accepted = await bob.post(`/api/invitations/${inbox.invitations[0].id}/accept`);
    expect(accepted.status).toBe(200);
    const members = accepted.body.team.members.map((m: { fullName: string }) => m.fullName).sort();
    expect(members).toEqual(["Alice", "Bob"]);
    expect(accepted.body.team.analysis.requiredSkillCoverage.percentage).toBe(67);
    expect(accepted.body.team.members.find((m: { fullName: string }) => m.fullName === "Bob").skills.map((s: { name: string }) => s.name)).toEqual(["PostgreSQL"]);
    // accepting twice does nothing
    expect((await bob.post(`/api/invitations/${inbox.invitations[0].id}/accept`)).status).toBe(404);

    // B learns Selenium on B's own profile → A's team analysis updates (no copied data)
    await bob.post("/api/profile/skills", { name: "Selenium", proficiency: 70 });
    const live = (await alice.get(`/api/teams/${team.id}`)).body.team;
    expect(live.analysis.requiredSkillCoverage.percentage).toBe(100);
    expect((await bob.get("/api/teams")).body.teams.map((t: { name: string }) => t.name)).toEqual(["Builders"]);
    expect((await alice.get("/api/notifications")).body.notifications.some((n: { title: string }) => n.title === "Invitation accepted")).toBe(true);
    // one membership row per real account
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id))).toHaveLength(2);
  });

  it("only students who opt in appear in teammate search, with a minimal card", async () => {
    const owner = await onboardedStudent("owner@test.dev", [["React", 80]], "Owner");
    await onboardedStudent("hidden@test.dev", [["Figma", 90]], "Hidden Student", { showInDirectory: false });
    const shown = await onboardedStudent("shown@test.dev", [["Selenium", 90]], "Shown Student", { showInDirectory: true, bio: "SHOWN-BIO should never be listed." });
    await shown.post("/api/profile/projects", { title: "SHOWN-PROJECT", description: "Projects are never listed." });
    const team = (await owner.post("/api/teams", { name: "Search", projectTitle: "Find people", maxSize: 5 })).body.team;

    const suggestions = (await owner.get(`/api/teams/${team.id}/suggestions`)).body.candidates;
    expect(suggestions.map((c: { fullName: string }) => c.fullName)).toEqual(["Shown Student"]);
    const directory = (await owner.get("/api/students")).body.students;
    expect(directory.map((c: { fullName: string }) => c.fullName)).toEqual(["Shown Student"]);
    const listed = JSON.stringify([suggestions, directory]);
    for (const secret of ["shown@test.dev", "SHOWN-BIO", "SHOWN-PROJECT", "githubUrl", "email"]) expect(listed).not.toContain(secret);

    // hidden students cannot be invited by id, only by email
    const hiddenId = await idOf("hidden@test.dev");
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: hiddenId })).status).toBe(404);
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { email: "hidden@test.dev" })).status).toBe(201);

    // a student can switch visibility themselves
    await shown.patch("/api/profile", { showInDirectory: false });
    expect((await owner.get("/api/students")).body.students).toEqual([]);
  });

  it("invitations by email only reach finished student accounts", async () => {
    const owner = await onboardedStudent("owner@test.dev", [["React", 80]], "Owner");
    const team = (await owner.post("/api/teams", { name: "Mail", projectTitle: "Invites", maxSize: 5 })).body.team;
    await adminClient("admin@test.dev");
    const pending = await newClient();
    await pending.post("/api/auth/register", registration("pending@test.dev")); // registered, not onboarded
    for (const email of ["nobody@test.dev", "admin@test.dev", "pending@test.dev"]) {
      const res = await owner.post(`/api/teams/${team.id}/invitations`, { email });
      expect(res.status, email).toBe(404);
      expect(res.body.error.message).toMatch(/finished setting up/);
    }
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { email: "owner@test.dev" })).status).toBe(400);
    expect((await owner.post(`/api/teams/${team.id}/invitations`, {})).status).toBe(400);
  });
});

describe("team size limits hold under concurrent requests", () => {
  it("two people accepting at the same moment cannot overfill a team", async () => {
    const owner = await onboardedStudent("owner@test.dev", [["React", 80]], "Owner");
    const b = await onboardedStudent("b@test.dev", [["SQL", 80]], "Bea");
    const c = await onboardedStudent("c@test.dev", [["Figma", 80]], "Cal");
    const team = (await owner.post("/api/teams", { name: "Race", projectTitle: "Race", maxSize: 3 })).body.team;
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { email: "b@test.dev" })).status).toBe(201);
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { email: "c@test.dev" })).status).toBe(201);
    // the owner shrinks the team after inviting both (allowed: only 1 member so far)
    expect((await owner.put(`/api/teams/${team.id}`, { name: "Race", projectTitle: "Race", maxSize: 2 })).status).toBe(200);

    const bInvite = (await b.get("/api/teams")).body.invitations[0];
    const cInvite = (await c.get("/api/teams")).body.invitations[0];
    const results = await Promise.all([b.post(`/api/invitations/${bInvite.id}/accept`), c.post(`/api/invitations/${cInvite.id}/accept`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id))).toHaveLength(2);
  });

  it("parallel invitations cannot exceed the free seats", async () => {
    const owner = await onboardedStudent("owner@test.dev", [["React", 80]], "Owner");
    await onboardedStudent("b@test.dev", [["SQL", 80]], "Bea");
    await onboardedStudent("c@test.dev", [["Figma", 80]], "Cal");
    const team = (await owner.post("/api/teams", { name: "Seats", projectTitle: "Seats", maxSize: 2 })).body.team;
    const results = await Promise.all([
      owner.post(`/api/teams/${team.id}/invitations`, { email: "b@test.dev" }),
      owner.post(`/api/teams/${team.id}/invitations`, { email: "c@test.dev" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  });
});

describe("onboarding: required vs optional steps", () => {
  it("each step saves on its own, partial updates keep other fields, and only basics + 1 skill are required", async () => {
    const browser = await newClient();
    await registerIn(browser, "new@test.dev", "New Student");
    expect((await browser.get("/api/dashboard")).status).toBe(403); // not finished yet

    const early = await browser.post("/api/profile/onboarding/complete", {});
    expect(early.status).toBe(400);
    expect(early.body.error.details.map((d: { path: string }) => d.path)).toEqual(["skills"]);

    await browser.patch("/api/profile", { githubUrl: "github.com/new-student" });
    await browser.patch("/api/profile", { bio: "Short bio" }); // must not erase the GitHub link
    const p = (await browser.get("/api/profile")).body.profile;
    expect(p.githubUrl).toBe("https://github.com/new-student");
    expect(p.bio).toBe("Short bio");
    expect(p.showInDirectory).toBe(false); // private by default
    expect((await browser.patch("/api/profile", { semester: 40 })).status).toBe(400);
    expect((await browser.patch("/api/profile", {})).status).toBe(400);

    await browser.put("/api/profile/skills", { skills: [{ name: "Python", proficiency: 60 }] });
    const done = await browser.post("/api/profile/onboarding/complete", {});
    expect(done.status).toBe(200);
    expect((await browser.get("/api/dashboard")).status).toBe(200);
    // finishing again is harmless
    expect((await browser.post("/api/profile/onboarding/complete", {})).status).toBe(200);
  });
});

describe("sessions, caching, uploads and account switching", () => {
  it("logging in on a browser that is still signed in ends the previous session", async () => {
    const browser = await newClient();
    await registerIn(browser, "first@test.dev", "First");
    const firstId = await idOf("first@test.dev");
    expect(await db.select().from(sessions).where(eq(sessions.userId, firstId))).toHaveLength(1);
    await browser.post("/api/auth/register", registration("second@test.dev"));
    expect((await browser.post("/api/auth/login", { email: "second@test.dev", password: PASSWORD })).status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, firstId))).toHaveLength(0);
    expect((await browser.get("/api/auth/me")).body.user.email).toBe("second@test.dev");
  });

  it("a tab still showing account A cannot act on account B (X-CampusHub-User guard)", async () => {
    const browser = await newClient();
    const a = await registerIn(browser, "a@test.dev", "Ann");
    await browser.post("/api/auth/logout");
    const b = await registerIn(browser, "b@test.dev", "Ben");
    const stale = await browser.agent.get("/api/profile").set("X-CampusHub-User", a.id);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("ACCOUNT_CHANGED");
    expect((await browser.agent.get("/api/profile").set("X-CampusHub-User", b.id)).status).toBe(200);
    // logged out: the header changes nothing, the normal 401 applies
    await browser.post("/api/auth/logout");
    expect((await browser.agent.get("/api/profile").set("X-CampusHub-User", a.id)).status).toBe(401);
  });

  it("API responses are never cached, and a reload keeps the user signed in", async () => {
    const student = await onboardedStudent("cache@test.dev");
    const res = await student.get("/api/profile");
    expect(res.headers["cache-control"]).toBe("no-store");
    const session = await student.get("/api/auth/session"); // what the app calls after a page refresh
    expect(session.body.user.email).toBe("cache@test.dev");
  });

  it("logout rotates the CSRF token", async () => {
    const browser = await newClient();
    await registerIn(browser, "csrf@test.dev", "Csrf");
    const before = (await browser.get("/api/auth/csrf")).body.csrfToken;
    const out = await browser.post("/api/auth/logout");
    expect(typeof out.body.csrfToken).toBe("string");
    expect(out.body.csrfToken).not.toBe(before);
  });

  it("uploaded images need a session; project screenshots are visible only to their owner and admins", async () => {
    const alice = await onboardedStudent("alice@test.dev", [["C++", 90]], "Alice");
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 80]], "Bob");
    const admin = await adminClient();
    const avatar = (await alice.upload("/api/profile/avatar", "image", PNG, "me.png", "image/png")).body.avatarUrl as string;
    const project = (await alice.post("/api/profile/projects", { title: "Shot", description: "Has a screenshot." })).body.project;
    const shot = (await alice.upload(`/api/profile/projects/${project.id}/image`, "image", PNG, "s.png", "image/png")).body.imageUrl as string;

    const anonymous = await newClient();
    expect((await anonymous.get(avatar)).status).toBe(401);
    expect((await anonymous.get(shot)).status).toBe(401);
    expect((await alice.get(avatar)).status).toBe(200);
    expect((await bob.get(avatar)).status).toBe(200); // pictures appear on team cards
    expect((await alice.get(shot)).status).toBe(200);
    expect((await bob.get(shot)).status).toBe(404);
    expect((await admin.get(shot)).status).toBe(200);
    // path tricks do not bypass the owner check
    const file = shot.split("/").pop();
    expect((await bob.get(`/uploads/avatars/..%2Fprojects%2F${file}`)).status).toBe(404);
    expect((await bob.get(`/uploads/avatars/../projects/${file}`)).status).toBe(404);
    expect((await alice.get(avatar)).headers["cache-control"]).toContain("private");
  });

  it("rejects passwords longer than bcrypt's 72-byte limit", async () => {
    const client = await newClient();
    const emoji = `Aa1${"😀".repeat(20)}`; // well under 72 characters, but 83 bytes
    const res = await client.post("/api/auth/register", registration("long@test.dev", { password: emoji, confirmPassword: emoji }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("password");
  });
});

describe("rate limits are per account, not per shared network", () => {
  it("one account being guessed does not lock out classmates on the same IP", async () => {
    const limitedApp = createApp({ rateLimit: true });
    const setup = await newClient(limitedApp);
    await setup.post("/api/auth/register", registration("victim@test.dev"));
    await setup.post("/api/auth/register", registration("classmate@test.dev"));

    const attacker = await newClient(limitedApp);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await attacker.post("/api/auth/login", { email: "victim@test.dev", password: "Wrong123A" })).status;
    expect(last).toBe(429);
    // same IP, different account: still works
    const classmate = await newClient(limitedApp);
    expect((await classmate.post("/api/auth/login", { email: "classmate@test.dev", password: PASSWORD })).status).toBe(200);
  });
});

describe("skill autocomplete does not reveal one person's custom skill names", () => {
  it("suggests opportunity skills, your own skills and skills at least two students share", async () => {
    const admin = await adminClient();
    await admin.post("/api/admin/opportunities", opportunityPayload({ requiredSkills: ["Kubernetes"] }));
    const alice = await onboardedStudent("alice@test.dev", [["Alicelang", 70]], "Alice");
    const bob = await onboardedStudent("bob@test.dev", [["Figma", 80]], "Bob");
    const names = async (c: Client, q: string) => (await c.get(`/api/skills?q=${q}`)).body.skills.map((s: { name: string }) => s.name);
    expect(await names(alice, "Alicel")).toEqual(["Alicelang"]);
    expect(await names(bob, "Alicel")).toEqual([]);
    expect(await names(bob, "Kube")).toEqual(["Kubernetes"]);
    await onboardedStudent("cara@test.dev", [["Alicelang", 50]], "Cara");
    expect(await names(bob, "Alicel")).toEqual(["Alicelang"]);
  });
});
