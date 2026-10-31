import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { applicationStatusHistory, notifications, users } from "../src/db/schema.js";
import { adminClient, futureDate, onboardedStudent, opportunityPayload, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function setup() {
  const admin = await adminClient();
  const student = await onboardedStudent("ajith@test.dev", [["C++", 90], ["DSA", 85], ["OOP", 80], ["Python", 70]]);
  const created = await admin.post("/api/admin/opportunities", opportunityPayload());
  expect(created.status).toBe(201);
  return { admin, student, opp: created.body.opportunity };
}

describe("opportunities and matching", () => {
  it("only admins can create opportunities", async () => {
    const student = await onboardedStudent("s@test.dev");
    expect((await student.post("/api/admin/opportunities", opportunityPayload())).status).toBe(403);
  });

  it("shows the student's real match: 3 of 4 = 75%", async () => {
    const { student, opp } = await setup();
    const res = await student.get(`/api/opportunities/${opp.id}`);
    expect(res.body.opportunity.match.percentage).toBe(75);
    expect(res.body.opportunity.match.missing.map((s: { name: string }) => s.name)).toEqual(["Git"]);
    expect(res.body.recommendedSkills).toEqual(["Git"]);
  });

  it("recalculates when the student adds a skill or the admin changes requirements", async () => {
    const { admin, student, opp } = await setup();
    await student.post("/api/profile/skills", { name: "Git", proficiency: 60 });
    expect((await student.get(`/api/opportunities/${opp.id}`)).body.opportunity.match.percentage).toBe(100);
    await admin.put(`/api/admin/opportunities/${opp.id}`, opportunityPayload({ requiredSkills: ["C++", "Rust"] }));
    expect((await student.get(`/api/opportunities/${opp.id}`)).body.opportunity.match.percentage).toBe(50);
  });

  it("hides unpublished and supports search, filters and sorting", async () => {
    const { admin, student } = await setup();
    await admin.post("/api/admin/opportunities", opportunityPayload({ title: "Secret Draft", isPublished: false }));
    await admin.post("/api/admin/opportunities", opportunityPayload({ title: "AI Hackathon", organization: "Campus AI Club", type: "HACKATHON", requiredSkills: ["Python", "ML"], deadline: futureDate(3) }));
    const all = (await student.get("/api/opportunities")).body.opportunities;
    expect(all.map((o: { title: string }) => o.title)).not.toContain("Secret Draft");
    expect(all[0].match.percentage).toBeGreaterThanOrEqual(all[1].match.percentage); // default sort = best match
    expect((await student.get("/api/opportunities?type=HACKATHON")).body.total).toBe(1);
    expect((await student.get("/api/opportunities?skill=ml")).body.opportunities[0].title).toBe("AI Hackathon");
    expect((await student.get("/api/opportunities?q=technova")).body.total).toBe(1);
    expect((await student.get("/api/opportunities?deadline=7")).body.total).toBe(1);
  });

  it("notifies students who are a strong match when an opportunity is published", async () => {
    const admin = await adminClient();
    await onboardedStudent("match@test.dev", [["C++", 90], ["DSA", 85], ["OOP", 80]]);
    const res = await admin.post("/api/admin/opportunities", opportunityPayload());
    expect(res.body.notifiedStudents).toBe(1);
    const [student] = await db.select().from(users).where(eq(users.email, "match@test.dev"));
    const rows = await db.select().from(notifications).where(eq(notifications.userId, student.id));
    expect(rows.some((n) => n.type === "OPPORTUNITY_MATCH")).toBe(true);
  });
});

describe("applications", () => {
  it("applies once, records history and sends a notification", async () => {
    const { student, opp } = await setup();
    const res = await student.post(`/api/opportunities/${opp.id}/apply`, { coverNote: "Excited to apply" });
    expect(res.status).toBe(201);
    const dup = await student.post(`/api/opportunities/${opp.id}/apply`, {});
    expect(dup.status).toBe(409);
    const history = await db.select().from(applicationStatusHistory).where(eq(applicationStatusHistory.applicationId, res.body.application.id));
    expect(history.map((h) => h.toStatus)).toEqual(["APPLIED"]);
    const notes = (await student.get("/api/notifications")).body.notifications;
    expect(notes.some((n: { type: string }) => n.type === "APPLICATION_SUBMITTED")).toBe(true);
  });

  it("rejects applications after the deadline or to unpublished opportunities", async () => {
    const admin = await adminClient();
    const student = await onboardedStudent("s@test.dev");
    const closed = (await admin.post("/api/admin/opportunities", opportunityPayload({ deadline: new Date(Date.now() - 86_400_000).toISOString() }))).body.opportunity;
    expect((await student.post(`/api/opportunities/${closed.id}/apply`, {})).status).toBe(400);
    const draft = (await admin.post("/api/admin/opportunities", opportunityPayload({ isPublished: false }))).body.opportunity;
    expect((await student.post(`/api/opportunities/${draft.id}/apply`, {})).status).toBe(404);
  });

  it("only admins change statuses; every change is tracked and notified", async () => {
    const { admin, student, opp } = await setup();
    const appId = (await student.post(`/api/opportunities/${opp.id}/apply`, {})).body.application.id;

    // the student has no way to shortlist or select themselves
    expect((await student.patch(`/api/admin/applications/${appId}/status`, { status: "SELECTED" })).status).toBe(403);

    expect((await admin.patch(`/api/admin/applications/${appId}/status`, { status: "SHORTLISTED" })).status).toBe(200);
    expect((await admin.patch(`/api/admin/applications/${appId}/status`, { status: "INTERVIEW", note: "Monday 10am" })).status).toBe(200);

    const mine = (await student.get(`/api/applications/${appId}`)).body.application;
    expect(mine.status).toBe("INTERVIEW");
    expect(mine.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(["APPLIED", "SHORTLISTED", "INTERVIEW"]);
    const notes = (await student.get("/api/notifications")).body.notifications.map((n: { title: string }) => n.title);
    expect(notes).toContain("Application shortlisted");
    expect(notes).toContain("Interview scheduled");
  });

  it("students can withdraw, after which admins cannot change the status", async () => {
    const { admin, student, opp } = await setup();
    const appId = (await student.post(`/api/opportunities/${opp.id}/apply`, {})).body.application.id;
    expect((await student.post(`/api/applications/${appId}/withdraw`)).body.application.status).toBe("WITHDRAWN");
    expect((await admin.patch(`/api/admin/applications/${appId}/status`, { status: "SELECTED" })).status).toBe(400);
  });

  it("students cannot see other students' applications", async () => {
    const { student, opp } = await setup();
    const appId = (await student.post(`/api/opportunities/${opp.id}/apply`, {})).body.application.id;
    const other = await onboardedStudent("other@test.dev");
    expect((await other.get(`/api/applications/${appId}`)).status).toBe(404);
    expect((await other.get("/api/applications")).body.applications).toEqual([]);
  });

  it("admin sees applicants with their match scores", async () => {
    const { admin, student, opp } = await setup();
    await student.post(`/api/opportunities/${opp.id}/apply`, {});
    const res = await admin.get(`/api/admin/opportunities/${opp.id}/applicants`);
    expect(res.body.applicants[0].matchPercentage).toBe(75);
    expect(res.body.applicants[0].missingSkills).toEqual(["Git"]);
  });
});
