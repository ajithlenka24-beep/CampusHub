import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { onboardedStudent, resetDb } from "./helpers.js";

beforeEach(resetDb);

const idOf = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id;

async function setup(maxSize = 3) {
  const owner = await onboardedStudent("owner@test.dev", [["C++", 90], ["DSA", 85], ["SQL", 70]], "Owner");
  const tester = await onboardedStudent("tester@test.dev", [["Selenium", 80], ["Jest", 70], ["Manual Testing", 85]], "Tess Tester");
  const designer = await onboardedStudent("designer@test.dev", [["Figma", 90], ["UI Design", 80], ["Prototyping", 70]], "Dee Designer");
  const team = (await owner.post("/api/teams", { name: "Phoenix", projectTitle: "Campus Navigator", description: "Find rooms", maxSize, requiredSkills: ["C++", "Selenium", "Figma"] })).body.team;
  return { owner, tester, designer, team };
}

describe("Group Up teams", () => {
  it("creates a team with the owner as first member and analyses coverage", async () => {
    const { team } = await setup();
    expect(team.members).toHaveLength(1);
    expect(team.analysis.requiredSkillCoverage.percentage).toBe(33);
    expect(team.analysis.requiredSkillCoverage.missing).toEqual(["Figma", "Selenium"]); // alphabetical
  });

  it("suggests teammates who fill the gaps first", async () => {
    const { owner, team } = await setup();
    const res = await owner.get(`/api/teams/${team.id}/suggestions`);
    expect(res.body.candidates).toHaveLength(2);
    expect(res.body.candidates[0].fit.fillsSkills.length).toBe(1);
  });

  it("invites, prevents duplicates and lets the invitee accept", async () => {
    const { owner, tester, team } = await setup();
    const testerId = await idOf("tester@test.dev");
    const inv = await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: testerId, message: "Join us!" });
    expect(inv.status).toBe(201);
    const dup = await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: testerId });
    expect(dup.status).toBe(409);

    const inbox = (await tester.get("/api/teams")).body.invitations;
    expect(inbox).toHaveLength(1);
    const accepted = await tester.post(`/api/invitations/${inbox[0].id}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.team.members).toHaveLength(2);
    expect(accepted.body.team.analysis.requiredSkillCoverage.percentage).toBe(67);
    const ownerNotes = (await owner.get("/api/notifications")).body.notifications.map((n: { title: string }) => n.title);
    expect(ownerNotes).toContain("Invitation accepted");
  });

  it("enforces the team size limit (members + pending invitations)", async () => {
    const { owner, team } = await setup(2);
    const testerId = await idOf("tester@test.dev");
    const designerId = await idOf("designer@test.dev");
    expect((await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: testerId })).status).toBe(201);
    const full = await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: designerId });
    expect(full.status).toBe(400);
    expect(full.body.error.message).toMatch(/limited to 2/);
  });

  it("only the owner can invite, and non-members cannot view the team", async () => {
    const { tester, designer, team } = await setup();
    const designerId = await idOf("designer@test.dev");
    expect((await designer.get(`/api/teams/${team.id}`)).status).toBe(404);
    expect((await tester.post(`/api/teams/${team.id}/invitations`, { inviteeId: designerId })).status).toBe(404);
  });

  it("decline, leave and ownership transfer", async () => {
    const { owner, tester, designer, team } = await setup(5);
    await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: await idOf("tester@test.dev") });
    await owner.post(`/api/teams/${team.id}/invitations`, { inviteeId: await idOf("designer@test.dev") });
    const dInvite = (await designer.get("/api/teams")).body.invitations[0];
    expect((await designer.post(`/api/invitations/${dInvite.id}/decline`)).status).toBe(200);
    const tInvite = (await tester.get("/api/teams")).body.invitations[0];
    await tester.post(`/api/invitations/${tInvite.id}/accept`);

    expect((await owner.post(`/api/teams/${team.id}/leave`)).status).toBe(200);
    const view = await tester.get(`/api/teams/${team.id}`);
    expect(view.body.isOwner).toBe(true);
    expect(view.body.team.members).toHaveLength(1);
  });
});
