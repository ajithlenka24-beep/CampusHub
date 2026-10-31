import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { applications, opportunities, studentProfiles, users } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded, requireStudent } from "../middleware/auth.js";
import { ensureDeadlineReminders } from "../services/alerts.js";
import { computeCareerMetrics, latestSnapshots, ruleBasedRecommendations } from "../services/career.js";
import { proficiencyLevel } from "../services/skillNormalizer.js";
import { getOpportunityMatches, getPortfolioCounts } from "../services/studentData.js";
import { daysUntil } from "../utils/dates.js";
import { serializeMatch } from "./opportunities.routes.js";
import { unreadCount } from "./notifications.routes.js";

/** Everything on the student dashboard, computed from the student's own records. */
export function dashboardRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent, requireOnboarded);

  router.get("/", async (req, res) => {
    const me = currentUser(req);
    await ensureDeadlineReminders(db, me.id);

    const [[profile], counts, matches, metrics, recent, snapshots] = await Promise.all([
      db
        .select({ fullName: users.fullName, avatarUrl: studentProfiles.avatarUrl, college: studentProfiles.college, course: studentProfiles.course, semester: studentProfiles.semester })
        .from(users)
        .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
        .where(eq(users.id, me.id)),
      getPortfolioCounts(db, me.id),
      getOpportunityMatches(db, me.id, { onlyOpen: true }),
      computeCareerMetrics(db, me.id),
      db
        .select({ id: applications.id, status: applications.status, updatedAt: applications.updatedAt, createdAt: applications.createdAt, title: opportunities.title, organization: opportunities.organization })
        .from(applications)
        .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
        .where(eq(applications.userId, me.id))
        .orderBy(desc(applications.updatedAt))
        .limit(5),
      latestSnapshots(db, me.id, 1),
    ]);

    const recommended = [...matches]
      .filter((m) => !m.application)
      .sort((a, b) => b.match.percentage - a.match.percentage || a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 4)
      .map(serializeMatch);

    // applied or well-matched opportunities closing in the next 14 days
    const upcomingDeadlines = matches
      .filter((m) => daysUntil(m.deadline) <= 14 && (m.application || m.match.percentage >= 50))
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5)
      .map((m) => ({ id: m.id, title: m.title, organization: m.organization, deadline: m.deadline, daysLeft: daysUntil(m.deadline), applied: Boolean(m.application), match: m.match.percentage }));

    const recommendations = snapshots[0]?.aiSummary ? (JSON.parse(snapshots[0].aiSummary) as string[]) : ruleBasedRecommendations(metrics);

    res.json({
      profile,
      completion: metrics.completion,
      stats: counts,
      skills: metrics.skills.map((s) => ({ ...s, level: proficiencyLevel(s.proficiency) })),
      recommended,
      recentApplications: recent,
      upcomingDeadlines,
      career: { overall: metrics.overall, band: metrics.band, parts: metrics.parts, recommendations: recommendations.slice(0, 3), source: snapshots[0]?.aiProvider || "rules" },
      unreadNotifications: await unreadCount(me.id),
    });
  });

  return router;
}
