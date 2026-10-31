import { Router, type RequestHandler } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { careerGoals } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded, requireStudent } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { buildStudentContext, generateCareerSummary } from "../services/ai/assistant.js";
import { aiStatus } from "../services/ai/provider.js";
import { computeCareerMetrics, ensureWeeklyGoals, latestSnapshots, ruleBasedRecommendations, saveSnapshot } from "../services/career.js";
import { notFound } from "../utils/httpError.js";
import { weekStart } from "../utils/dates.js";
import { uuidParam } from "../validators/common.js";

export function careerRouter(aiLimiter: RequestHandler) {
  const router = Router();
  router.use(requireAuth, requireStudent, requireOnboarded);

  /** Measured metrics (live), this week's goals, history and the latest written recommendations. */
  router.get("/", async (req, res) => {
    const me = currentUser(req);
    const metrics = await computeCareerMetrics(db, me.id);
    const goals = await ensureWeeklyGoals(db, me.id, metrics);
    const snapshots = await latestSnapshots(db, me.id, 12);
    const latest = snapshots[0];
    const recommendations = latest?.aiSummary ? JSON.parse(latest.aiSummary) as string[] : ruleBasedRecommendations(metrics);
    res.json({
      metrics,
      goals: goals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      history: snapshots.reverse().map((s) => ({ date: s.createdAt, overall: s.overallScore, skills: s.skillScore, profile: s.profileScore, portfolio: s.portfolioScore })),
      recommendations: {
        items: recommendations,
        source: latest?.aiProvider || "rules",
        generatedAt: latest?.createdAt ?? null,
      },
      ai: aiStatus(),
    });
  });

  /** Re-runs the analysis: saves a progress snapshot and asks the AI (if configured) for fresh advice. */
  router.post("/refresh", aiLimiter, async (req, res) => {
    const me = currentUser(req);
    const context = await buildStudentContext(db, me.id);
    const summary = await generateCareerSummary(context);
    await saveSnapshot(db, me.id, context.metrics, JSON.stringify(summary.recommendations), summary.provider);
    res.json({ recommendations: { items: summary.recommendations, source: summary.provider, generatedAt: new Date() } });
  });

  router.patch("/goals/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { status } = parse(z.object({ status: z.enum(["OPEN", "DONE"]) }), req.body);
    const [goal] = await db
      .update(careerGoals)
      .set({ status, completedAt: status === "DONE" ? new Date() : null })
      .where(and(eq(careerGoals.id, id), eq(careerGoals.userId, me.id)))
      .returning();
    if (!goal) throw notFound("Goal not found.");
    res.json({ goal });
  });

  /** Past weeks' goals, so students can see what they completed. */
  router.get("/goals/history", async (req, res) => {
    const me = currentUser(req);
    const rows = await db.select().from(careerGoals).where(eq(careerGoals.userId, me.id)).orderBy(desc(careerGoals.weekStart), asc(careerGoals.createdAt)).limit(60);
    res.json({ goals: rows.filter((g) => g.weekStart !== weekStart()) });
  });

  return router;
}
