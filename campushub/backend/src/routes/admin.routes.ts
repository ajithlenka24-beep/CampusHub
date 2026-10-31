import { Router } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  activityLogs,
  applicationStatus,
  applicationStatusHistory,
  applications,
  opportunities,
  opportunitySkills,
  opportunityType,
  studentProfiles,
  teamMembers,
  teams,
  users,
  workMode,
  type ApplicationStatus,
} from "../db/schema.js";
import { currentUser, requireAdmin, requireAuth } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { logActivity } from "../services/activity.js";
import { notifyMatchingStudents } from "../services/alerts.js";
import { calculateMatch } from "../services/engines.js";
import { notify, notifyMany } from "../services/notifications.js";
import { loadTeam } from "../services/people.js";
import { getOrCreateSkills } from "../services/skills.js";
import { destroyAllSessions } from "../services/sessions.js";
import { getPortfolioCounts, getProfileCompletion, getStudentSkills, loadOpportunities } from "../services/studentData.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { optionalText, optionalUrl, text, uuidParam } from "../validators/common.js";

const opportunitySchema = z.object({
  title: text(3, 140, "Title"),
  organization: text(2, 120, "Organization"),
  description: text(20, 5000, "Description"),
  type: z.enum(opportunityType.enumValues, { error: "Choose an opportunity type." }),
  eligibility: optionalText(1000, "Eligibility"),
  location: optionalText(120, "Location"),
  workMode: z.enum(workMode.enumValues, { error: "Choose a work mode." }),
  deadline: z.coerce.date({ error: "Enter a valid deadline." }),
  applicationUrl: optionalUrl("Application link"),
  isPublished: z.boolean().optional().default(true),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).min(1, "Add at least one required skill.").max(20, "Up to 20 required skills."),
});

const STATUS_MESSAGES: Partial<Record<ApplicationStatus, (title: string) => { title: string; message: string }>> = {
  SHORTLISTED: (t) => ({ title: "Application shortlisted", message: `Good news! Your application for ${t} was shortlisted.` }),
  INTERVIEW: (t) => ({ title: "Interview scheduled", message: `An interview has been scheduled for your ${t} application.` }),
  SELECTED: (t) => ({ title: "You were selected", message: `Congratulations! You were selected for ${t}.` }),
  REJECTED: (t) => ({ title: "Application update", message: `Your application for ${t} was not selected this time. Keep going!` }),
  APPLIED: (t) => ({ title: "Application update", message: `Your application for ${t} was moved back to Applied.` }),
};

const listQuery = z.object({
  q: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});

async function serializeOpportunity(id: string) {
  const [opp] = await loadOpportunities(db, eq(opportunities.id, id));
  if (!opp) return null;
  const [apps] = await db.select({ n: count() }).from(applications).where(eq(applications.opportunityId, id));
  return { ...opp, applicationCount: Number(apps?.n ?? 0) };
}

export function adminRouter() {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  /* ------------------------------------------------------------ overview */
  router.get("/stats", async (_req, res) => {
    const total = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
    const [students, opps, published, apps, teamCount] = await Promise.all([
      total(db.select({ n: count() }).from(users).where(eq(users.role, "STUDENT"))),
      total(db.select({ n: count() }).from(opportunities)),
      total(db.select({ n: count() }).from(opportunities).where(eq(opportunities.isPublished, true))),
      total(db.select({ n: count() }).from(applications)),
      total(db.select({ n: count() }).from(teams)),
    ]);
    const byStatus = await db.select({ status: applications.status, n: count() }).from(applications).groupBy(applications.status);
    const recentActivity = await db
      .select({ id: activityLogs.id, action: activityLogs.action, entityType: activityLogs.entityType, details: activityLogs.details, createdAt: activityLogs.createdAt, actorName: users.fullName })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.actorId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(12);
    res.json({
      totals: { students, opportunities: opps, publishedOpportunities: published, applications: apps, teams: teamCount },
      applicationsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
      recentActivity,
    });
  });

  router.get("/activity", async (req, res) => {
    const { page, pageSize } = parse(listQuery, req.query);
    const rows = await db
      .select({ id: activityLogs.id, action: activityLogs.action, entityType: activityLogs.entityType, entityId: activityLogs.entityId, details: activityLogs.details, isAdminAction: activityLogs.isAdminAction, createdAt: activityLogs.createdAt, actorName: users.fullName, actorEmail: users.email })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.actorId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    res.json({ activity: rows, page });
  });

  /* ------------------------------------------------------------ students */
  router.get("/students", async (req, res) => {
    const { q, page, pageSize } = parse(listQuery, req.query);
    const filters: SQL[] = [eq(users.role, "STUDENT")];
    if (q) filters.push(or(ilike(users.fullName, `%${q}%`), ilike(users.email, `%${q}%`), ilike(studentProfiles.college, `%${q}%`))!);
    const where = and(...filters);
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        isActive: users.isActive,
        onboardingCompleted: users.onboardingCompleted,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        college: studentProfiles.college,
        course: studentProfiles.course,
        semester: studentProfiles.semester,
      })
      .from(users)
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await db.select({ n: count() }).from(users).leftJoin(studentProfiles, eq(studentProfiles.userId, users.id)).where(where);
    res.json({ students: rows, total: Number(totalRow?.n ?? 0), page, pageSize });
  });

  router.get("/students/:id", async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [student] = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email, isActive: users.isActive, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, onboardingCompleted: users.onboardingCompleted, profile: studentProfiles })
      .from(users)
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(and(eq(users.id, id), eq(users.role, "STUDENT")));
    if (!student) throw notFound("Student not found.");
    const [skillsList, counts, completion, apps] = await Promise.all([
      getStudentSkills(db, id),
      getPortfolioCounts(db, id),
      getProfileCompletion(db, id),
      db
        .select({ id: applications.id, status: applications.status, createdAt: applications.createdAt, title: opportunities.title })
        .from(applications)
        .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
        .where(eq(applications.userId, id))
        .orderBy(desc(applications.createdAt)),
    ]);
    res.json({ student, skills: skillsList, counts, completion, applications: apps });
  });

  router.patch("/students/:id", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    const [updated] = await db
      .update(users)
      .set({ isActive })
      .where(and(eq(users.id, id), eq(users.role, "STUDENT")))
      .returning({ id: users.id, isActive: users.isActive, fullName: users.fullName });
    if (!updated) throw notFound("Student not found.");
    if (!isActive) await destroyAllSessions(id); // deactivated accounts are logged out immediately
    await logActivity(db, { actorId: admin.id, action: isActive ? "STUDENT_ACTIVATED" : "STUDENT_DEACTIVATED", entityType: "user", entityId: id, details: { name: updated.fullName }, isAdminAction: true });
    res.json({ student: updated });
  });

  /* ------------------------------------------------------------ opportunities */
  router.get("/opportunities", async (req, res) => {
    const { q } = parse(listQuery, req.query);
    const where = q ? or(ilike(opportunities.title, `%${q}%`), ilike(opportunities.organization, `%${q}%`)) : undefined;
    const list = await loadOpportunities(db, where);
    const counts = list.length
      ? await db.select({ id: applications.opportunityId, n: count() }).from(applications).where(inArray(applications.opportunityId, list.map((o) => o.id))).groupBy(applications.opportunityId)
      : [];
    const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
    res.json({ opportunities: list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((o) => ({ ...o, applicationCount: byId.get(o.id) ?? 0 })) });
  });

  router.post("/opportunities", async (req, res) => {
    const admin = currentUser(req);
    const { requiredSkills, ...data } = parse(opportunitySchema, req.body);
    const id = await db.transaction(async (tx) => {
      const [created] = await tx.insert(opportunities).values({ ...data, createdById: admin.id }).returning({ id: opportunities.id });
      const refs = await getOrCreateSkills(tx, requiredSkills);
      await tx.insert(opportunitySkills).values(refs.map((r) => ({ opportunityId: created.id, skillId: r.id })));
      return created.id;
    });
    const notified = data.isPublished ? await notifyMatchingStudents(db, id) : 0;
    await logActivity(db, { actorId: admin.id, action: "OPPORTUNITY_CREATED", entityType: "opportunity", entityId: id, details: { title: data.title }, isAdminAction: true });
    res.status(201).json({ opportunity: await serializeOpportunity(id), notifiedStudents: notified });
  });

  router.put("/opportunities/:id", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { requiredSkills, ...data } = parse(opportunitySchema, req.body);
    const [existing] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, id));
    if (!existing) throw notFound("Opportunity not found.");
    await db.transaction(async (tx) => {
      await tx.update(opportunities).set(data).where(eq(opportunities.id, id));
      await tx.delete(opportunitySkills).where(eq(opportunitySkills.opportunityId, id));
      const refs = await getOrCreateSkills(tx, requiredSkills);
      await tx.insert(opportunitySkills).values(refs.map((r) => ({ opportunityId: id, skillId: r.id })));
    });
    // requirements may have changed: match scores are recalculated live, and new strong matches are notified
    const notified = await notifyMatchingStudents(db, id);
    await logActivity(db, { actorId: admin.id, action: "OPPORTUNITY_UPDATED", entityType: "opportunity", entityId: id, details: { title: data.title }, isAdminAction: true });
    res.json({ opportunity: await serializeOpportunity(id), notifiedStudents: notified });
  });

  router.patch("/opportunities/:id/publish", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { isPublished } = parse(z.object({ isPublished: z.boolean() }), req.body);
    const [updated] = await db.update(opportunities).set({ isPublished }).where(eq(opportunities.id, id)).returning({ id: opportunities.id, title: opportunities.title });
    if (!updated) throw notFound("Opportunity not found.");
    const notified = isPublished ? await notifyMatchingStudents(db, id) : 0;
    await logActivity(db, { actorId: admin.id, action: isPublished ? "OPPORTUNITY_PUBLISHED" : "OPPORTUNITY_UNPUBLISHED", entityType: "opportunity", entityId: id, details: { title: updated.title }, isAdminAction: true });
    res.json({ opportunity: await serializeOpportunity(id), notifiedStudents: notified });
  });

  router.delete("/opportunities/:id", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const applicants = await db.select({ userId: applications.userId }).from(applications).where(eq(applications.opportunityId, id));
    const [deleted] = await db.delete(opportunities).where(eq(opportunities.id, id)).returning({ title: opportunities.title });
    if (!deleted) throw notFound("Opportunity not found.");
    await notifyMany(db, applicants.map((a) => a.userId), { type: "APPLICATION_STATUS", title: "Opportunity removed", message: `${deleted.title} was removed by the administrators, so your application was closed.`, link: "/applications" });
    await logActivity(db, { actorId: admin.id, action: "OPPORTUNITY_DELETED", entityType: "opportunity", entityId: id, details: { title: deleted.title }, isAdminAction: true });
    res.status(204).end();
  });

  router.get("/opportunities/:id/applicants", async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [opp] = await loadOpportunities(db, eq(opportunities.id, id));
    if (!opp) throw notFound("Opportunity not found.");
    const rows = await db
      .select({ id: applications.id, status: applications.status, coverNote: applications.coverNote, createdAt: applications.createdAt, userId: users.id, fullName: users.fullName, email: users.email, college: studentProfiles.college, course: studentProfiles.course })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(eq(applications.opportunityId, id))
      .orderBy(desc(applications.createdAt));
    const applicants = [];
    for (const row of rows) {
      const owned = await getStudentSkills(db, row.userId);
      const match = calculateMatch(owned.map((s) => ({ id: s.skillId, name: s.name })), opp.requiredSkills);
      applicants.push({ ...row, matchPercentage: match.percentage, missingSkills: match.missing.map((s) => s.name) });
    }
    res.json({ opportunity: { id: opp.id, title: opp.title, organization: opp.organization, requiredSkills: opp.requiredSkills }, applicants });
  });

  /* ------------------------------------------------------------ applications */
  router.get("/applications", async (req, res) => {
    const query = parse(listQuery.extend({ status: z.enum(applicationStatus.enumValues).optional() }), req.query);
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(applications.status, query.status));
    if (query.q) filters.push(or(ilike(users.fullName, `%${query.q}%`), ilike(opportunities.title, `%${query.q}%`), ilike(opportunities.organization, `%${query.q}%`))!);
    const rows = await db
      .select({
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        matchScoreAtApply: applications.matchScoreAtApply,
        studentId: users.id,
        studentName: users.fullName,
        studentEmail: users.email,
        opportunityId: opportunities.id,
        opportunityTitle: opportunities.title,
        organization: opportunities.organization,
      })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(applications.updatedAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    res.json({ applications: rows, page: query.page });
  });

  router.get("/applications/:id", async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [app] = await db
      .select({ id: applications.id, status: applications.status, coverNote: applications.coverNote, createdAt: applications.createdAt, studentName: users.fullName, studentEmail: users.email, opportunityTitle: opportunities.title, organization: opportunities.organization })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.id, id));
    if (!app) throw notFound("Application not found.");
    const history = await db
      .select({ id: applicationStatusHistory.id, fromStatus: applicationStatusHistory.fromStatus, toStatus: applicationStatusHistory.toStatus, note: applicationStatusHistory.note, createdAt: applicationStatusHistory.createdAt, changedBy: users.fullName })
      .from(applicationStatusHistory)
      .leftJoin(users, eq(users.id, applicationStatusHistory.changedById))
      .where(eq(applicationStatusHistory.applicationId, id))
      .orderBy(asc(applicationStatusHistory.createdAt));
    res.json({ application: { ...app, history } });
  });

  /** Admin-only status changes. Each change is stored in the history and notifies the student. */
  router.patch("/applications/:id/status", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(
      z.object({ status: z.enum(["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED"], { error: "Choose a valid status." }), note: optionalText(500, "Note") }),
      req.body,
    );
    const [app] = await db
      .select({ id: applications.id, status: applications.status, userId: applications.userId, title: opportunities.title })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.id, id));
    if (!app) throw notFound("Application not found.");
    if (app.status === "WITHDRAWN") throw badRequest("The student withdrew this application, so its status can no longer change.");
    if (app.status === data.status) throw badRequest(`The application is already ${data.status.toLowerCase()}.`);

    await db.transaction(async (tx) => {
      await tx.update(applications).set({ status: data.status }).where(eq(applications.id, id));
      await tx.insert(applicationStatusHistory).values({ applicationId: id, fromStatus: app.status, toStatus: data.status, changedById: admin.id, note: data.note });
      const msg = STATUS_MESSAGES[data.status]?.(app.title);
      if (msg) await notify(tx, app.userId, { type: "APPLICATION_STATUS", title: msg.title, message: data.note ? `${msg.message} Note: ${data.note}` : msg.message, link: "/applications" });
    });
    await logActivity(db, { actorId: admin.id, action: "APPLICATION_STATUS_CHANGED", entityType: "application", entityId: id, details: { from: app.status, to: data.status, opportunity: app.title }, isAdminAction: true });
    res.json({ application: { id, status: data.status } });
  });

  /* ------------------------------------------------------------ teams */
  router.get("/teams", async (_req, res) => {
    const rows = await db
      .select({ id: teams.id, name: teams.name, projectTitle: teams.projectTitle, maxSize: teams.maxSize, createdAt: teams.createdAt, ownerName: users.fullName })
      .from(teams)
      .innerJoin(users, eq(users.id, teams.ownerId))
      .orderBy(desc(teams.createdAt));
    const result = [];
    for (const row of rows) {
      const team = await loadTeam(db, row.id);
      result.push({ ...row, memberCount: team?.members.length ?? 0, coverage: team?.analysis.coverage ?? 0, readiness: team?.analysis.readiness ?? 0, members: team?.members.map((m) => m.fullName) ?? [] });
    }
    res.json({ teams: result });
  });

  router.delete("/teams/:id", async (req, res) => {
    const admin = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, id));
    const [deleted] = await db.delete(teams).where(eq(teams.id, id)).returning({ name: teams.name });
    if (!deleted) throw notFound("Team not found.");
    await notifyMany(db, members.map((m) => m.userId), { type: "TEAM_UPDATE", title: "Team removed", message: `${deleted.name} was removed by an administrator.`, link: "/teams" });
    await logActivity(db, { actorId: admin.id, action: "TEAM_DELETED", entityType: "team", entityId: id, details: { name: deleted.name }, isAdminAction: true });
    res.status(204).end();
  });

  return router;
}
