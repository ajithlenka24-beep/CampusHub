import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { applicationStatusHistory, applications, opportunities, opportunityType, workMode } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded, requireStudent } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { logActivity } from "../services/activity.js";
import { normalizeSkill } from "../services/skillNormalizer.js";
import { getOpportunityMatches, type OpportunityMatch } from "../services/studentData.js";
import { notify } from "../services/notifications.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { daysUntil } from "../utils/dates.js";
import { optionalText, uuidParam } from "../validators/common.js";

const listQuery = z.object({
  q: z.string().trim().max(100).optional().default(""),
  type: z.enum(opportunityType.enumValues).optional(),
  workMode: z.enum(workMode.enumValues).optional(),
  skill: z.string().trim().max(60).optional().default(""),
  deadline: z.enum(["7", "30", "all"]).optional().default("all"),
  sort: z.enum(["newest", "deadline", "match"]).optional().default("match"),
  includeClosed: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

/** Shape sent to the browser for one opportunity, including the student's match. */
export function serializeMatch(m: OpportunityMatch) {
  return {
    id: m.id,
    title: m.title,
    organization: m.organization,
    description: m.description,
    type: m.type,
    eligibility: m.eligibility,
    location: m.location,
    workMode: m.workMode,
    deadline: m.deadline,
    applicationUrl: m.applicationUrl,
    createdAt: m.createdAt,
    isOpen: m.isOpen,
    daysLeft: daysUntil(m.deadline),
    requiredSkills: m.requiredSkills,
    match: {
      percentage: m.match.percentage,
      matched: m.match.matched,
      missing: m.match.missing,
      requiredCount: m.match.requiredCount,
      formula: `${m.match.matched.length} matched ÷ ${m.match.requiredCount} required × 100 = ${m.match.percentage}%`,
    },
    application: m.application,
  };
}

export function opportunitiesRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent);

  /** Browse, search, filter and sort published opportunities. */
  router.get("/", async (req, res) => {
    const me = currentUser(req);
    const query = parse(listQuery, req.query);
    let list = await getOpportunityMatches(db, me.id, { onlyOpen: !query.includeClosed });

    if (query.q) {
      const q = query.q.toLowerCase();
      list = list.filter((o) => `${o.title} ${o.organization} ${o.description} ${o.location}`.toLowerCase().includes(q));
    }
    if (query.type) list = list.filter((o) => o.type === query.type);
    if (query.workMode) list = list.filter((o) => o.workMode === query.workMode);
    if (query.skill) {
      const wanted = normalizeSkill(query.skill);
      list = list.filter((o) => o.requiredSkills.some((s) => normalizeSkill(s.name) === wanted));
    }
    if (query.deadline !== "all") {
      const days = Number(query.deadline);
      list = list.filter((o) => o.isOpen && daysUntil(o.deadline) <= days);
    }

    list.sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      if (query.sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
      if (query.sort === "deadline") return a.deadline.getTime() - b.deadline.getTime();
      return b.match.percentage - a.match.percentage || a.deadline.getTime() - b.deadline.getTime();
    });

    res.json({ opportunities: list.map(serializeMatch), total: list.length });
  });

  router.get("/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const all = await getOpportunityMatches(db, me.id);
    const found = all.find((o) => o.id === id);
    if (!found) throw notFound("Opportunity not found.");
    res.json({
      opportunity: serializeMatch(found),
      // what to learn next for THIS opportunity, in the order the employer listed them
      recommendedSkills: found.match.missing.map((s) => s.name),
    });
  });

  /** Apply: checks publication, deadline and duplicates, then records history + notification. */
  router.post("/:id/apply", requireOnboarded, async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { coverNote } = parse(z.object({ coverNote: optionalText(1500, "Cover note") }), req.body ?? {});

    const all = await getOpportunityMatches(db, me.id);
    const opp = all.find((o) => o.id === id);
    if (!opp) throw notFound("Opportunity not found.");
    if (opp.application) throw conflict("You have already applied to this opportunity.", "ALREADY_APPLIED");
    if (!opp.isOpen) throw badRequest("This opportunity is no longer accepting applications.");

    const application = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(applications)
        .values({ userId: me.id, opportunityId: id, coverNote, matchScoreAtApply: opp.match.percentage })
        .returning();
      await tx.insert(applicationStatusHistory).values({ applicationId: created.id, fromStatus: null, toStatus: "APPLIED", changedById: me.id, note: "Application submitted" });
      await notify(tx, me.id, {
        type: "APPLICATION_SUBMITTED",
        title: "Application submitted",
        message: `Your application for ${opp.title} at ${opp.organization} was submitted successfully.`,
        link: "/applications",
      });
      return created;
    });
    await logActivity(db, { actorId: me.id, action: "APPLICATION_SUBMITTED", entityType: "application", entityId: application.id, details: { opportunity: opp.title } });
    res.status(201).json({ application });
  });

  return router;
}

/* =================================================================== student applications */
export function applicationsRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent);

  async function loadMyApplications(userId: string, applicationId?: string) {
    const filters = [eq(applications.userId, userId)];
    if (applicationId) filters.push(eq(applications.id, applicationId));
    const rows = await db
      .select({
        id: applications.id,
        status: applications.status,
        coverNote: applications.coverNote,
        matchScoreAtApply: applications.matchScoreAtApply,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        opportunity: {
          id: opportunities.id,
          title: opportunities.title,
          organization: opportunities.organization,
          type: opportunities.type,
          deadline: opportunities.deadline,
          location: opportunities.location,
          workMode: opportunities.workMode,
        },
      })
      .from(applications)
      .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
      .where(and(...filters))
      .orderBy(desc(applications.createdAt));

    const history = rows.length
      ? await db
          .select()
          .from(applicationStatusHistory)
          .where(inArray(applicationStatusHistory.applicationId, rows.map((r) => r.id)))
          .orderBy(applicationStatusHistory.createdAt)
      : [];
    return rows.map((r) => ({
      ...r,
      history: history
        .filter((h) => h.applicationId === r.id)
        .map((h) => ({ id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })),
    }));
  }

  router.get("/", async (req, res) => {
    res.json({ applications: await loadMyApplications(currentUser(req).id) });
  });

  router.get("/:id", async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [application] = await loadMyApplications(currentUser(req).id, id);
    if (!application) throw notFound("Application not found.");
    res.json({ application });
  });

  /**
   * The ONLY status change a student can make is withdrawing their own application.
   * Shortlisting, interviews and selection are set by administrators.
   */
  router.post("/:id/withdraw", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const [app] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, me.id)));
    if (!app) throw notFound("Application not found.");
    if (!["APPLIED", "SHORTLISTED", "INTERVIEW"].includes(app.status)) throw badRequest(`An application that is ${app.status.toLowerCase()} cannot be withdrawn.`);
    await db.transaction(async (tx) => {
      await tx.update(applications).set({ status: "WITHDRAWN" }).where(eq(applications.id, id));
      await tx.insert(applicationStatusHistory).values({ applicationId: id, fromStatus: app.status, toStatus: "WITHDRAWN", changedById: me.id, note: "Withdrawn by student" });
    });
    const [application] = await loadMyApplications(me.id, id);
    res.json({ application });
  });

  return router;
}
